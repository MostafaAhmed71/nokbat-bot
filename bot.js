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
  studentPickKeyboard,
} = require('./handlers/student');
const { promptForNationalId, handleNationalIdText } = require('./handlers/results');

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
        'أهلاً أيها المدير.\n\nاستخدم /admin لفتح لوحة التحكم، ومنها يمكنك البحث باسم أي طالب لمعرفة لجنته (الرقم والمكان).'
      );
    }

    const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
    if (teacher) {
      ctx.session.awaiting = null;
      return ctx.reply(
        `أهلاً ${teacher.name}.\n\nيمكنك عرض جدولك لهذا اليوم، أو البحث باسم أي طالب لمعرفة صفّه وفصله ورقم ومكان لجنته.`,
        teacherMainKeyboard()
      );
    }

    ctx.session.awaiting = 'student_committee';
    return ctx.reply(
      'أهلاً بك في بوت متوسطة وثانوية نخبة الشمال الأهلية.\n\n- لمعرفة اللجنة: اكتب اسمك الكامل\n- لمعرفة النتيجة: اكتب /result ثم رقم الهوية'
    );
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

    const { data, error } = await searchStudentsByName(txt);
    if (error) {
      return ctx.reply('تعذر البحث حالياً. حاول لاحقاً.');
    }
    if (!data.length) {
      return ctx.reply(
        'لم يتم العثور على اسمك، تأكد من الاسم أو تواصل مع الإدارة.'
      );
    }
    if (data.length === 1) {
      return ctx.reply(formatStudentCommittee(data[0]));
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
    return ctx.reply(msg);
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
