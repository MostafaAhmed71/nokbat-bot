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
  aiAfterAnswerKeyboard,
  studentPickKeyboard,
} = require('./handlers/student');
const { promptForNationalId, handleNationalIdText } = require('./handlers/results');
const { askGemini, subjectLabel } = require('./services/gemini');

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
        },
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
      'مرحباً بك في بوت متوسطة وثانوية نخبة الشمال الأهلية.\n\nاختر خدمة من القائمة:',
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
    ctx.session.awaiting = 'ai_pick_subject';
    ctx.session.ai = ctx.session.ai || {};
    ctx.session.ai.subjectKey = null;
    return ctx.reply('🤖 اختر المادة التي تريد السؤال عنها:', aiSubjectsKeyboard());
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
      // نبقي وضع الـ AI فعّال للأسئلة المتتابعة حتى يرجع المستخدم للقائمة
      try {
        const answer = await askGemini({ subjectKey, question: txt });
        const safe =
          answer ||
          'لم أستطع توليد إجابة الآن. جرّب إعادة صياغة السؤال أو اسأل بطريقة أبسط.';
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
    return ctx.reply('اختر من القائمة:', studentMainKeyboard());
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
    ctx.session.awaiting = 'ai_question';
    await ctx.answerCbQuery();
    return ctx.reply('اكتب سؤالك وهرد عليك فوراً 👇', {
      reply_markup: { remove_keyboard: true },
    });
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
