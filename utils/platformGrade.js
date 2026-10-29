/**
 * Matches web platform uploaded_materials: stage middle|high + grade 7–12.
 */

function normalizeArabicText(text) {
  return String(text || '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @returns {{ stage: string, gradeNum: number } | null} */
function gradeKeyToPlatform(gradeKey) {
  const map = {
    m1: { stage: 'middle', gradeNum: 7 },
    m2: { stage: 'middle', gradeNum: 8 },
    m3: { stage: 'middle', gradeNum: 9 },
    s1: { stage: 'high', gradeNum: 10 },
    s2: { stage: 'high', gradeNum: 11 },
    s3: { stage: 'high', gradeNum: 12 },
  };
  return map[String(gradeKey || '').trim()] || null;
}

/**
 * Map Arabic grade label (as stored on students.grade / exams_schedule.grade)
 * to platform { stage, gradeNum }.
 * @returns {{ stage: string, gradeNum: number } | null}
 */
function arabicGradeLabelToPlatform(gradeLabel) {
  const n = normalizeArabicText(String(gradeLabel || '')).toLowerCase();
  if (!n) return null;

  const has = (substr) => n.includes(normalizeArabicText(substr).toLowerCase());
  const isMid = has('متوسط');
  const isHigh = has('ثانوي') || has('ثانوى');

  if (has('اول') || has('أول')) {
    if (isMid) return { stage: 'middle', gradeNum: 7 };
    if (isHigh) return { stage: 'high', gradeNum: 10 };
  }
  if (has('ثاني')) {
    if (isMid) return { stage: 'middle', gradeNum: 8 };
    if (isHigh) return { stage: 'high', gradeNum: 11 };
  }
  if (has('ثالث')) {
    if (isMid) return { stage: 'middle', gradeNum: 9 };
    if (isHigh) return { stage: 'high', gradeNum: 12 };
  }

  // Numeric fallback e.g. "الصف الثامن"
  const digit = n.match(/([7-9]|1[012])\b/) || n.match(/ صف.*?([7-9]|1[02])/);
  if (digit) {
    const g = parseInt(digit[1], 10);
    if (g >= 7 && g <= 9) return { stage: 'middle', gradeNum: g };
    if (g >= 10 && g <= 12) return { stage: 'high', gradeNum: g };
  }

  return null;
}

module.exports = {
  gradeKeyToPlatform,
  arabicGradeLabelToPlatform,
  normalizeArabicText,
};
