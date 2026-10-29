/** @param {string} text */
function chunkUtf16(text, maxLen = 3900) {
  const s = String(text ?? '');
  if (s.length <= maxLen) return [s];
  const parts = [];
  let i = 0;
  while (i < s.length) {
    parts.push(s.slice(i, i + maxLen));
    i += maxLen;
  }
  return parts;
}

module.exports = { chunkUtf16 };
