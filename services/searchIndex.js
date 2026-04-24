const MiniSearch = require('minisearch');

// كاش لكل (grade|subject) لتفادي إعادة البناء في كل سؤال
const cache = new Map();

function cacheKey(grade, subjectKey) {
  return `${grade}|||${subjectKey}`;
}

function buildIndex(rows) {
  const ms = new MiniSearch({
    fields: ['chunk_text', 'title'],
    storeFields: ['chunk_text', 'chunk_order', 'item_id', 'title'],
    searchOptions: { boost: { title: 2 }, fuzzy: 0.15, prefix: true },
  });

  const docs = (rows || []).map((r) => ({
    id: r.id,
    item_id: r.item_id,
    chunk_order: r.chunk_order,
    chunk_text: r.chunk_text,
    title: r.title || '',
  }));
  ms.addAll(docs);
  return ms;
}

async function searchTopK({ grade, subjectKey, query, topK = 5, loader }) {
  const k = cacheKey(grade, subjectKey);
  const now = Date.now();
  const entry = cache.get(k);
  const ttlMs = 5 * 60 * 1000;

  let ms = entry?.ms;
  if (!ms || !entry.builtAt || now - entry.builtAt > ttlMs) {
    const rows = await loader();
    ms = buildIndex(rows);
    cache.set(k, { ms, builtAt: now });
  }

  const results = ms.search(String(query || ''), { limit: topK });
  return results.map((r, idx) => ({
    rank: idx + 1,
    score: r.score,
    chunk_text: r.chunk_text,
    chunk_order: r.chunk_order,
    item_id: r.item_id,
    title: r.title,
  }));
}

function invalidateIndex(grade, subjectKey) {
  cache.delete(cacheKey(grade, subjectKey));
}

module.exports = { searchTopK, invalidateIndex };

