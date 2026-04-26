const cron = require('node-cron');
const {
  listExamsOnDate,
  listStudentTelegramIdsByGrade,
  listParentTelegramIdsByStudentGrade,
} = require('./supabase');

function dayIso(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatExamLine(exam) {
  const t = exam.exam_time ? ` — ${exam.exam_time}` : '';
  return `• ${exam.subject}${t}`;
}

async function sendExamReminders(bot) {
  const tomorrow = dayIso(addDays(new Date(), 1));
  const { data: exams, error } = await listExamsOnDate(tomorrow);
  if (error) throw error;
  if (!exams.length) return;

  const byGrade = new Map();
  for (const ex of exams) {
    const g = ex.grade || '—';
    if (!byGrade.has(g)) byGrade.set(g, []);
    byGrade.get(g).push(ex);
  }

  for (const [grade, items] of byGrade) {
    const { data: studentIds } = await listStudentTelegramIdsByGrade(grade);
    const { data: parentIds } = await listParentTelegramIdsByStudentGrade(grade);
    const recipients = Array.from(new Set([...(studentIds || []), ...(parentIds || [])]));
    if (!recipients.length) continue;

    const msg =
      `📅 تذكير: امتحانات غداً (${tomorrow}) — ${grade}\n\n` +
      items.map(formatExamLine).join('\n') +
      '\n\nبالتوفيق لكم.';

    for (const tgId of recipients) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await bot.telegram.sendMessage(tgId, msg);
      } catch {
        // تجاهل فشل الإرسال لمستخدم واحد
      }
    }
  }
}

function startExamsCron(bot) {
  // يومياً الساعة 8 مساء بتوقيت السعودية
  cron.schedule(
    '0 20 * * *',
    async () => {
      try {
        await sendExamReminders(bot);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('exams cron error', e);
      }
    },
    { timezone: 'Asia/Riyadh' }
  );
}

module.exports = { startExamsCron, sendExamReminders };

