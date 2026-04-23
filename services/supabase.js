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

module.exports = {
  supabase,
  searchStudentsByName,
  getStudentById,
  getStudentByNationalId,
  setStudentResultImageUrlByNationalId,
  getTeacherByTelegramId,
  listTeachers,
  listStudentsPage,
  getScheduleForTeacherOnDay,
  getFullScheduleForTeacher,
  searchTeachersByName,
};
