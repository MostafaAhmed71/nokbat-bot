function toLatinDigits(s) {
  return String(s || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/**
 * تطبيع رقم الهوية: تحويل الأرقام العربية، إزالة المسافات والشرطات.
 * لا نحذف الأصفار في البداية.
 */
function normalizeNationalId(input) {
  const s = toLatinDigits(input);
  return s.replace(/[\s\-–—_]/g, '').trim();
}

module.exports = { normalizeNationalId };

