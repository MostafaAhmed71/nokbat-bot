/**
 * تطبيع بسيط للبحث العربي (يتماشى مع arabic_search_key في Supabase قدر الإمكان).
 */
function foldArabic(s) {
  if (!s) return '';
  return s
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640\u06DF]/gu, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** هروب نصوص ilike في PostgREST */
function escapeIlike(s) {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * أنماط بحث متعددة (بدون دالة SQL) لتقليل مشكلة أ/إ/آ وى/ي وغيرها.
 */
function expandSearchPatterns(q) {
  const raw = (q || '').trim();
  if (!raw) return [];
  const out = new Set([raw, foldArabic(raw)]);
  const f = foldArabic(raw);
  if (f) {
    out.add(f.replace(/ا/g, 'أ'));
    out.add(f.replace(/ا/g, 'إ'));
    out.add(f.replace(/ا/g, 'آ'));
    out.add(f.replace(/ا/g, 'ٱ'));
    out.add(f.replace(/ي/g, 'ى'));
    out.add(f.replace(/ه/g, 'ة'));
  }
  return [...out].filter(Boolean).slice(0, 24);
}

module.exports = { foldArabic, escapeIlike, expandSearchPatterns };
