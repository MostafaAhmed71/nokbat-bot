const cron = require('node-cron');
const { getAdminWeeklyKpis } = require('./supabase');

function formatWeeklyReport(k) {
  return [
    '📊 تقرير أسبوعي — نخبة الشمال',
    '',
    `👨‍🎓 الطلاب (إجمالي السجلات): ${k.studentsTotal}`,
    `✅ طلاب مربوطون بتيليجرام: ${k.studentsLinked}`,
    `👨‍🏫 معلمون مربوطون: ${k.teachersLinked}`,
    `👨‍👩‍👧 سجلات أولياء الأمور: ${k.parentsTotal}`,
    `📚 عناصر مكتبة المحتوى: ${k.contentItemsTotal}`,
    '',
    '— نشاط آخر 7 أيام —',
    `💬 رسائل مساعد AI المحفوظة: ${k.chatHistoryWeek}`,
    `⭐ مفضلة جديدة: ${k.favoritesWeek}`,
    `📊 اختبارات تشخيصية: ${k.diagnosticTestsWeek}`,
    `⚡ إجابات تحدي اليوم: ${k.challengeAnswersWeek}`,
    `📢 إعلانات مرسلة: ${k.announcementsWeek}`,
  ].join('\n');
}

function startAdminReportCron(bot) {
  // جمعة 8 مساءً بتوقيت الرياض
  cron.schedule(
    '0 20 * * 5',
    async () => {
      const adminId = process.env.ADMIN_TELEGRAM_ID;
      if (adminId == null || String(adminId).trim() === '') return;
      try {
        const { data, error } = await getAdminWeeklyKpis();
        if (error) throw error;
        const text = formatWeeklyReport(data);
        await bot.telegram.sendMessage(String(adminId), text);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('admin weekly report cron', e);
      }
    },
    { timezone: 'Asia/Riyadh' }
  );
}

module.exports = { startAdminReportCron };
