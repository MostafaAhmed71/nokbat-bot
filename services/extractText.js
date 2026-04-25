const fs = require('fs');
const path = require('path');

const pdfParseMod = require('pdf-parse');
const mammoth = require('mammoth');

function extOf(p) {
  return String(path.extname(p || '') || '').toLowerCase();
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
    const pdfParse =
      typeof pdfParseMod === 'function' ? pdfParseMod : pdfParseMod?.default;
    if (typeof pdfParse !== 'function') {
      throw new Error('pdf_parse_invalid_export');
    }
    const out = await pdfParse(buf);
    return String(out?.text || '');
  }

  if (ext === '.docx' || m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const buf = fs.readFileSync(p);
    const out = await mammoth.extractRawText({ buffer: buf });
    return String(out?.value || '');
  }

  throw new Error(`unsupported file type: ${ext || m || 'unknown'}`);
}

module.exports = { extractTextFromFile };

