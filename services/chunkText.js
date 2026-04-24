function normalizeText(s) {
  return String(s || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function chunkText(text, { chunkSize = 900, overlap = 150 } = {}) {
  const t = normalizeText(text);
  if (!t) return [];

  const chunks = [];
  let i = 0;
  while (i < t.length) {
    const end = Math.min(t.length, i + chunkSize);
    const part = t.slice(i, end).trim();
    if (part) chunks.push(part);
    if (end >= t.length) break;
    i = Math.max(0, end - overlap);
  }
  return chunks;
}

module.exports = { chunkText, normalizeText };

