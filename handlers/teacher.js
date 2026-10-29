const { Markup } = require('telegraf');
const { getTodayArabicDay } = require('../utils/days');
const {
  getScheduleForTeacherOnDay,
  searchStudentsByName,
  listContentItemsByUploader,
} = require('../services/supabase');
const { subjectLabel } = require('../services/gemini');
const { formatStudentCommittee, studentPickKeyboard } = require('./student');

function teacherMainKeyboard() {
  return Markup.keyboard([
    [
      Markup.button.text('📅 جدولي اليوم'),
      Markup.button.text('🔎 بحث طالب (لجنة)'),
    ],
    [Markup.button.text('📤 رفع مراجعة')],
    [Markup.button.text('📋 مراجعاتي المرفوعة')],
    [Markup.button.text('🏠 القائمة الرئيسية')],
  ]).resize();
}

function formatScheduleRows(rows) {
  if (!rows.length) return 'لا توجد حصص مسجلة لهذا اليوم في الجدول.';
  return rows
    .map((r) => `• ${r.period}: ${r.grade || '—'} / ${r.class || '—'}`)
    .join('\n');
}

async function sendTeacherUploadList(ctx) {
  ctx.session.awaiting = null;
  const { data, error } = await listContentItemsByUploader(String(ctx.from.id), {
    limit: 20,
  });
  if (error) {
    return ctx.reply('تعذر جلب قائمة المراجعات. حاول لاحقاً.', teacherMainKeyboard());
  }
  if (!data.length) {
    return ctx.reply(
      'لا توجد مراجعات مسجلة باسمك في النظام بعد.\n\n' +
        'إذا رفعت ملفاً وظهرت لك «تم رفع المراجعة وفهرستها» فالمرجع مضاف. من «مراجعاتي المرفوعة» تتأكد دائماً.\n' +
        'إذا لم تظهر تلك الرسالة فالرفع لم يكتمل (حجم، صيغة، أو خطأ).',
      teacherMainKeyboard()
    );
  }
  const lines = data.map((row, i) => {
    const date = row.created_at
      ? new Date(row.created_at).toLocaleString('ar-EG', {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : '—';
    const sub = subjectLabel(row.subject_key) || row.subject_key;
    const src = row.source === 'telegram' ? 'تيليجرام' : row.source || '—';
    return (
      `${i + 1}. ${row.title}\n` +
      `   الصف: ${row.grade} | ${sub}\n` +
      `   المصدر: ${src} | ${date}`
    );
  });
  const body = lines.join('\n\n');
  const msg =
    `مراجعاتك المسجلة كمرفوعة من حسابك (آخر ${data.length}):\n\n${body}`;
  if (msg.length > 3900) {
    const shortLines = data.slice(0, 12).map((row, i) => {
      const sub = subjectLabel(row.subject_key) || row.subject_key;
      return `${i + 1}. ${row.title} — ${row.grade} / ${sub}`;
    });
    return ctx.reply(
      `مراجعاتك (مختصرة):\n\n${shortLines.join('\n')}\n\nاضغط مرة أخرى لاحقاً أو راجع لوحة الأدمن للقائمة الكاملة.`,
      teacherMainKeyboard()
    );
  }
  return ctx.reply(msg, teacherMainKeyboard());
}

async function sendTodaySchedule(ctx, teacher) {
  const day = getTodayArabicDay();
  const { data, error } = await getScheduleForTeacherOnDay(teacher.id, day);
  if (error) {
    return ctx.reply('تعذر جلب الجدول. حاول لاحقاً.');
  }
  const header = `جدولك ليوم ${day}:\n\n`;
  return ctx.reply(header + formatScheduleRows(data), teacherMainKeyboard());
}

async function handleTeacherText(ctx, teacher) {
  const t = (ctx.message.text || '').trim();
  if (t === '📅 جدولي اليوم' || t === 'جدولي اليوم') {
    ctx.session.awaiting = null;
    return sendTodaySchedule(ctx, teacher);
  }
  if (
    t === '🔎 بحث طالب (لجنة)' ||
    t === 'بحث طالب (لجنة)' ||
    t === 'البحث عن طالب'
  ) {
    ctx.session.awaiting = 'teacher_student';
    return ctx.reply(
      'اكتب اسم الطالب (أو جزءاً منه) لعرض الصف والفصل ورقم اللجنة ومكانها.',
      Markup.removeKeyboard()
    );
  }
  if (t === '🏠 القائمة الرئيسية') {
    ctx.session.awaiting = null;
    return ctx.reply('تم.', teacherMainKeyboard());
  }
  if (t === '📋 مراجعاتي المرفوعة' || t === 'مراجعاتي المرفوعة') {
    return sendTeacherUploadList(ctx);
  }
  if (ctx.session.awaiting === 'teacher_student') {
    const { data, error } = await searchStudentsByName(t);
    if (error) {
      return ctx.reply('حدث خطأ أثناء البحث.', teacherMainKeyboard());
    }
    if (!data.length) {
      return ctx.reply(
        'لم يتم العثور على طالب بهذا الاسم.',
        teacherMainKeyboard()
      );
    }
    ctx.session.awaiting = null;
    if (data.length === 1) {
      return ctx.reply(
        formatStudentCommittee(data[0], { forStaff: true }),
        teacherMainKeyboard()
      );
    }
    return ctx.reply(
      'وجدنا أكثر من نتيجة. اختر الطالب لعرض بيانات لجنته:',
      studentPickKeyboard(data)
    );
  }
  return ctx.reply(
    'اضغط «جدولي اليوم» أو «بحث طالب (لجنة)».',
    teacherMainKeyboard()
  );
}

module.exports = {
  teacherMainKeyboard,
  sendTodaySchedule,
  sendTeacherUploadList,
  handleTeacherText,
};
