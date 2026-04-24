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

function buildSystemPrompt(subjectKey) {
  const subj = subjectLabel(subjectKey);
  return [
    'أنت مساعد ذكاء اصطناعي للطلاب في مدرسة نخبة الشمال.',
    'أجب بالعربية فقط.',
    `تخصصك الحالي: ${subj}.`,
    '',
    'قواعد مهمة:',
    '- اشرح الحل خطوة بخطوة بطريقة بسيطة.',
    '- إذا كان السؤال ناقصاً، اسأل سؤالاً واحداً لتوضيح المطلوب قبل إعطاء الحل.',
    '- إذا طلب الطالب إجابة نهائية فقط، أعطه الإجابة ثم شرح مختصر.',
    '- لا تخترع معلومات غير مؤكدة؛ وإذا لم تكن متأكداً قل ذلك واقترح طريقة للتحقق.',
    '- تجنب أي محتوى غير مناسب للطلاب.',
  ].join('\n');
}

async function askGemini({ subjectKey, question }) {
  const apiKey = requireEnv('GEMINI_API_KEY');
  const q = String(question || '').trim();
  if (!q) throw new Error('question is required');

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = String(process.env.GEMINI_MODEL || 'gemini-1.5-flash').trim();
  const sys = buildSystemPrompt(subjectKey);

  const isGemma = modelName.toLowerCase().startsWith('gemma-');
  const model = genAI.getGenerativeModel(
    isGemma
      ? { model: modelName }
      : { model: modelName, systemInstruction: sys }
  );

  const prompt = isGemma ? `${sys}\n\nسؤال الطالب:\n${q}` : q;
  const result = await model.generateContent(prompt);
  const text = result?.response?.text?.() || '';
  return String(text || '').trim();
}

module.exports = {
  askGemini,
  subjectLabel,
};

