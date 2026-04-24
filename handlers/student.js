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

function studentMainKeyboard() {
  return Markup.keyboard([
    [Markup.button.text('🤖 اسأل مساعد AI')],
    [Markup.button.text('🧾 لجنّتي'), Markup.button.text('🏁 نتيجتي')],
    [Markup.button.text('ℹ️ المساعدة'), Markup.button.text('🏠 القائمة الرئيسية')],
  ]).resize();
}

function aiSubjectsKeyboard() {
  const rows = [
    [
      Markup.button.callback('📐 رياضيات', 'ai:sub:math'),
      Markup.button.callback('🔬 علوم', 'ai:sub:science'),
    ],
    [
      Markup.button.callback('📖 لغتي', 'ai:sub:arabic'),
      Markup.button.callback('📚 إنجليزي', 'ai:sub:english'),
    ],
    [
      Markup.button.callback('🕌 إسلاميات', 'ai:sub:islamic'),
      Markup.button.callback('📜 اجتماعيات', 'ai:sub:social'),
    ],
    [
      Markup.button.callback('فيزياء', 'ai:sub:physics'),
      Markup.button.callback('كمياء', 'ai:sub:chemistry'),
      Markup.button.callback('إحياء', 'ai:sub:biology'),
    ],
    [
      Markup.button.callback('قدرات لفظي', 'ai:sub:qudrat_verbal'),
      Markup.button.callback('قدرات كمي', 'ai:sub:qudrat_quant'),
    ],
    [Markup.button.callback('التحصيلي', 'ai:sub:tahsili')],
    [Markup.button.callback('🎯 أخرى', 'ai:sub:other')],
  ];

  rows.push([Markup.button.callback('🏠 رجوع للقائمة', 'ai:home')]);
  return Markup.inlineKeyboard(rows);
}

function aiAfterAnswerKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📌 تغيير المادة', 'ai:change_subject'),
      Markup.button.callback('📝 لخص', 'ai:summarize'),
    ],
    [
      Markup.button.callback('🧠 أبسط', 'ai:simplify'),
      Markup.button.callback('🧩 تفصيل', 'ai:detail'),
    ],
    [Markup.button.callback('اسأل سؤال تاني 🔄', 'ai:again')],
    [Markup.button.callback('ارجع للقائمة 🏠', 'ai:home')],
  ]);
}

function helpKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🤖 كيف أستخدم مساعد AI؟', 'help:ai')],
    [Markup.button.callback('🧾 كيف أعرف لجنتي؟', 'help:committee')],
    [Markup.button.callback('🏁 كيف أطلع نتيجتي؟', 'help:result')],
    [Markup.button.callback('🏠 رجوع للقائمة', 'help:home')],
  ]);
}

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
  studentMainKeyboard,
  aiSubjectsKeyboard,
  aiAfterAnswerKeyboard,
  helpKeyboard,
  studentPickKeyboard,
};
