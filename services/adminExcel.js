const XLSX = require('xlsx');
const { supabase } = require('./supabase');
const { normalizeNationalId } = require('../utils/nationalId');

function readFirstSheetRowsFromBuffer(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const name = wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function readFirstSheetRowsFromPath(filePath) {
  const wb = XLSX.readFile(filePath);
  const name = wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

async function upsertTeachers(rows) {
  if (!supabase) throw new Error('Supabase غير مهيأ');
  const payload = rows
    .map((r) => ({
      name: String(r.name || r.الاسم || '').trim(),
      subject: String(r.subject || r.المادة || '').trim() || null,
      telegram_id: String(r.telegram_id || r.telegramid || r.تيليجرام || '').trim(),
    }))
    .filter((x) => x.name && x.telegram_id);

  if (!payload.length) return 0;
  const { error } = await supabase.from('teachers').upsert(payload, { onConflict: 'telegram_id' });
  if (error) throw error;
  return payload.length;
}

async function upsertStudents(rows) {
  if (!supabase) throw new Error('Supabase غير مهيأ');
  const rejected = [];
  const payload = [];

  for (const r of rows || []) {
    const name = String(r.name || r.الاسم || r['اسم الطالب'] || '').trim();
    const rawNational =
      r.national_id ||
      r.nationalid ||
      r.الهوية ||
      r.رقم_الهوية ||
      r['رقم الهوية'] ||
      '';
    const national_id = normalizeNationalId(rawNational) || null;

    if (!name) {
      rejected.push({
        name: '—',
        rawNational: String(rawNational || '').trim(),
        reason: 'اسم الطالب مفقود',
      });
      continue;
    }
    if (!national_id) {
      rejected.push({
        name,
        rawNational: String(rawNational || '').trim(),
        reason: 'رقم الهوية غير صالح بعد التنظيف',
      });
      continue;
    }

    payload.push({
      name,
      national_id,
      grade: String(r.grade || r.الصف || '').trim() || null,
      class: String(r.class || r.الفصل || '').trim() || null,
      committee_number:
        String(r.committee_number || r.رقم_اللجنة || '').trim() || null,
      committee_location:
        String(r.committee_location || r.مكان_اللجنة || '').trim() || null,
    });
  }

  if (!payload.length) {
    return { accepted: 0, rejected };
  }
  const { error } = await supabase.from('students').upsert(payload, { onConflict: 'national_id' });
  if (error) throw error;
  return { accepted: payload.length, rejected };
}

async function insertSchedule(rows) {
  if (!supabase) throw new Error('Supabase غير مهيأ');
  const { data: teachers, error: tErr } = await supabase
    .from('teachers')
    .select('id, telegram_id');
  if (tErr) throw tErr;
  const byTg = new Map(
    (teachers || []).map((t) => [String(t.telegram_id || '').trim(), t.id])
  );

  const payload = [];
  for (const r of rows) {
    const tid = String(
      r.teacher_telegram_id || r.telegram_id || r.تيليجرام_المعلم || r.معرف_المعلم || ''
    ).trim();
    const teacher_id = byTg.get(tid);
    if (!teacher_id) continue;
    const day = String(r.day || r.اليوم || '').trim();
    const period = String(r.period || r.الحصة || '').trim();
    if (!day || !period) continue;
    payload.push({
      teacher_id,
      day,
      period,
      grade: String(r.grade || r.الصف || '').trim() || null,
      class: String(r.class || r.الفصل || '').trim() || null,
    });
  }

  const chunkSize = 400;
  let total = 0;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const part = payload.slice(i, i + chunkSize);
    const { error } = await supabase.from('schedule').insert(part);
    if (error) throw error;
    total += part.length;
  }
  return total;
}

async function replaceSchedule(rows) {
  if (!supabase) throw new Error('Supabase غير مهيأ');
  const { error: delErr } = await supabase
    .from('schedule')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) throw delErr;
  return insertSchedule(rows);
}

module.exports = {
  readFirstSheetRowsFromBuffer,
  readFirstSheetRowsFromPath,
  upsertTeachers,
  upsertStudents,
  insertSchedule,
  replaceSchedule,
};
