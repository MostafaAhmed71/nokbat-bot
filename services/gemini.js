const { GoogleGenerativeAI } = require('@google/generative-ai');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function normalizeSubjectKey(subjectKey) {
  return String(subjectKey || '').trim().toLowerCase();
}

function subjectLabel(subjectKey) {
  const k = normalizeSubjectKey(subjectKey);
  const map = {
    math: 'رياضيات',
    science: 'علوم',
    arabic: 'لغتي',
    english: 'إنجليزي',
    islamic: 'إسلاميات',
    social: 'اجتماعيات',
    physics: 'فيزياء',
    chemistry: 'كمياء',
    biology: 'إحياء',
    qudrat_verbal: 'قدرات لفظي',
    qudrat_quant: 'قدرات كمي',
    tahsili: 'التحصيلي',
    other: 'أخرى',
  };
  return map[k] || 'أخرى';
}

function styleHint(style) {
  const s = String(style || 'medium');
  if (s === 'short') return 'أسلوب الشرح: مختصر جداً (سطرين إلى 5 أسطر).';
  if (s === 'detailed') return 'أسلوب الشرح: مفصل مع خطوات مرتبة وأمثلة.';
  return 'أسلوب الشرح: متوسط (واضح ومباشر مع مثال صغير عند الحاجة).';
}

function buildSystemPrompt(subjectKey, style) {
  const subj = subjectLabel(subjectKey);
  return [
    'أنت مساعد ذكاء اصطناعي للطلاب في مدرسة نخبة الشمال.',
    'أجب بالعربية فقط.',
    `تخصصك الحالي: ${subj}.`,
    styleHint(style),
    '',
    'قواعد مهمة:',
    '- اشرح الحل خطوة بخطوة بطريقة بسيطة.',
    '- إذا كان السؤال ناقصاً، اسأل سؤالاً واحداً لتوضيح المطلوب قبل إعطاء الحل.',
    '- إذا طلب الطالب إجابة نهائية فقط، أعطه الإجابة ثم شرح مختصر.',
    '- لا تقدّم إجابة على شكل اختيارات/أسئلة متعددة إلا إذا طلب الطالب ذلك صراحة.',
    '- لا تخترع معلومات غير مؤكدة؛ وإذا لم تكن متأكداً قل ذلك واقترح طريقة للتحقق.',
    '- تجنب أي محتوى غير مناسب للطلاب.',
    '- عند وجود سؤال متابعة، اربط الإجابة بالسؤال السابق قدر الإمكان.',
  ].join('\n');
}

function formatHistory(history) {
  const items = Array.isArray(history) ? history : [];
  if (!items.length) return '';
  const lines = ['سياق آخر محادثة (للربط فقط):'];
  for (const it of items.slice(-2)) {
    const q = String(it?.q || '').trim();
    const a = String(it?.a || '').trim();
    if (!q || !a) continue;
    lines.push(`- سؤال: ${q}`);
    lines.push(`- جواب: ${a}`);
  }
  return lines.join('\n');
}

async function askGemini({ subjectKey, question, history, style }) {
  const apiKey = requireEnv('GEMINI_API_KEY');
  const q = String(question || '').trim();
  if (!q) throw new Error('question is required');

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = String(process.env.GEMINI_MODEL || 'gemini-1.5-flash').trim();
  const sys = buildSystemPrompt(subjectKey, style);
  const hist = formatHistory(history);

  const isGemma = modelName.toLowerCase().startsWith('gemma-');
  const model = genAI.getGenerativeModel(
    isGemma
      ? { model: modelName }
      : { model: modelName, systemInstruction: sys }
  );

  const userPrompt = hist ? `${hist}\n\nسؤال الطالب:\n${q}` : `سؤال الطالب:\n${q}`;
  const prompt = isGemma ? `${sys}\n\n${userPrompt}` : userPrompt;
  const result = await model.generateContent(prompt);
  const text = result?.response?.text?.() || '';
  return String(text || '').trim();
}

module.exports = {
  askGemini,
  subjectLabel,
};

