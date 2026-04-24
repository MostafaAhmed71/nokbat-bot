const { Markup } = require('telegraf');
const { getTodayArabicDay } = require('../utils/days');
const {
  getScheduleForTeacherOnDay,
  searchStudentsByName,
} = require('../services/supabase');
const { formatStudentCommittee, studentPickKeyboard } = require('./student');

function teacherMainKeyboard() {
  return Markup.keyboard([
    [
      Markup.button.text('📅 جدولي اليوم'),
      Markup.button.text('🔎 بحث طالب (لجنة)'),
    ],
    [Markup.button.text('🏠 القائمة الرئيسية')],
  ]).resize();
}

function formatScheduleRows(rows) {
  if (!rows.length) return 'لا توجد حصص مسجلة لهذا اليوم في الجدول.';
  return rows
    .map((r) => `• ${r.period}: ${r.grade || '—'} / ${r.class || '—'}`)
    .join('\n');
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
  handleTeacherText,
};
