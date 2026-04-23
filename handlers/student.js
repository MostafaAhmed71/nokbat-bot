/**
 * @param {object} s صف طالب من قاعدة البيانات
 * @param {{ forStaff?: boolean }} opts إن forStaff: يُعرض عنوان يوضح أن النتيجة لاستعلام المعلم/المدير عن اللجنة
 */
function formatStudentCommittee(s, opts = {}) {
  const lines = [];
  if (opts.forStaff) {
    lines.push('نتيجة البحث — بيانات اللجنة للطالب:', '');
  }
  lines.push(
    `الاسم: ${s.name}`,
    `الصف: ${s.grade || '—'}`,
    `الفصل: ${s.class || '—'}`,
    `رقم اللجنة: ${s.committee_number || '—'}`,
    `مكان اللجنة: ${s.committee_location || '—'}`
  );
  return lines.join('\n');
}

const { Markup } = require('telegraf');

function studentPickKeyboard(students) {
  const rows = students.map((s) => [
    Markup.button.callback(
      `${s.name} (${s.grade || '؟'} / ${s.class || '؟'})`.slice(0, 60),
      `pick:stu:${s.id}`
    ),
  ]);
  return Markup.inlineKeyboard(rows);
}

module.exports = {
  formatStudentCommittee,
  studentPickKeyboard,
};
