function extractJsonObject(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const raw = s.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = { extractJsonObject };
