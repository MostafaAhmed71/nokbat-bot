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
    [Markup.button.text('🧪 اختبار سريع')],
    [Markup.button.text('📊 اختبار تشخيصي')],
    [Markup.button.text('⚡ تحدي اليوم'), Markup.button.text('🏆 المتصدرين')],
    [Markup.button.text('📅 جدول الامتحانات')],
    [Markup.button.text('⭐ مفضلتي')],
    [Markup.button.text('🧾 لجنّتي'), Markup.button.text('🏁 نتيجتي')],
    [Markup.button.text('⚙️ الإعدادات')],
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
    [
      Markup.button.callback('⚙️ أسلوب الشرح', 'ai:settings'),
      Markup.button.callback('🗑️ مسح المحادثة', 'ai:clear'),
    ],
    [Markup.button.callback('⭐ حفظ في المفضلة', 'fav:save')],
    [Markup.button.callback('📎 عرض المصادر', 'ai:sources')],
    [Markup.button.callback('اسأل سؤال تاني 🔄', 'ai:again')],
    [Markup.button.callback('ارجع للقائمة 🏠', 'ai:home')],
  ]);
}

function settingsKeyboard(currentStyle) {
  const s = String(currentStyle || 'medium');
  const opt = (id, label) =>
    Markup.button.callback(`${s === id ? '✅ ' : ''}${label}`, `set:style:${id}`);
  return Markup.inlineKeyboard([
    [opt('short', 'مختصر'), opt('medium', 'متوسط'), opt('detailed', 'مفصل')],
    [Markup.button.callback('🏠 رجوع للقائمة', 'help:home')],
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

function quizSubjectsKeyboard() {
  // إعادة استخدام نفس توزيع المواد لكن callback مختلفة
  const rows = [
    [
      Markup.button.callback('📐 رياضيات', 'quiz:sub:math'),
      Markup.button.callback('🔬 علوم', 'quiz:sub:science'),
    ],
    [
      Markup.button.callback('📖 لغتي', 'quiz:sub:arabic'),
      Markup.button.callback('📚 إنجليزي', 'quiz:sub:english'),
    ],
    [
      Markup.button.callback('🕌 إسلاميات', 'quiz:sub:islamic'),
      Markup.button.callback('📜 اجتماعيات', 'quiz:sub:social'),
    ],
    [
      Markup.button.callback('فيزياء', 'quiz:sub:physics'),
      Markup.button.callback('كمياء', 'quiz:sub:chemistry'),
      Markup.button.callback('إحياء', 'quiz:sub:biology'),
    ],
    [
      Markup.button.callback('قدرات لفظي', 'quiz:sub:qudrat_verbal'),
      Markup.button.callback('قدرات كمي', 'quiz:sub:qudrat_quant'),
    ],
    [Markup.button.callback('التحصيلي', 'quiz:sub:tahsili')],
    [Markup.button.callback('🎯 أخرى', 'quiz:sub:other')],
  ];
  rows.push([Markup.button.callback('🏠 رجوع للقائمة', 'quiz:home')]);
  return Markup.inlineKeyboard(rows);
}

function quizAnswerKeyboard(options) {
  const opts = Array.isArray(options) ? options.slice(0, 4) : [];
  const rows = opts.map((t, i) => [
    Markup.button.callback(String(t).slice(0, 60), `quiz:ans:${i}`),
  ]);
  rows.push([
    Markup.button.callback('🔁 سؤال جديد', 'quiz:next'),
    Markup.button.callback('🏠 القائمة', 'quiz:home'),
  ]);
  return Markup.inlineKeyboard(rows);
}

function quizAfterKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔁 سؤال جديد', 'quiz:next'),
      Markup.button.callback('📌 تغيير المادة', 'quiz:change_subject'),
    ],
    [Markup.button.callback('⚙️ إعدادات الاختبار', 'quiz:settings')],
    [Markup.button.callback('🏠 القائمة', 'quiz:home')],
  ]);
}

function quizDifficultyKeyboard(current) {
  const d = String(current || 'medium');
  const opt = (id, label) =>
    Markup.button.callback(`${d === id ? '✅ ' : ''}${label}`, `quiz:diff:${id}`);
  return Markup.inlineKeyboard([
    [opt('easy', 'سهل'), opt('medium', 'متوسط'), opt('hard', 'صعب')],
    [Markup.button.callback('🏠 رجوع للقائمة', 'quiz:home')],
  ]);
}

function gradesKeyboard(prefix = 'grade:set', homeCallback = 'help:home') {
  const mk = (key, label) => Markup.button.callback(label, `${prefix}:${key}`);
  return Markup.inlineKeyboard([
    [mk('m1', 'أول متوسط'), mk('m2', 'ثاني متوسط'), mk('m3', 'ثالث متوسط')],
    [mk('s1', 'أول ثانوي'), mk('s2', 'ثاني ثانوي'), mk('s3', 'ثالث ثانوي')],
    [Markup.button.callback('🏠 رجوع', homeCallback)],
  ]);
}

module.exports = {
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
};
