const { createClient } = require('@supabase/supabase-js');
const { expandSearchPatterns, escapeIlike } = require('../utils/arabicNormalize');
const { normalizeNationalId } = require('../utils/nationalId');

const url = process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] SUPABASE_URL و (SUPABASE_SERVICE_ROLE_KEY أو SUPABASE_ANON_KEY) مطلوبان'
  );
}

const supabase = url && key ? createClient(url, key) : null;

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase غير مهيأ. تحقق من متغيرات البيئة.');
  }
  return supabase;
}

function isRpcMissingError(error) {
  if (!error) return false;
  const c = error.code;
  const msg = String(error.message || error.details || '');
  return (
    c === 'PGRST202' ||
    c === '42883' ||
    /function\s+.*\s+does not exist/i.test(msg) ||
    /could not find the function/i.test(msg)
  );
}

async function searchStudentsByName(nameQuery) {
  const client = requireClient();
  const q = (nameQuery || '').trim();
  if (!q) return { data: [], error: null };

  const rpc = await client.rpc('search_students_by_name', { q });
  if (!rpc.error) {
    return { data: rpc.data || [], error: null };
  }
  if (!isRpcMissingError(rpc.error)) {
    return { data: [], error: rpc.error };
  }

  const patterns = expandSearchPatterns(q);
  const orExpr = patterns
    .map((p) => `name.ilike.%${escapeIlike(p)}%`)
    .join(',');
  const { data, error } = await client
    .from('students')
    .select('*')
    .or(orExpr)
    .order('grade', { ascending: true })
    .order('class', { ascending: true })
    .order('name', { ascending: true })
    .limit(30);

  return { data: data || [], error };
}

async function getStudentById(id) {
  const client = requireClient();
  const { data, error } = await client
    .from('students')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return { data, error };
}

async function getStudentByNationalId(nationalId) {
  const client = requireClient();
  const nid = normalizeNationalId(nationalId);
  if (!nid) return { data: null, error: null };
  const { data, error } = await client
    .from('students')
    .select('*')
    .eq('national_id', nid)
    .maybeSingle();
  return { data, error };
}

async function getStudentByTelegramId(telegramId) {
  const client = requireClient();
  const id = String(telegramId || '').trim();
  if (!id) return { data: null, error: null };
  const { data, error } = await client
    .from('students')
    .select('*')
    .eq('telegram_id', id)
    .maybeSingle();
  return { data, error };
}

async function setStudentTelegramIdByNationalId(nationalId, telegramId) {
  const client = requireClient();
  const nid = normalizeNationalId(nationalId);
  if (!nid) return { data: null, error: null };
  const tg = String(telegramId || '').trim();
  if (!tg) return { data: null, error: null };

  const { data, error } = await client
    .from('students')
    .update({ telegram_id: tg })
    .eq('national_id', nid)
    .select('*')
    .maybeSingle();
  return { data, error };
}

async function getParentByTelegramId(telegramId) {
  const client = requireClient();
  const id = String(telegramId || '').trim();
  if (!id) return { data: null, error: null };
  const { data, error } = await client
    .from('parents')
    .select('id, telegram_id, student_id, students:student_id(*)')
    .eq('telegram_id', id)
    .maybeSingle();
  return { data, error };
}

async function linkParentToStudent({ parentTelegramId, studentId }) {
  const client = requireClient();
  const tg = String(parentTelegramId || '').trim();
  const sid = String(studentId || '').trim();
  if (!tg || !sid) return { data: null, error: null };

  const { data, error } = await client
    .from('parents')
    .upsert([{ telegram_id: tg, student_id: sid }], { onConflict: 'telegram_id' })
    .select('*')
    .maybeSingle();
  return { data, error };
}

async function setStudentResultImageUrlByNationalId(nationalId, url) {
  const client = requireClient();
  const nid = normalizeNationalId(nationalId);
  if (!nid) return { data: null, error: null };
  const { data, error } = await client
    .from('students')
    .update({
      result_image_url: url,
      result_updated_at: new Date().toISOString(),
    })
    .eq('national_id', nid)
    .select('*')
    .maybeSingle();
  return { data, error };
}

async function getTeacherByTelegramId(telegramId) {
  const client = requireClient();
  const id = String(telegramId);
  const { data, error } = await client
    .from('teachers')
    .select('*')
    .eq('telegram_id', id)
    .maybeSingle();
  return { data, error };
}

async function listTeachers() {
  const client = requireClient();
  const { data, error } = await client
    .from('teachers')
    .select('id, name, subject, telegram_id')
    .order('name', { ascending: true });
  return { data: data || [], error };
}

async function listStudentsPage(offset = 0, limit = 40) {
  const client = requireClient();
  const { data, error, count } = await client
    .from('students')
    .select('id, name, grade, class', { count: 'exact' })
    .order('grade', { ascending: true })
    .order('class', { ascending: true })
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1);
  return { data: data || [], error, count: count ?? 0 };
}

async function getScheduleForTeacherOnDay(teacherId, dayAr) {
  const client = requireClient();
  const { data, error } = await client
    .from('schedule')
    .select('id, day, period, grade, class')
    .eq('teacher_id', teacherId)
    .eq('day', dayAr)
    .order('period', { ascending: true });
  return { data: data || [], error };
}

async function getFullScheduleForTeacher(teacherId) {
  const client = requireClient();
  const { data, error } = await client
    .from('schedule')
    .select('id, day, period, grade, class')
    .eq('teacher_id', teacherId)
    .order('day', { ascending: true })
    .order('period', { ascending: true });
  return { data: data || [], error };
}

async function searchTeachersByName(nameQuery) {
  const client = requireClient();
  const q = (nameQuery || '').trim();
  if (!q) return { data: [], error: null };

  const rpc = await client.rpc('search_teachers_by_name', { q });
  if (!rpc.error) {
    return { data: rpc.data || [], error: null };
  }
  if (!isRpcMissingError(rpc.error)) {
    return { data: [], error: rpc.error };
  }

  const patterns = expandSearchPatterns(q);
  const orExpr = patterns
    .map((p) => `name.ilike.%${escapeIlike(p)}%`)
    .join(',');
  const { data, error } = await client
    .from('teachers')
    .select('*')
    .or(orExpr)
    .order('name', { ascending: true })
    .limit(20);

  return { data: data || [], error };
}

async function createContentItem(payload) {
  const client = requireClient();
  const { data, error } = await client
    .from('content_items')
    .insert([payload])
    .select('*')
    .maybeSingle();
  return { data, error };
}

async function insertContentChunks(itemId, chunks) {
  const client = requireClient();
  const rows = (chunks || []).map((c) => ({
    item_id: itemId,
    chunk_order: c.chunk_order,
    chunk_text: c.chunk_text,
  }));
  if (!rows.length) return { data: [], error: null };
  const { data, error } = await client.from('content_chunks').insert(rows).select('id');
  return { data: data || [], error };
}

async function listContentChunksForGradeSubject(grade, subjectKey) {
  const client = requireClient();
  const { data, error } = await client
    .from('content_chunks')
    .select('id, item_id, chunk_order, chunk_text, content_items!inner(title, grade, subject_key)')
    .eq('content_items.grade', grade)
    .eq('content_items.subject_key', subjectKey)
    .order('item_id', { ascending: true })
    .order('chunk_order', { ascending: true });

  const rows = (data || []).map((r) => ({
    id: r.id,
    item_id: r.item_id,
    chunk_order: r.chunk_order,
    chunk_text: r.chunk_text,
    title: r.content_items?.title || '',
  }));
  return { data: rows, error };
}

async function upsertExamsSchedule(rows) {
  const client = requireClient();
  const payload = (rows || [])
    .map((r) => ({
      grade: String(r.grade || r.الصف || '').trim(),
      subject: String(r.subject || r.المادة || '').trim(),
      exam_date: String(r.exam_date || r.date || r.التاريخ || '').trim(),
      exam_time: String(r.exam_time || r.time || r.الوقت || '').trim() || null,
    }))
    .filter((x) => x.grade && x.subject && x.exam_date);

  if (!payload.length) return { data: [], error: null };
  const { data, error } = await client
    .from('exams_schedule')
    .upsert(payload, { onConflict: 'grade,subject,exam_date' })
    .select('*');
  return { data: data || [], error };
}

async function listExamsForGrade(grade, fromDateISO) {
  const client = requireClient();
  const g = String(grade || '').trim();
  if (!g) return { data: [], error: null };
  const from = String(fromDateISO || '').trim();
  let q = client
    .from('exams_schedule')
    .select('id, grade, subject, exam_date, exam_time')
    .eq('grade', g)
    .order('exam_date', { ascending: true });
  if (from) q = q.gte('exam_date', from);
  const { data, error } = await q.limit(30);
  return { data: data || [], error };
}

async function listExamsOnDate(dateISO) {
  const client = requireClient();
  const d = String(dateISO || '').trim();
  if (!d) return { data: [], error: null };
  const { data, error } = await client
    .from('exams_schedule')
    .select('id, grade, subject, exam_date, exam_time')
    .eq('exam_date', d)
    .order('grade', { ascending: true })
    .order('subject', { ascending: true });
  return { data: data || [], error };
}

async function listStudentTelegramIdsByGrade(grade) {
  const client = requireClient();
  const g = String(grade || '').trim();
  if (!g) return { data: [], error: null };
  const { data, error } = await client
    .from('students')
    .select('telegram_id')
    .eq('grade', g)
    .not('telegram_id', 'is', null);
  const ids = (data || [])
    .map((r) => String(r.telegram_id || '').trim())
    .filter(Boolean);
  return { data: ids, error };
}

async function listParentTelegramIdsByStudentGrade(grade) {
  const client = requireClient();
  const g = String(grade || '').trim();
  if (!g) return { data: [], error: null };
  const { data, error } = await client
    .from('parents')
    .select('telegram_id, students:student_id(grade)')
    .eq('students.grade', g);
  const ids = (data || [])
    .map((r) => String(r.telegram_id || '').trim())
    .filter(Boolean);
  return { data: ids, error };
}

async function listAllStudentTelegramIds() {
  const client = requireClient();
  const { data, error } = await client
    .from('students')
    .select('telegram_id')
    .not('telegram_id', 'is', null);
  const ids = (data || [])
    .map((r) => String(r.telegram_id || '').trim())
    .filter(Boolean);
  return { data: ids, error };
}

async function listAllTeacherTelegramIds() {
  const client = requireClient();
  const { data, error } = await client
    .from('teachers')
    .select('telegram_id')
    .not('telegram_id', 'is', null);
  const ids = (data || [])
    .map((r) => String(r.telegram_id || '').trim())
    .filter(Boolean);
  return { data: ids, error };
}

async function listAllParentTelegramIds() {
  const client = requireClient();
  const { data, error } = await client.from('parents').select('telegram_id');
  const ids = (data || [])
    .map((r) => String(r.telegram_id || '').trim())
    .filter(Boolean);
  return { data: ids, error };
}

async function createAnnouncement({ message, target }) {
  const client = requireClient();
  const payload = {
    message: String(message || '').trim(),
    target: String(target || '').trim(),
    sent_at: new Date().toISOString(),
  };
  const { data, error } = await client
    .from('announcements')
    .insert([payload])
    .select('*')
    .maybeSingle();
  return { data, error };
}

module.exports = {
  supabase,
  searchStudentsByName,
  getStudentById,
  getStudentByNationalId,
  getStudentByTelegramId,
  setStudentTelegramIdByNationalId,
  setStudentResultImageUrlByNationalId,
  getTeacherByTelegramId,
  getParentByTelegramId,
  linkParentToStudent,
  upsertExamsSchedule,
  listExamsForGrade,
  listExamsOnDate,
  listStudentTelegramIdsByGrade,
  listParentTelegramIdsByStudentGrade,
  listAllStudentTelegramIds,
  listAllTeacherTelegramIds,
  listAllParentTelegramIds,
  createAnnouncement,
  listTeachers,
  listStudentsPage,
  getScheduleForTeacherOnDay,
  getFullScheduleForTeacher,
  searchTeachersByName,
  createContentItem,
  insertContentChunks,
  listContentChunksForGradeSubject,
};
