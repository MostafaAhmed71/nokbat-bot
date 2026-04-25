const { Telegraf, session } = require('telegraf');
const {
  getTeacherByTelegramId,
  searchStudentsByName,
  getStudentById,
} = require('./services/supabase');
const {
  registerAdmin,
  isAdmin,
  handleAdminText,
  adminPanelKeyboard,
} = require('./handlers/admin');
const { teacherMainKeyboard, handleTeacherText } = require('./handlers/teacher');
const {
  formatStudentCommittee,
  studentMainKeyboard,
  aiSubjectsKeyboard,
  quizSubjectsKeyboard,
  quizAnswerKeyboard,
  quizAfterKeyboard,
  quizDifficultyKeyboard,
  aiAfterAnswerKeyboard,
  helpKeyboard,
  gradesKeyboard,
  settingsKeyboard,
  studentPickKeyboard,
} = require('./handlers/student');
const { promptForNationalId, handleNationalIdText } = require('./handlers/results');
const { askGemini, subjectLabel } = require('./services/gemini');
const { ingestFile, searchLibrary } = require('./services/contentLibrary');
const fs = require('fs');
const path = require('path');

function buildBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN غير معرّف في .env');
  }

  const bot = new Telegraf(token);
  bot.use(
    session({
      defaultSession: () => ({
        awaiting: null,
        ai: {
          subjectKey: null,
          history: [],
          lastAnswer: null,
          style: 'medium',
        },
        student: {
          gradeKey: null,
        },
        quiz: {
          subjectKey: null,
          points: 0,
          difficulty: 'medium',
          streak: 0,
          lastDayKey: null,
          badges: [],
          current: null,
        },
        upload: null,
      }),
    })
  );

  registerAdmin(bot);

  bot.command(['myid', 'معرف'], async (ctx) => {
    const id = ctx.from.id;
    return ctx.reply(
      'معرّف تيليجرام لحسابك الحالي:\n' +
        `${id}\n\n` +
        'انسخ الرقم كما هو (أرقام فقط) وأرسله للإدارة ليُسجَّل في ملف المعلمين أو في Supabase في عمود telegram_id.\n\n' +
        'تنبيه: رقم الجوال لا يُستخدم هنا — هذا المعرف يظهر فقط من داخل تيليجرام.'
    );
  });

  bot.start(async (ctx) => {
    if (isAdmin(ctx)) {
      return ctx.reply(
        'مرحباً بك في لوحة المدير.\n\nاستخدم /admin لفتح لوحة التحكم.'
      );
    }

    const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
    if (teacher) {
      ctx.session.awaiting = null;
      return ctx.reply(
        `مرحباً ${teacher.name}.\n\nاختر من القائمة:`,
        teacherMainKeyboard()
      );
    }

    return ctx.reply(
      [
        'مرحباً بك في بوت متوسطة وثانوية نخبة الشمال الأهلية.',
        '',
        'اختر خدمة من القائمة 👇',
        '',
        '✨ خدمات سريعة:',
        '• 🤖 مساعد AI للمذاكرة (شرح + أمثلة + متابعة)',
        '• 🧾 لجنّتي (رقم اللجنة + المكان)',
        '• 🏁 نتيجتي (صورة/رابط النتيجة)',
        '',
        '💡 أمثلة لأسئلة مساعد AI:',
        '• ما هو الرمز الكيميائي للأكسجين؟',
        '• اشرح قانون فيثاغورس مع مثال',
        '• أعطني معنى كلمة بالإنجليزي واستخدمها في جملة',
        '',
        'إذا احتجت شرح الاستخدام اضغط «ℹ️ المساعدة».',
      ].join('\n'),
      studentMainKeyboard()
    );
  });

  bot.hears(['🧾 لجنّتي', 'معرفة اللجنة'], async (ctx) => {
    if (isAdmin(ctx)) return ctx.reply('هذا الخيار مخصص للطلاب.');
    const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
    if (teacher) return ctx.reply('هذا الخيار مخصص للطلاب.');
    ctx.session.awaiting = 'student_committee';
    return ctx.reply('🧾 اكتب اسمك الكامل وسأعرض رقم ومكان لجنتك.', {
      reply_markup: { remove_keyboard: true },
    });
  });

  bot.hears(['🏁 نتيجتي', 'النتيجة'], async (ctx) => {
    if (isAdmin(ctx)) return ctx.reply('هذا الخيار مخصص للطلاب.');
    const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
    if (teacher) return ctx.reply('هذا الخيار مخصص للطلاب.');
    return promptForNationalId(ctx);
  });

  bot.hears(['🤖 اسأل مساعد AI', 'اسأل AI 🤖'], async (ctx) => {
    if (isAdmin(ctx)) return ctx.reply('هذا الخيار مخصص للطلاب.');
    const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
    if (teacher) return ctx.reply('هذا الخيار مخصص للطلاب.');
    ctx.session.student = ctx.session.student || {};
    if (!ctx.session.student.gradeKey) {
      ctx.session.awaiting = 'student_pick_grade';
      return ctx.reply('اختر صفّك الدراسي أولاً:', gradesKeyboard('grade:set'));
    }
    ctx.session.awaiting = 'ai_pick_subject';
    ctx.session.ai = ctx.session.ai || {};
    ctx.session.ai.subjectKey = null;
    ctx.session.ai.history = [];
    ctx.session.ai.lastAnswer = null;
    return ctx.reply('🤖 اختر المادة التي تريد السؤال عنها:', aiSubjectsKeyboard());
  });

  bot.hears('🧪 اختبار سريع', async (ctx) => {
    if (isAdmin(ctx)) return ctx.reply('هذا الخيار مخصص للطلاب.');
    const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
    if (teacher) return ctx.reply('هذا الخيار مخصص للطلاب.');
    ctx.session.awaiting = null;
    ctx.session.quiz = ctx.session.quiz || {};
    ctx.session.quiz.subjectKey = null;
    ctx.session.quiz.current = null;
    ctx.session.quiz.points = Number(ctx.session.quiz.points || 0);
    ctx.session.quiz.difficulty = ctx.session.quiz.difficulty || 'medium';
    ctx.session.quiz.streak = Number(ctx.session.quiz.streak || 0);
    ctx.session.quiz.lastDayKey = ctx.session.quiz.lastDayKey || null;
    ctx.session.quiz.badges = Array.isArray(ctx.session.quiz.badges)
      ? ctx.session.quiz.badges
      : [];
    return ctx.reply(
      `🧪 اختبار سريع\n\nاختر مادة للاختبار:`,
      quizSubjectsKeyboard()
    );
  });

  bot.hears('ℹ️ المساعدة', async (ctx) => {
    if (isAdmin(ctx)) {
      return ctx.reply('استخدم /admin لفتح لوحة تحكم المدير.');
    }
    const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
    if (teacher) {
      return ctx.reply(
        'المساعدة:\n\n- 📅 جدولي اليوم: يعرض جدول حصصك.\n- 🔎 بحث طالب (لجنة): اكتب اسم الطالب لعرض بيانات لجنته.\n',
        teacherMainKeyboard()
      );
    }
    return ctx.reply(
      'ℹ️ المساعدة — اختر ما تريد:',
      helpKeyboard()
    );
  });

  bot.hears('⚙️ الإعدادات', async (ctx) => {
    if (isAdmin(ctx)) return ctx.reply('استخدم /admin لفتح لوحة تحكم المدير.');
    const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
    if (teacher) return ctx.reply('الإعدادات متاحة للطلاب فقط حالياً.');
    const style = ctx.session?.ai?.style || 'medium';
    const gradeKey = ctx.session?.student?.gradeKey || null;
    const gradeLine = gradeKey ? `\n\n✅ صفّك الحالي: ${gradeKey}` : '\n\nلم يتم تحديد الصف بعد.';
    await ctx.reply('⚙️ الإعدادات — أسلوب الشرح:', settingsKeyboard(style));
    return ctx.reply(`⚙️ الإعدادات — الصف الدراسي:${gradeLine}`, gradesKeyboard('grade:set'));
  });

  bot.hears('🏠 القائمة الرئيسية', async (ctx) => {
    if (isAdmin(ctx)) {
      return ctx.reply('استخدم /admin لفتح لوحة تحكم المدير.');
    }
    const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
    if (teacher) {
      ctx.session.awaiting = null;
      return ctx.reply('اختر من القائمة:', teacherMainKeyboard());
    }
    ctx.session.awaiting = null;
    ctx.session.ai = ctx.session.ai || {};
    ctx.session.ai.subjectKey = null;
    ctx.session.ai.history = [];
    ctx.session.ai.lastAnswer = null;
    ctx.session.ai.style = ctx.session.ai.style || 'medium';
    ctx.session.quiz = ctx.session.quiz || {};
    ctx.session.quiz.subjectKey = ctx.session.quiz.subjectKey || null;
    ctx.session.quiz.points = Number(ctx.session.quiz.points || 0);
    ctx.session.quiz.current = null;
    return ctx.reply('اختر خدمة من القائمة:', studentMainKeyboard());
  });

  bot.command(['result', 'نتيجتي'], async (ctx) => {
    if (isAdmin(ctx)) {
      return ctx.reply('هذا الأمر مخصص للطلاب.');
    }
    const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
    if (teacher) {
      return ctx.reply('هذا الأمر مخصص للطلاب.');
    }
    return promptForNationalId(ctx);
  });

  bot.on('text', async (ctx) => {
    const txt = (ctx.message.text || '').trim();
    if (txt.startsWith('/')) return;

    const adminWaiting =
      isAdmin(ctx) &&
      (ctx.session.awaiting === 'admin_student' ||
        ctx.session.awaiting === 'admin_teacher');
    if (adminWaiting) {
      return handleAdminText(ctx);
    }

    const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
    if (teacher) {
      // تدفق رفع المراجعة للمعلم (لأن handleTeacherText له fallback عام)
      if (txt === '📤 رفع مراجعة') {
        ctx.session.upload = { kind: 'review', gradeKey: null, subjectKey: null };
        ctx.session.awaiting = 'tch_upload_pick_grade';
        return ctx.reply('اختر الصف لهذه المراجعة:', gradesKeyboard('tch:grade'));
      }
      return handleTeacherText(ctx, teacher);
    }

    if (isAdmin(ctx)) {
      return ctx.reply('استخدم /admin لفتح لوحة تحكم المدير.');
    }

    if (ctx.session.awaiting === 'student_result') {
      return handleNationalIdText(ctx, txt);
    }

    if (ctx.session.awaiting === 'ai_question') {
      const subjectKey = ctx.session?.ai?.subjectKey || 'other';
      const subjectName = subjectLabel(subjectKey);
      const style = ctx.session?.ai?.style || 'medium';
      const gradeKey = ctx.session?.student?.gradeKey;
      // نبقي وضع الـ AI فعّال للأسئلة المتتابعة حتى يرجع المستخدم للقائمة
      try {
        const history = Array.isArray(ctx.session?.ai?.history)
          ? ctx.session.ai.history
          : [];
        const gradeMap = {
          m1: 'أول متوسط',
          m2: 'ثاني متوسط',
          m3: 'ثالث متوسط',
          s1: 'أول ثانوي',
          s2: 'ثاني ثانوي',
          s3: 'ثالث ثانوي',
        };
        const grade = gradeMap[String(gradeKey || '')] || null;
        const retrievedChunks =
          grade && subjectKey
            ? await searchLibrary({
                grade,
                subjectKey,
                query: txt,
                topK: 5,
              })
            : [];
        const answer = await askGemini({
          subjectKey,
          question: txt,
          history,
          style,
          retrievedChunks,
        });
        const safe =
          answer ||
          'لم أستطع توليد إجابة الآن. جرّب إعادة صياغة السؤال أو اسأل بطريقة أبسط.';
        ctx.session.ai = ctx.session.ai || {};
        ctx.session.ai.history = [...history, { q: txt, a: safe }].slice(-2);
        ctx.session.ai.lastAnswer = safe;
        ctx.session.awaiting = 'ai_question';
        await ctx.reply(
          `المادة: ${subjectName}\n\n${safe}\n\nاكتب سؤالك التالي مباشرة 👇`,
          aiAfterAnswerKeyboard()
        );
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('gemini error', e);
        ctx.session.awaiting = 'ai_question';
        const msg =
          String(e?.message || '').includes('GEMINI_API_KEY')
            ? 'خدمة الذكاء الاصطناعي غير مفعلة حالياً. (GEMINI_API_KEY غير مضبوط)'
            : 'تعذر الاتصال بمساعد الذكاء الاصطناعي حالياً. حاول لاحقاً.';
        await ctx.reply(msg, aiAfterAnswerKeyboard());
      }
      return undefined;
    }

    const { data, error } = await searchStudentsByName(txt);
    if (error) {
      return ctx.reply('تعذر البحث حالياً. حاول لاحقاً.');
    }
    if (!data.length) {
      return ctx.reply(
        'لم يتم العثور على اسمك، تأكد من الاسم أو تواصل مع الإدارة.',
        studentMainKeyboard()
      );
    }
    if (data.length === 1) {
      ctx.session.awaiting = null;
      return ctx.reply(formatStudentCommittee(data[0]), studentMainKeyboard());
    }
    return ctx.reply(
      'وجدنا أكثر من تطابق. اختر اسمك من القائمة:',
      studentPickKeyboard(data)
    );
  });

  bot.action(/^grade:set:(m1|m2|m3|s1|s2|s3)$/, async (ctx) => {
    const g = ctx.match[1];
    await ctx.answerCbQuery('تم');
    ctx.session.student = ctx.session.student || {};
    ctx.session.student.gradeKey = g;
    if (ctx.session.awaiting === 'student_pick_grade') {
      ctx.session.awaiting = 'ai_pick_subject';
      return ctx.reply('✅ تم تحديد الصف. الآن اختر المادة:', aiSubjectsKeyboard());
    }
    return ctx.reply('✅ تم تحديث الصف.', studentMainKeyboard());
  });

  function getFilesRoot() {
    return process.env.FILES_ROOT || path.join(__dirname, 'files');
  }

  function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
  }

  function sanitizeSegment(s) {
    return String(s || '')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ')
      .slice(0, 80);
  }

  function gradeLabelFromKey(k) {
    const map = {
      m1: 'أول متوسط',
      m2: 'ثاني متوسط',
      m3: 'ثالث متوسط',
      s1: 'أول ثانوي',
      s2: 'ثاني ثانوي',
      s3: 'ثالث ثانوي',
    };
    return map[String(k || '')] || null;
  }

  function teacherUploadSubjectsKeyboard() {
    // نفس subject_key المستخدمة في AI
    const rows = [
      [
        { t: '📐 رياضيات', k: 'math' },
        { t: '🔬 علوم', k: 'science' },
      ],
      [
        { t: '📖 لغتي', k: 'arabic' },
        { t: '📚 إنجليزي', k: 'english' },
      ],
      [
        { t: '🕌 إسلاميات', k: 'islamic' },
        { t: '📜 اجتماعيات', k: 'social' },
      ],
      [
        { t: 'فيزياء', k: 'physics' },
        { t: 'كمياء', k: 'chemistry' },
        { t: 'إحياء', k: 'biology' },
      ],
      [
        { t: 'قدرات لفظي', k: 'qudrat_verbal' },
        { t: 'قدرات كمي', k: 'qudrat_quant' },
      ],
      [{ t: 'التحصيلي', k: 'tahsili' }],
      [{ t: '🎯 أخرى', k: 'other' }],
    ].map((row) =>
      row.map((x) => require('telegraf').Markup.button.callback(x.t, `tch:sub:${x.k}`))
    );
    rows.push([require('telegraf').Markup.button.callback('🏠 إلغاء', 'tch:cancel')]);
    return require('telegraf').Markup.inlineKeyboard(rows);
  }

  bot.hears('📤 رفع مراجعة', async (ctx) => {
    const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
    if (!teacher) return;
    ctx.session.upload = { kind: 'review', gradeKey: null, subjectKey: null };
    ctx.session.awaiting = 'tch_upload_pick_grade';
    return ctx.reply('اختر الصف لهذه المراجعة:', gradesKeyboard('tch:grade'));
  });

  bot.action(/^tch:grade:(m1|m2|m3|s1|s2|s3)$/, async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.upload = ctx.session.upload || { kind: 'review' };
    ctx.session.upload.gradeKey = ctx.match[1];
    ctx.session.awaiting = 'tch_upload_pick_subject';
    return ctx.reply('اختر المادة:', teacherUploadSubjectsKeyboard());
  });

  bot.action(/^tch:sub:([a-z_]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.upload = ctx.session.upload || { kind: 'review' };
    ctx.session.upload.subjectKey = ctx.match[1];
    ctx.session.awaiting = 'tch_upload_file';
    return ctx.reply('أرسل ملف المراجعة الآن (PDF أو DOCX أو TXT).');
  });

  bot.action('tch:cancel', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.awaiting = null;
    ctx.session.upload = null;
    return ctx.reply('تم الإلغاء.', teacherMainKeyboard());
  });

  bot.on('document', async (ctx) => {
    const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
    if (!teacher) return;
    if (ctx.session.awaiting !== 'tch_upload_file') return;

    const doc = ctx.message.document;
    const fileId = doc.file_id;
    const mime = doc.mime_type || '';
    const name = doc.file_name || 'file';
    const ext = String(path.extname(name) || '').toLowerCase();
    if (!['.pdf', '.docx', '.txt'].includes(ext)) {
      return ctx.reply('صيغة غير مدعومة. أرسل PDF أو DOCX أو TXT.');
    }

    const grade = gradeLabelFromKey(ctx.session?.upload?.gradeKey);
    const subjectKey = String(ctx.session?.upload?.subjectKey || '').trim();
    if (!grade || !subjectKey) {
      return ctx.reply('ابدأ من جديد: 📤 رفع مراجعة ثم اختر الصف والمادة.');
    }

    const filesRoot = getFilesRoot();
    const libDir = path.join(
      filesRoot,
      'library',
      sanitizeSegment(grade),
      sanitizeSegment(subjectKey)
    );
    ensureDir(libDir);
    const base = sanitizeSegment(path.basename(name, ext) || 'review');
    const outPath = path.join(libDir, `${base}-${Date.now()}${ext}`);

    try {
      const link = await ctx.telegram.getFileLink(fileId);
      const res = await fetch(String(link));
      if (!res.ok) throw new Error(`download failed: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(outPath, buf);

      const ing = await ingestFile({
        kind: 'review',
        grade,
        subjectKey,
        title: base,
        filePath: outPath,
        mime,
        source: 'telegram',
        uploadedByTelegramId: String(ctx.from.id),
      });

      ctx.session.awaiting = null;
      ctx.session.upload = null;
      return ctx.reply(
        `تم رفع المراجعة وفهرستها.\n\nالعنوان: ${ing.title}\nعدد الأجزاء: ${ing.chunksCount}`,
        teacherMainKeyboard()
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('teacher upload error', e);
      return ctx.reply('تعذر رفع/فهرسة الملف. حاول مرة أخرى.');
    }
  });

  bot.action(/^pick:stu:([0-9a-f-]{36})$/i, async (ctx) => {
    const id = ctx.match[1];
    const { data, error } = await getStudentById(id);
    await ctx.answerCbQuery();
    if (error || !data) {
      return ctx.reply('تعذر جلب بيانات الطالب.');
    }

    const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
    const forStaff = Boolean(teacher) || isAdmin(ctx);
    const msg = formatStudentCommittee(data, { forStaff });
    if (teacher) {
      return ctx.reply(msg, teacherMainKeyboard());
    }
    if (isAdmin(ctx)) {
      return ctx.reply(msg, adminPanelKeyboard());
    }
    return ctx.reply(msg, studentMainKeyboard());
  });

  bot.action('ai:home', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.awaiting = null;
    ctx.session.ai = ctx.session.ai || {};
    ctx.session.ai.subjectKey = null;
    ctx.session.ai.history = [];
    ctx.session.ai.lastAnswer = null;
    ctx.session.ai.style = ctx.session.ai.style || 'medium';
    ctx.session.quiz = ctx.session.quiz || {};
    ctx.session.quiz.current = null;
    return ctx.reply('اختر من القائمة:', studentMainKeyboard());
  });

  bot.action('ai:change_subject', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.awaiting = 'ai_pick_subject';
    ctx.session.ai = ctx.session.ai || {};
    ctx.session.ai.subjectKey = null;
    ctx.session.ai.history = [];
    ctx.session.ai.lastAnswer = null;
    ctx.session.ai.style = ctx.session.ai.style || 'medium';
    return ctx.reply('📌 اختر مادة جديدة:', aiSubjectsKeyboard());
  });

  bot.action('ai:settings', async (ctx) => {
    await ctx.answerCbQuery();
    const style = ctx.session?.ai?.style || 'medium';
    return ctx.reply('⚙️ اختر أسلوب الشرح:', settingsKeyboard(style));
  });

  bot.action('ai:clear', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.ai = ctx.session.ai || {};
    ctx.session.ai.history = [];
    ctx.session.ai.lastAnswer = null;
    return ctx.reply('🗑️ تم مسح محادثة الـ AI. اكتب سؤالك الآن 👇', aiAfterAnswerKeyboard());
  });

  bot.action('ai:summarize', async (ctx) => {
    await ctx.answerCbQuery();
    const last = String(ctx.session?.ai?.lastAnswer || '').trim();
    if (!last) return ctx.reply('لا توجد إجابة سابقة لتلخيصها.');
    try {
      const answer = await askGemini({
        subjectKey: ctx.session?.ai?.subjectKey || 'other',
        question: `لخّص الإجابة التالية في 3 نقاط قصيرة:\n\n${last}`,
        history: [],
        style: 'short',
      });
      return ctx.reply(`📝 ملخص:\n\n${answer}`, aiAfterAnswerKeyboard());
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('gemini summarize error', e);
      return ctx.reply('تعذر تلخيص الإجابة حالياً.', aiAfterAnswerKeyboard());
    }
  });

  bot.action('ai:simplify', async (ctx) => {
    await ctx.answerCbQuery();
    const last = String(ctx.session?.ai?.lastAnswer || '').trim();
    if (!last) return ctx.reply('لا توجد إجابة سابقة لتبسيطها.');
    try {
      const answer = await askGemini({
        subjectKey: ctx.session?.ai?.subjectKey || 'other',
        question: `بسّط الشرح جداً لطالب متوسط مع مثال قصير:\n\n${last}`,
        history: [],
        style: 'short',
      });
      return ctx.reply(`🧠 شرح أبسط:\n\n${answer}`, aiAfterAnswerKeyboard());
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('gemini simplify error', e);
      return ctx.reply('تعذر تبسيط الإجابة حالياً.', aiAfterAnswerKeyboard());
    }
  });

  bot.action('ai:detail', async (ctx) => {
    await ctx.answerCbQuery();
    const last = String(ctx.session?.ai?.lastAnswer || '').trim();
    if (!last) return ctx.reply('لا توجد إجابة سابقة لتفصيلها.');
    try {
      const answer = await askGemini({
        subjectKey: ctx.session?.ai?.subjectKey || 'other',
        question: `وسّع الشرح بالتفصيل مع خطوات مرتبة:\n\n${last}`,
        history: [],
        style: 'detailed',
      });
      return ctx.reply(`🧩 شرح بالتفصيل:\n\n${answer}`, aiAfterAnswerKeyboard());
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('gemini detail error', e);
      return ctx.reply('تعذر تفصيل الإجابة حالياً.', aiAfterAnswerKeyboard());
    }
  });

  bot.action('ai:again', async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.session?.ai?.subjectKey) {
      ctx.session.awaiting = 'ai_pick_subject';
      return ctx.reply('اختر المادة التي تريد السؤال عنها:', aiSubjectsKeyboard());
    }
    ctx.session.awaiting = 'ai_question';
    return ctx.reply('اكتب سؤالك وهرد عليك فوراً 👇', {
      reply_markup: { remove_keyboard: true },
    });
  });

  bot.action(/^ai:sub:([a-z_]+)$/, async (ctx) => {
    const key = ctx.match[1];
    ctx.session.ai = ctx.session.ai || {};
    ctx.session.ai.subjectKey = key;
    ctx.session.ai.history = ctx.session.ai.history || [];
    ctx.session.ai.lastAnswer = ctx.session.ai.lastAnswer || null;
    ctx.session.ai.style = ctx.session.ai.style || 'medium';
    ctx.session.awaiting = 'ai_question';
    await ctx.answerCbQuery();
    return ctx.reply('✍️ اكتب سؤالك (وتقدر تتابع بأسئلة بعده):', {
      reply_markup: { remove_keyboard: true },
    });
  });

  bot.action(/^set:style:(short|medium|detailed)$/, async (ctx) => {
    const style = ctx.match[1];
    ctx.session.ai = ctx.session.ai || {};
    ctx.session.ai.style = style;
    await ctx.answerCbQuery('تم التحديث');
    return ctx.reply(
      `✅ تم ضبط أسلوب الشرح على: ${
        style === 'short' ? 'مختصر' : style === 'detailed' ? 'مفصل' : 'متوسط'
      }`,
      settingsKeyboard(style)
    );
  });

  bot.action('help:home', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply('اختر خدمة من القائمة:', studentMainKeyboard());
  });

  bot.action('help:ai', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply(
      '🤖 مساعد AI\n\n1) اضغط «🤖 اسأل مساعد AI»\n2) اختر المادة\n3) اكتب سؤالك\n\nنصيحة: اسأل سؤال متابعة مباشرة بدون ضغط أي زر.',
      helpKeyboard()
    );
  });

  bot.action('help:committee', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply(
      '🧾 لجنّتي\n\nاضغط «🧾 لجنّتي» ثم اكتب اسمك الكامل كما هو مسجل في المدرسة.',
      helpKeyboard()
    );
  });

  bot.action('help:result', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply(
      '🏁 نتيجتي\n\nاضغط «🏁 نتيجتي» ثم اكتب رقم الهوية/الإقامة.\nإذا لم تُرسل الصورة سيتم إرسال رابط النتيجة.',
      helpKeyboard()
    );
  });

  function extractJsonObject(text) {
    const s = String(text || '');
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    const raw = s.slice(start, end + 1);
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function dayKeyNow() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function dayKeyOffset(key, deltaDays) {
    const [y, m, d] = String(key).split('-').map((x) => Number(x));
    const dt = new Date(y, (m || 1) - 1, d || 1);
    dt.setDate(dt.getDate() + Number(deltaDays || 0));
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  function ensureQuizSession(ctx) {
    ctx.session.quiz = ctx.session.quiz || {};
    ctx.session.quiz.points = Number(ctx.session.quiz.points || 0);
    ctx.session.quiz.difficulty = ctx.session.quiz.difficulty || 'medium';
    ctx.session.quiz.streak = Number(ctx.session.quiz.streak || 0);
    ctx.session.quiz.lastDayKey = ctx.session.quiz.lastDayKey || null;
    ctx.session.quiz.badges = Array.isArray(ctx.session.quiz.badges)
      ? ctx.session.quiz.badges
      : [];
    ctx.session.quiz.current = ctx.session.quiz.current || null;
  }

  function awardBadges(ctx) {
    ensureQuizSession(ctx);
    const b = new Set(ctx.session.quiz.badges);
    const pts = Number(ctx.session.quiz.points || 0);
    const streak = Number(ctx.session.quiz.streak || 0);

    if (pts >= 5) b.add('🏅 مبتدئ (5 نقاط)');
    if (pts >= 10) b.add('🥉 برونزي (10 نقاط)');
    if (pts >= 20) b.add('🥈 فضي (20 نقطة)');
    if (streak >= 3) b.add('🔥 سلسلة 3 أيام');
    if (streak >= 7) b.add('💪 سلسلة 7 أيام');

    ctx.session.quiz.badges = Array.from(b);
  }

  function difficultyLabel(d) {
    if (d === 'easy') return 'سهل';
    if (d === 'hard') return 'صعب';
    return 'متوسط';
  }

  function difficultyHint(d) {
    if (d === 'easy') return 'سهل: تعريفات مباشرة وأمثلة بسيطة.';
    if (d === 'hard') return 'صعب: يحتاج تفكير وخطوة/خطوتين.';
    return 'متوسط: مناسب للمراجعة اليومية.';
  }

  async function generateQuiz(ctx) {
    ensureQuizSession(ctx);
    const subjectKey = ctx.session.quiz.subjectKey || 'other';
    const subjectName = subjectLabel(subjectKey);
    const difficulty = ctx.session.quiz.difficulty || 'medium';
    const prompt = [
      'اكتب سؤال اختيار من متعدد للطالب باللغة العربية.',
      `المادة: ${subjectName}.`,
      `الصعوبة: ${difficultyLabel(difficulty)} (${difficultyHint(difficulty)})`,
      'المطلوب: JSON فقط بدون أي شرح أو نص إضافي.',
      'الشكل المطلوب:',
      '{"question":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"شرح مختصر"}',
      'شروط:',
      '- options عددها 4 بالضبط.',
      '- correctIndex رقم من 0 إلى 3.',
      '- explanation سطرين إلى 5 أسطر.',
      '- لا تكتب أي شيء خارج JSON.',
    ].join('\n');

    const raw = await askGemini({
      subjectKey,
      question: prompt,
      history: [],
      style: 'short',
    });

    const obj = extractJsonObject(raw);
    if (!obj) throw new Error('quiz_json_parse_failed');
    const q = String(obj.question || '').trim();
    const options = Array.isArray(obj.options) ? obj.options.map((x) => String(x)) : [];
    const correctIndex = Number(obj.correctIndex);
    const explanation = String(obj.explanation || '').trim();
    if (!q || options.length !== 4 || !(correctIndex >= 0 && correctIndex <= 3)) {
      throw new Error('quiz_invalid_payload');
    }

    ctx.session.quiz.current = { question: q, options, correctIndex, explanation };
    const pts = Number(ctx.session.quiz.points || 0);
    const streak = Number(ctx.session.quiz.streak || 0);
    const badgeCount = Array.isArray(ctx.session.quiz.badges)
      ? ctx.session.quiz.badges.length
      : 0;
    return ctx.reply(
      `🧪 اختبار سريع — ${subjectName}\nالصعوبة: ${difficultyLabel(difficulty)}\n\n${q}\n\n🏅 نقاطك: ${pts} | 🔥 السلسلة: ${streak} | 🎖️ الشارات: ${badgeCount}`,
      quizAnswerKeyboard(options)
    );
  }

  bot.action('quiz:home', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.quiz = ctx.session.quiz || {};
    ctx.session.quiz.current = null;
    ctx.session.quiz.subjectKey = null;
    return ctx.reply('اختر خدمة من القائمة:', studentMainKeyboard());
  });

  bot.action('quiz:change_subject', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.quiz = ctx.session.quiz || {};
    ctx.session.quiz.subjectKey = null;
    ctx.session.quiz.current = null;
    return ctx.reply('📌 اختر مادة للاختبار:', quizSubjectsKeyboard());
  });

  bot.action('quiz:settings', async (ctx) => {
    await ctx.answerCbQuery();
    ensureQuizSession(ctx);
    return ctx.reply(
      `⚙️ إعدادات الاختبار\n\nاختر الصعوبة الحالية: ${difficultyLabel(
        ctx.session.quiz.difficulty
      )}`,
      quizDifficultyKeyboard(ctx.session.quiz.difficulty)
    );
  });

  bot.action(/^quiz:diff:(easy|medium|hard)$/, async (ctx) => {
    const d = ctx.match[1];
    await ctx.answerCbQuery('تم');
    ensureQuizSession(ctx);
    ctx.session.quiz.difficulty = d;
    return ctx.reply(
      `✅ تم ضبط الصعوبة على: ${difficultyLabel(d)}\n\nاضغط «🔁 سؤال جديد» لبدء سؤال بهذه الصعوبة.`,
      quizAfterKeyboard()
    );
  });

  bot.action('quiz:next', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.quiz = ctx.session.quiz || {};
    if (!ctx.session.quiz.subjectKey) {
      return ctx.reply('اختر مادة للاختبار:', quizSubjectsKeyboard());
    }
    try {
      return await generateQuiz(ctx);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('quiz gen error', e);
      return ctx.reply('تعذر توليد سؤال الآن. حاول مرة أخرى.', quizAfterKeyboard());
    }
  });

  bot.action(/^quiz:sub:([a-z_]+)$/, async (ctx) => {
    const key = ctx.match[1];
    await ctx.answerCbQuery();
    ctx.session.quiz = ctx.session.quiz || {};
    ctx.session.quiz.subjectKey = key;
    ctx.session.quiz.points = Number(ctx.session.quiz.points || 0);
    ctx.session.quiz.current = null;
    try {
      return await generateQuiz(ctx);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('quiz gen error', e);
      return ctx.reply('تعذر توليد سؤال الآن. حاول مرة أخرى.', quizAfterKeyboard());
    }
  });

  bot.action(/^quiz:ans:(\d)$/, async (ctx) => {
    const pick = Number(ctx.match[1]);
    await ctx.answerCbQuery();
    const cur = ctx.session?.quiz?.current;
    if (!cur) {
      return ctx.reply('لا يوجد سؤال نشط. اضغط «🧪 اختبار سريع» للبدء.');
    }
    const correct = Number(cur.correctIndex);
    const ok = pick === correct;
    ensureQuizSession(ctx);
    ctx.session.quiz.points = Number(ctx.session.quiz.points || 0) + (ok ? 1 : 0);

    // تحديث السلسلة مرة واحدة لكل يوم عند حل أول سؤال
    const today = dayKeyNow();
    const last = ctx.session.quiz.lastDayKey;
    if (last !== today) {
      if (last && dayKeyOffset(last, 1) === today) {
        ctx.session.quiz.streak = Number(ctx.session.quiz.streak || 0) + 1;
      } else {
        ctx.session.quiz.streak = 1;
      }
      ctx.session.quiz.lastDayKey = today;
    }
    awardBadges(ctx);

    const chosen = cur.options?.[pick] ?? '';
    const right = cur.options?.[correct] ?? '';
    const header = ok ? '✅ إجابة صحيحة!' : '❌ إجابة غير صحيحة';
    const explain = cur.explanation ? `\n\n📌 الشرح:\n${cur.explanation}` : '';
    ctx.session.quiz.current = null;
    const badges = Array.isArray(ctx.session.quiz.badges) ? ctx.session.quiz.badges : [];
    const badgesLine = badges.length ? `\n🎖️ شاراتك: ${badges.slice(-3).join(' — ')}` : '';
    return ctx.reply(
      `${header}\n\nاختيارك: ${chosen}\nالإجابة الصحيحة: ${right}\n\n🏅 نقاطك: ${ctx.session.quiz.points} | 🔥 السلسلة: ${ctx.session.quiz.streak}${badgesLine}${explain}`,
      quizAfterKeyboard()
    );
  });

  bot.catch((err, ctx) => {
    // eslint-disable-next-line no-console
    console.error('bot error', err);
    if (ctx?.reply) {
      return ctx.reply('حدث خطأ غير متوقع.');
    }
    return undefined;
  });

  return bot;
}

module.exports = { buildBot };
