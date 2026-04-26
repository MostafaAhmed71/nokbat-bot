const fs = require('fs');
const path = require('path');

const pdfParseMod = require('pdf-parse');
const mammoth = require('mammoth');

function extOf(p) {
  return String(path.extname(p || '') || '').toLowerCase();
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

  if (ext === '.docx' || m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const buf = fs.readFileSync(p);
    const out = await mammoth.extractRawText({ buffer: buf });
    return String(out?.value || '');
  }

  throw new Error(`unsupported file type: ${ext || m || 'unknown'}`);
}

module.exports = { extractTextFromFile, extractPdfText };
