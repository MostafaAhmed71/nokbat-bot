/** أسماء الأيام كما تُخزَّن غالباً في الجدول (السعودية: السبت أول أسبوع دراسي) */
const EN_WEEKDAY_TO_AR = {
  Saturday: 'السبت',
  Sunday: 'الأحد',
  Monday: 'الاثنين',
  Tuesday: 'الثلاثاء',
  Wednesday: 'الأربعاء',
  Thursday: 'الخميس',
  Friday: 'الجمعة',
};

/**
 * اسم اليوم بالعربية وفق توقيت الرياض (ليطابق جدول المدرسة).
 */
function getTodayArabicDay() {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Riyadh',
    weekday: 'long',
  }).format(new Date());
  return EN_WEEKDAY_TO_AR[weekday] || weekday;
}

module.exports = { getTodayArabicDay, EN_WEEKDAY_TO_AR };
