const cron = require('node-cron');
const { todayIsoRiyadh } = require('../utils/dateRiyadh');
const { extractJsonObject } = require('../utils/jsonExtract');
const { askGemini, subjectLabel } = require('./gemini');
const {
  getDailyChallengeByDate,
  insertDailyChallenge,
  listChallengeTopForDate,
  getStudentNamesByTelegramIds,
  listAllStudentTelegramIds,
} = require('./supabase');

function pickSubjectForDay() {
  const keys = [
    'math',
    'science',
    'arabic',
    'english',
    'islamic',
    'social',
    'physics',
    'chemistry',
  ];
  const d = todayIsoRiyadh();
  const n = d.split('-').reduce((a, x) => a + Number(x, 10), 0);
  return keys[n % keys.length];
}

async function generateDailyMcq() {
  const subjectKey = pickSubjectForDay();
  const subjectName = subjectLabel(subjectKey);
  const prompt = [
    'اكتب سؤالاً واحداً اختيار من متعدد بالعربية.',
    `المادة: ${subjectName}.`,
    'أخرج JSON فقط بدون أي نص آخر.',
    '{"question":"...","options":["أ","ب","ج","د"],"correctIndex":0}',
    '- options أربعة بالضبط، correctIndex من 0 إلى 3.',
  ].join('\n');

  const raw = await askGemini({
    subjectKey,
    question: prompt,
    history: [],
    style: 'short',
  });
  const obj = extractJsonObject(raw);
  if (!obj) throw new Error('challenge_json');
  const q = String(obj.question || '').trim();
  const options = Array.isArray(obj.options) ? obj.options.map((x) => String(x)) : [];
  const correctIndex = Number(obj.correctIndex);
  if (!q || options.length !== 4 || correctIndex < 0 || correctIndex > 3) {
    throw new Error('challenge_invalid');
  }
  return { subjectKey, question: q, options, correctIndex };
}

async function ensureDailyChallenge() {
  const day = todayIsoRiyadh();
  const { data: existing } = await getDailyChallengeByDate(day);
  if (existing) return existing;

  const gen = await generateDailyMcq();
  const { data, error } = await insertDailyChallenge({
    challenge_date: day,
    subject_key: gen.subjectKey,
    question: gen.question,
    options: gen.options,
    correct_index: gen.correctIndex,
  });
  if (error && String(error.code || '') === '23505') {
    const { data: again } = await getDailyChallengeByDate(day);
    return again;
  }
  if (error) throw error;
  return data;
}

async function announceChallengeWinners(bot) {
  const day = todayIsoRiyadh();
  const { data: top, error } = await listChallengeTopForDate(day, 5);
  if (error || !top?.length) return;

  const ids = top.map((r) => String(r.telegram_id || '').trim()).filter(Boolean);
  const { data: names } = await getStudentNamesByTelegramIds(ids);
  const nameBy = new Map((names || []).map((r) => [String(r.telegram_id), r.name]));
  const lines = top.map((r, i) => {
    const nm = nameBy.get(String(r.telegram_id)) || `TG:${r.telegram_id}`;
    return `${i + 1}. ${nm} — ${r.points} نقطة`;
  });
  const msg =
    `🏆 أبرز المشاركين في تحدي اليوم (${day}):\n\n${lines.join('\n')}\n\nشكراً للمشاركين، والتوفيق في الغد.`;

  const { data: all } = await listAllStudentTelegramIds();
  for (const id of all || []) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await bot.telegram.sendMessage(id, msg);
    } catch {
      // ignore
    }
  }
}

function startChallengesCron(bot) {
  cron.schedule(
    '0 7 * * *',
    async () => {
      try {
        await ensureDailyChallenge();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('daily challenge cron', e);
      }
    },
    { timezone: 'Asia/Riyadh' }
  );

  cron.schedule(
    '0 21 * * *',
    async () => {
      try {
        await announceChallengeWinners(bot);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('challenge winners cron', e);
      }
    },
    { timezone: 'Asia/Riyadh' }
  );
}

module.exports = { startChallengesCron, ensureDailyChallenge, announceChallengeWinners };
