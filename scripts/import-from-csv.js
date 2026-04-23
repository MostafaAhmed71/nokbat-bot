/**
 * استيراد من Excel: احفظ كل شيت كـ CSV (ترميز UTF-8).
 * من جذر المشروع:
 *   node scripts/import-from-csv.js teachers data/teachers.csv
 *   node scripts/import-from-csv.js students data/students.csv
 *   node scripts/import-from-csv.js schedule data/schedule.csv
 *   node scripts/import-from-csv.js all
 *
 * فاصل الأعمدة الافتراضي: فاصلة (,). إن كان Excel يصدّر بفاصلة منقوطة:
 *   node scripts/import-from-csv.js all --delimiter=;
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'ضع SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY (مفضل) أو SUPABASE_ANON_KEY في .env'
    );
  }
  return createClient(url, key);
}

function readCsv(filePath, delimiter) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    delimiter,
    relax_column_count: true,
  });
  return records;
}

function normKey(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k == null) continue;
    const key = String(k)
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    out[key] = v == null ? '' : String(v).trim();
  }
  return out;
}

function pick(row, ...keys) {
  const r = normKey(row);
  for (const k of keys) {
    const kk = k.toLowerCase();
    if (r[kk] !== undefined && r[kk] !== '') return r[kk];
  }
  return '';
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function importTeachers(supabase, filePath, delimiter) {
  const rows = readCsv(filePath, delimiter);
  const payload = [];
  for (const row of rows) {
    const name = pick(row, 'name', 'الاسم', 'اسم_المعلم');
    const subject = pick(row, 'subject', 'المادة', 'مادة');
    const telegram_id = pick(
      row,
      'telegram_id',
      'telegramid',
      'تيليجرام',
      'معرف_تيليجرام'
    );
    if (!name || !telegram_id) continue;
    payload.push({
      name,
      subject: subject || null,
      telegram_id: String(telegram_id).replace(/\s/g, ''),
    });
  }
  if (!payload.length) {
    console.log('لا صفوف صالحة للمعلمين.');
    return;
  }
  const { error } = await supabase
    .from('teachers')
    .upsert(payload, { onConflict: 'telegram_id' });
  if (error) throw error;
  console.log(`تم استيراد/تحديث ${payload.length} معلم(ين).`);
}

async function importStudents(supabase, filePath, delimiter) {
  const rows = readCsv(filePath, delimiter);
  const payload = [];
  for (const row of rows) {
    const name = pick(row, 'name', 'الاسم', 'اسم_الطالب');
    if (!name) continue;
    payload.push({
      name,
      national_id: pick(row, 'national_id', 'nationalid', 'الهوية', 'رقم_الهوية') || null,
      grade: pick(row, 'grade', 'الصف', 'صف') || null,
      class: pick(row, 'class', 'الفصل', 'فصل') || null,
      committee_number:
        pick(row, 'committee_number', 'committeenumber', 'رقم_اللجنة', 'لجنة') || null,
      committee_location:
        pick(row, 'committee_location', 'committeelocation', 'مكان_اللجنة', 'مكان') || null,
    });
  }
  if (!payload.length) {
    console.log('لا صفوف صالحة للطلاب.');
    return;
  }
  let total = 0;
  for (const part of chunk(payload, 400)) {
    const { error } = await supabase.from('students').insert(part);
    if (error) throw error;
    total += part.length;
  }
  console.log(`تم إدراج ${total} طالب(اً).`);
}

async function importSchedule(supabase, filePath, delimiter) {
  const rows = readCsv(filePath, delimiter);
  const { data: teachers, error: e1 } = await supabase
    .from('teachers')
    .select('id, telegram_id');
  if (e1) throw e1;
  const byTg = new Map(
    (teachers || []).map((t) => [String(t.telegram_id || '').trim(), t.id])
  );

  const payload = [];
  for (const row of rows) {
    const teacher_telegram_id = pick(
      row,
      'teacher_telegram_id',
      'teachertelegramid',
      'telegram_id',
      'معرف_المعلم',
      'تيليجرام_المعلم'
    );
    const day = pick(row, 'day', 'اليوم', 'يوم');
    const period = pick(row, 'period', 'الحصة', 'حصة');
    const grade = pick(row, 'grade', 'الصف', 'صف') || null;
    const className = pick(row, 'class', 'الفصل', 'فصل') || null;
    if (!teacher_telegram_id || !day || !period) continue;
    const tid = String(teacher_telegram_id).replace(/\s/g, '');
    const teacher_id = byTg.get(tid);
    if (!teacher_id) {
      console.warn(`تخطي صف: لا يوجد معلم بتيليجرام ${tid}`);
      continue;
    }
    payload.push({
      teacher_id,
      day,
      period,
      grade,
      class: className,
    });
  }
  if (!payload.length) {
    console.log('لا صفوف صالحة للجدول.');
    return;
  }
  let total = 0;
  for (const part of chunk(payload, 400)) {
    const { error } = await supabase.from('schedule').insert(part);
    if (error) throw error;
    total += part.length;
  }
  console.log(`تم إدراج ${total} صف(وف) في الجدول.`);
}

function parseArgs(argv) {
  const delimiter = (() => {
    const a = argv.find((x) => x.startsWith('--delimiter='));
    if (!a) return ',';
    return a.slice('--delimiter='.length) || ',';
  })();
  const rest = argv.filter((x) => !x.startsWith('--delimiter='));
  return { delimiter, rest };
}

async function main() {
  const argv = process.argv.slice(2);
  const { delimiter, rest } = parseArgs(argv);
  const cmd = rest[0];
  const fileArg = rest[1];

  const supabase = getClient();

  if (cmd === 'teachers') {
    const p = fileArg || path.join(DATA, 'teachers.csv');
    if (!fs.existsSync(p)) throw new Error(`الملف غير موجود: ${p}`);
    return importTeachers(supabase, p, delimiter);
  }
  if (cmd === 'students') {
    const p = fileArg || path.join(DATA, 'students.csv');
    if (!fs.existsSync(p)) throw new Error(`الملف غير موجود: ${p}`);
    return importStudents(supabase, p, delimiter);
  }
  if (cmd === 'schedule') {
    const p = fileArg || path.join(DATA, 'schedule.csv');
    if (!fs.existsSync(p)) throw new Error(`الملف غير موجود: ${p}`);
    return importSchedule(supabase, p, delimiter);
  }
  if (cmd === 'all') {
    const t = path.join(DATA, 'teachers.csv');
    const s = path.join(DATA, 'students.csv');
    const sch = path.join(DATA, 'schedule.csv');
    if (fs.existsSync(t)) await importTeachers(supabase, t, delimiter);
    else console.log('تخطي teachers.csv (غير موجود)');
    if (fs.existsSync(s)) await importStudents(supabase, s, delimiter);
    else console.log('تخطي students.csv (غير موجود)');
    if (fs.existsSync(sch)) await importSchedule(supabase, sch, delimiter);
    else console.log('تخطي schedule.csv (غير موجود)');
    return;
  }

  console.log(`الاستخدام:
  node scripts/import-from-csv.js teachers [مسار.csv]
  node scripts/import-from-csv.js students [مسار.csv]
  node scripts/import-from-csv.js schedule [مسار.csv]
  node scripts/import-from-csv.js all

  الخيار: --delimiter=;  (إن كان Excel يصدّر بفاصلة منقوطة)

القوالب: مجلد data/  (*.example.csv)`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
