const fs = require('fs');
const path = require('path');

const pdfParseMod = require('pdf-parse');
const mammoth = require('mammoth');

function extOf(p) {
  return String(path.extname(p || '') || '').toLowerCase();
}

/** عندما لا يضع تيليجرام امتداداً في اسم الملف نستنتجه من نوع MIME */
function inferExtFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m === 'application/pdf') return '.pdf';
  if (
    m ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return '.docx';
  if (m === 'application/msword') return '.doc';
  if (m === 'text/plain' || m.startsWith('text/')) return '.txt';
  return '';
}

/**
 * pdf-parse v2+ يصدّر PDFParse مع getText({ data }).
 * الإصدارات القديمة (v1) تُصدّر دالة (buffer) => Promise<{ text }>.
 */
async function extractPdfText(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  const PDFParse = pdfParseMod?.PDFParse;
  if (typeof PDFParse === 'function') {
    const parser = new PDFParse({ data: buf });
    const result = await parser.getText();
    return String(result?.text ?? '');
  }

  let pdfParse =
    typeof pdfParseMod === 'function' ? pdfParseMod : pdfParseMod?.default;
  if (typeof pdfParse !== 'function') pdfParse = pdfParseMod?.pdfParse;
  if (typeof pdfParse !== 'function') pdfParse = pdfParseMod?.default?.pdfParse;
  if (typeof pdfParse !== 'function') pdfParse = pdfParseMod?.default?.default;
  if (typeof pdfParse !== 'function') {
    throw new Error('pdf_parse_invalid_export');
  }
  const out = await pdfParse(buf);
  return String(out?.text || '');
}

async function extractTextFromFile(filePath, mime) {
  const p = String(filePath || '').trim();
  if (!p) throw new Error('filePath is required');
  const m = String(mime || '').toLowerCase();
  const ext = extOf(p);

  if (ext === '.txt' || m.startsWith('text/')) {
    return fs.readFileSync(p, 'utf8');
  }

  if (ext === '.pdf' || m === 'application/pdf') {
    const buf = fs.readFileSync(p);
    return extractPdfText(buf);
  }

  if (
    ext === '.docx' ||
    m ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const buf = fs.readFileSync(p);
    try {
      const out = await mammoth.extractRawText({ buffer: buf });
      return String(out?.value || '');
    } catch (err) {
      throw new Error(
        `word_extract_failed: ${err?.message || 'unknown'}`
      );
    }
  }

  if (ext === '.doc' || m === 'application/msword') {
    const buf = fs.readFileSync(p);
    try {
      const out = await mammoth.extractRawText({ buffer: buf });
      const t = String(out?.value || '').trim();
      if (t) return t;
    } catch {
      /* mammoth لا يدعم Word القديم (.doc) عادة */
    }
    throw new Error('doc_legacy_not_supported');
  }

  throw new Error(`unsupported file type: ${ext || m || 'unknown'}`);
}

module.exports = {
  extractTextFromFile,
  extractPdfText,
  inferExtFromMime,
};
