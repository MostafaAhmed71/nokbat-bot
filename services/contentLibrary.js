const path = require('path');

const { extractTextFromFile } = require('./extractText');
const { chunkText } = require('./chunkText');
const {
  createContentItem,
  insertContentChunks,
  listContentChunksForGradeSubject,
} = require('./supabase');
const { searchTopK, invalidateIndex } = require('./searchIndex');

function safeKey(s) {
  return String(s || '').trim();
}

function ensureGradeSubject({ grade, subjectKey }) {
  const g = safeKey(grade);
  const sk = safeKey(subjectKey);
  if (!g) throw new Error('grade is required');
  if (!sk) throw new Error('subjectKey is required');
  return { grade: g, subjectKey: sk };
}

async function ingestFile({
  kind = 'review',
  grade,
  subjectKey,
  title,
  filePath,
  mime,
  source = 'web',
  uploadedByTelegramId = null,
}) {
  const { grade: g, subjectKey: sk } = ensureGradeSubject({ grade, subjectKey });
  const fp = String(filePath || '').trim();
  if (!fp) throw new Error('filePath is required');

  const extracted = await extractTextFromFile(fp, mime);
  const chunks = chunkText(extracted);
  if (!chunks.length) throw new Error('no_text_extracted');

  const itemTitle =
    String(title || '').trim() || path.basename(fp).replace(/\.[^.]+$/, '');

  const { data: item, error: itemErr } = await createContentItem({
    kind,
    grade: g,
    subject_key: sk,
    title: itemTitle,
    file_path: fp,
    mime: mime || null,
    source,
    uploaded_by_telegram_id: uploadedByTelegramId,
  });
  if (itemErr) throw itemErr;

  const { error: chunkErr } = await insertContentChunks(
    item.id,
    chunks.map((chunk_text, idx) => ({ chunk_order: idx, chunk_text }))
  );
  if (chunkErr) throw chunkErr;

  invalidateIndex(g, sk);
  return { itemId: item.id, chunksCount: chunks.length, title: itemTitle };
}

async function searchLibrary({ grade, subjectKey, query, topK = 5 }) {
  const { grade: g, subjectKey: sk } = ensureGradeSubject({ grade, subjectKey });
  const q = String(query || '').trim();
  if (!q) return [];

  const chunks = await searchTopK({
    grade: g,
    subjectKey: sk,
    query: q,
    topK,
    loader: async () => {
      const { data, error } = await listContentChunksForGradeSubject(g, sk);
      if (error) throw error;
      return data || [];
    },
  });

  return chunks;
}

module.exports = { ingestFile, searchLibrary };

