const { Markup } = require('telegraf');
const { extractJsonObject } = require('../utils/jsonExtract');
const { todayIsoRiyadh } = require('../utils/dateRiyadh');
const { askGemini, subjectLabel } = require('../services/gemini');
const {
  insertDiagnosticTest,
  getDailyChallengeByDate,
  getChallengeAnswerForUser,
  insertChallengeAnswer,
  listTopChallengeUsersSince,
  listChallengeTopForDate,
  getStudentNamesByTelegramIds,
} = require('../services/supabase');
const { studentMainKeyboard, quizSubjectsKeyboard } = require('./student');

function diagnosticSubjectsKeyboard() {
  const kb = quizSubjectsKeyboard();
  const src = kb.reply_markup?.inline_keyboard || [];
  const mapped = src.map((row) =>
    row.map((btn) => {
      const data = String(btn.callback_data || '');
      const m = data.match(/^quiz:sub:([a-z_]+)$/);
      if (m) return { ...btn, callback_data: `diag:sub:${m[1]}` };
      if (data === 'quiz:home') return { ...btn, callback_data: 'diag:home' };
      return btn;
    })
  );
  return Markup.inlineKeyboard(mapped);
}

function challengeAnswerKeyboard(options) {
  const opts = Array.isArray(options) ? options.slice(0, 4) : [];
  const rows = opts.map((t, i) => [
    Markup.button.callback(String(t).slice(0, 60), `chall:ans:${i}`),
  ]);
  rows.push([Markup.button.callback('🏠 القائمة', 'chall:home')]);
  return Markup.inlineKeyboard(rows);
}

function diagnosticAnswerKeyboard(options) {
  const opts = Array.isArray(options) ? options.slice(0, 4) : [];
  const rows = opts.map((t, i) => [
    Markup.button.callback(String(t).slice(0, 60), `diag:ans:${i}`),
  ]);
  rows.push([Markup.button.callback('🏠 إيقاف', 'diag:home')]);
  return Markup.inlineKeyboard(rows);
}

function normalizeQuestionsPayload(obj) {
  const raw = Array.isArray(obj?.questions) ? obj.questions : [];
  const out = [];
  for (const it of raw.slice(0, 10)) {
    const q = String(it?.question || '').trim();
    const options = Array.isArray(it?.options) ? it.options.map((x) => String(x)) : [];
    const correctIndex = Number(it?.correctIndex);
    if (!q || options.length !== 4 || correctIndex < 0 || correctIndex > 3) continue;
    out.push({ question: q, options, correctIndex, explanation: String(it?.explanation || '').trim() });
  }
  return out;
}

async function generateTenDiagnosticQuestions(subjectKey) {
  const subjectName = subjectLabel(subjectKey);
  const prompt = [
    'أنت منشئ أسئلة تعليمية بالعربية.',
    `المادة: ${subjectName}.`,
    'أنشئ 10 أسئلة اختيار من متعدد للمراجعة.',
    'أخرج JSON فقط بدون أي نص آخر.',
    'الشكل:',
    '{"questions":[{"question":"...","options":["أ","ب","ج","د"],"correctIndex":0,"explanation":"سطر مختصر"}, ...]}',
    'شروط:',
    '- يجب أن يكون عدد questions = 10 بالضبط.',
    '- كل options أربعة عناصر.',
    '- correctIndex من 0 إلى 3.',
  ].join('\n');

  const raw = await askGemini({
    subjectKey,
    question: prompt,
    history: [],
    style: 'short',
  });
  const obj = extractJsonObject(raw);
  if (!obj) throw new Error('diag_json');
  const items = normalizeQuestionsPayload(obj);
  if (items.length !== 10) throw new Error('diag_count');
  return items;
}

async function summarizeWeakPoints(subjectKey, wrongHints) {
  const hints = (wrongHints || []).filter(Boolean).slice(0, 10);
  if (!hints.length) return 'لم تُسجّل أخطاء — أحسنت!';
  const prompt = [
    'بناءً على الأسئلة التالية التي أخطأ فيها الطالب (نص السؤال فقط)،',
    'اكتب ملخصاً قصيراً جداً (3 أسطر كحد أقصى) لنقاط الضعف المحتملة بالعربية، بدون مقدمة.',
    'الأسئلة:',
    ...hints.map((h, i) => `${i + 1}. ${h}`),
  ].join('\n');
  try {
    const t = await askGemini({ subjectKey, question: prompt, history: [], style: 'short' });
    return String(t || '').trim() || 'راجع الأسئلة التي أخطأت فيها.';
  } catch {
    return 'راجع الأسئلة التي أخطأت فيها.';
  }
}

function registerDiagnosticChallenge(bot) {
  bot.hears('📊 اختبار تشخيصي', async (ctx) => {
    const { isAdmin } = require('./admin');
    if (isAdmin(ctx)) return ctx.reply('هذا الخيار للطلاب.');
    const { getTeacherByTelegramId } = require('../services/supabase');
    const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
    if (teacher) return ctx.reply('هذا الخيار للطلاب.');
    ctx.session.diagnostic = null;
    ctx.session.awaiting = 'diag_pick_subject';
    return ctx.reply(
      '📊 اختبار تشخيصي (10 أسئلة)\n\nاختر المادة ثم انتظر قليلاً لتوليد الأسئلة.',
      diagnosticSubjectsKeyboard()
    );
  });

  bot.action('diag:home', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.awaiting = null;
    ctx.session.diagnostic = null;
    return ctx.reply('اختر من القائمة:', studentMainKeyboard());
  });

  bot.action(/^diag:sub:([a-z_]+)$/, async (ctx) => {
    const key = ctx.match[1];
    await ctx.answerCbQuery();
    ctx.session.diagnostic = { subjectKey: key, items: [], index: 0, correct: 0, wrongQs: [] };
    ctx.session.awaiting = null;
    await ctx.reply('⏳ جاري توليد 10 أسئلة... قد يستغرق ذلك نصف دقيقة.');
    try {
      const items = await generateTenDiagnosticQuestions(key);
      ctx.session.diagnostic.items = items;
      ctx.session.diagnostic.index = 0;
      ctx.session.diagnostic.correct = 0;
      ctx.session.diagnostic.wrongQs = [];
      const first = items[0];
      ctx.session.awaiting = 'diag_active';
      return ctx.reply(
        `السؤال 1 من 10 — ${subjectLabel(key)}\n\n${first.question}`,
        diagnosticAnswerKeyboard(first.options)
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('diagnostic gen', e);
      ctx.session.diagnostic = null;
      return ctx.reply('تعذر توليد الاختبار الآن. حاول لاحقاً.', studentMainKeyboard());
    }
  });

  bot.action(/^chall:home$/, async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.dailyChallenge = null;
    ctx.session.awaiting = null;
    return ctx.reply('اختر من القائمة:', studentMainKeyboard());
  });

  bot.action(/^chall:ans:(\d)$/, async (ctx) => {
    const pick = Number(ctx.match[1]);
    await ctx.answerCbQuery();
    const dc = ctx.session?.dailyChallenge;
    if (!dc?.challengeId || dc.startedAt == null) {
      return ctx.reply('لا يوجد تحدي نشط. اضغط «⚡ تحدي اليوم».', studentMainKeyboard());
    }
    const { data: existing } = await getChallengeAnswerForUser(dc.challengeId, ctx.from.id);
    if (existing) {
      return ctx.reply('لقد شاركت في تحدي اليوم مسبقاً.', studentMainKeyboard());
    }
    const { data: ch } = await getDailyChallengeByDate(dc.dateISO || todayIsoRiyadh());
    if (!ch) return ctx.reply('انتهى التحدي أو غير متاح.', studentMainKeyboard());
    const correct = Number(ch.correct_index);
    const ok = pick === correct;
    const ms = Math.max(0, Date.now() - Number(dc.startedAt));
    let points = 0;
    if (ok) {
      points = Math.max(10, 100 - Math.floor(ms / 500));
      if (points > 100) points = 100;
    }
    const { error } = await insertChallengeAnswer({
      challenge_id: ch.id,
      telegram_id: String(ctx.from.id),
      chosen_index: pick,
      is_correct: ok,
      response_ms: ms,
      points,
    });
    if (error) {
      if (String(error?.code || '') === '23505') {
        return ctx.reply('لقد سُجّلت إجابتك مسبقاً.', studentMainKeyboard());
      }
      return ctx.reply('تعذر حفظ الإجابة.', studentMainKeyboard());
    }
    ctx.session.dailyChallenge = null;
    ctx.session.awaiting = null;
    const opts = Array.isArray(ch.options) ? ch.options : JSON.parse(ch.options || '[]');
    const chosen = opts[pick] ?? '';
    const right = opts[correct] ?? '';
    const timeSec = (ms / 1000).toFixed(1);
    const head = ok ? '✅ إجابة صحيحة!' : '❌ إجابة غير صحيحة';
    return ctx.reply(
      `${head}\n\nوقت الاستجابة: ${timeSec} ث\n🏅 النقاط لهذا التحدي: ${points}\n\nاختيارك: ${chosen}\nالصحيح: ${right}`,
      studentMainKeyboard()
    );
  });

  bot.action(/^diag:ans:(\d)$/, async (ctx) => {
    const pick = Number(ctx.match[1]);
    await ctx.answerCbQuery();
    const d = ctx.session?.diagnostic;
    if (!d?.items?.length || ctx.session.awaiting !== 'diag_active') {
      return ctx.reply('لا يوجد اختبار نشط.', studentMainKeyboard());
    }
    const idx = Number(d.index || 0);
    const cur = d.items[idx];
    if (!cur) return ctx.reply('انتهى الاختبار.', studentMainKeyboard());
    const correct = Number(cur.correctIndex);
    const ok = pick === correct;
    if (ok) d.correct = Number(d.correct || 0) + 1;
    else d.wrongQs = [...(d.wrongQs || []), cur.question];

    const next = idx + 1;
    if (next >= d.items.length) {
      ctx.session.awaiting = null;
      const weak = await summarizeWeakPoints(d.subjectKey, d.wrongQs);
      await insertDiagnosticTest({
        telegram_id: String(ctx.from.id),
        subject_key: d.subjectKey,
        correct_count: d.correct,
        total: d.items.length,
        weak_summary: weak,
        detail: { wrong_count: d.items.length - d.correct },
      }).catch(() => {});
      ctx.session.diagnostic = null;
      const subj = subjectLabel(d.subjectKey);
      return ctx.reply(
        `🎓 انتهى الاختبار التشخيصي — ${subj}\n\n✅ الصحيح: ${d.correct} من ${d.items.length}\n\n📌 ملخص نقاط الضعف:\n${weak}`,
        studentMainKeyboard()
      );
    }
    d.index = next;
    const q = d.items[next];
    return ctx.reply(
      `السؤال ${next + 1} من ${d.items.length}\n\n${q.question}`,
      diagnosticAnswerKeyboard(q.options)
    );
  });

  bot.hears('⚡ تحدي اليوم', async (ctx) => {
    const { isAdmin } = require('./admin');
    if (isAdmin(ctx)) return ctx.reply('هذا الخيار للطلاب.');
    const { getTeacherByTelegramId } = require('../services/supabase');
    const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
    if (teacher) return ctx.reply('هذا الخيار للطلاب.');
    const day = todayIsoRiyadh();
    const { data: ch, error } = await getDailyChallengeByDate(day);
    if (error) return ctx.reply('تعذر جلب التحدي.');
    if (!ch) {
      return ctx.reply(
        'لم يُنشر تحدٍّ اليوم بعد. سيظهر تلقائياً بعد جدولة السيرفر (صباحاً).',
        studentMainKeyboard()
      );
    }
    const { data: prev } = await getChallengeAnswerForUser(ch.id, ctx.from.id);
    if (prev) {
      return ctx.reply('شاركت مسبقاً في تحدي اليوم. تابع 🏆 المتصدرين.', studentMainKeyboard());
    }
    let options = ch.options;
    if (typeof options === 'string') {
      try {
        options = JSON.parse(options);
      } catch {
        options = [];
      }
    }
    if (!Array.isArray(options) || options.length !== 4) {
      return ctx.reply('بيانات التحدي غير مكتملة.', studentMainKeyboard());
    }
    ctx.session.dailyChallenge = { challengeId: ch.id, dateISO: day, startedAt: Date.now() };
    ctx.session.awaiting = 'challenge_active';
    const subj = subjectLabel(ch.subject_key);
    return ctx.reply(
      `⚡ تحدي اليوم — ${subj}\n\n${ch.question}\n\nاختر إجابة واحدة (النقاط أعلى كلما أسرعت).`,
      challengeAnswerKeyboard(options)
    );
  });

  bot.hears('🏆 المتصدرين', async (ctx) => {
    const { isAdmin } = require('./admin');
    if (isAdmin(ctx)) return ctx.reply('هذا الخيار للطلاب.');
    const { getTeacherByTelegramId } = require('../services/supabase');
    const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
    if (teacher) return ctx.reply('هذا الخيار للطلاب.');
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString().slice(0, 10);
    const { data: top, error } = await listTopChallengeUsersSince(sinceStr, 10);
    if (error) return ctx.reply('تعذر جلب الترتيب.');
    if (!top.length) return ctx.reply('لا توجد نقاط مسجّلة بعد لهذا الأسبوع.', studentMainKeyboard());
    const ids = top.map((r) => r.telegram_id);
    const { data: names } = await getStudentNamesByTelegramIds(ids);
    const nameByTg = new Map((names || []).map((r) => [String(r.telegram_id), r.name]));
    const lines = top.map((r, i) => {
      const nm = nameByTg.get(String(r.telegram_id)) || `مستخدم ${String(r.telegram_id).slice(-4)}`;
      return `${i + 1}. ${nm} — ${r.points} نقطة`;
    });
    return ctx.reply(`🏆 أعلى النقاط (آخر 7 أيام)\n\n${lines.join('\n')}`, studentMainKeyboard());
  });
}

module.exports = {
  registerDiagnosticChallenge,
  diagnosticSubjectsKeyboard,
  challengeAnswerKeyboard,
  generateTenDiagnosticQuestions,
};
