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

async function addChatHistory({ telegram_id, question, answer, subject }) {
  const client = requireClient();
  const payload = {
    telegram_id: String(telegram_id || '').trim(),
    question: String(question || '').trim(),
    answer: String(answer || '').trim(),
    subject: String(subject || '').trim() || null,
    created_at: new Date().toISOString(),
  };
  if (!payload.telegram_id || !payload.question || !payload.answer) {
    return { data: null, error: null };
  }
  const { data, error } = await client
    .from('chat_history')
    .insert([payload])
    .select('*')
    .maybeSingle();
  return { data, error };
}

async function addFavorite({ telegram_id, question, answer, subject }) {
  const client = requireClient();
  const payload = {
    telegram_id: String(telegram_id || '').trim(),
    question: String(question || '').trim(),
    answer: String(answer || '').trim(),
    subject: String(subject || '').trim() || null,
    created_at: new Date().toISOString(),
  };
  if (!payload.telegram_id || !payload.question || !payload.answer) {
    return { data: null, error: null };
  }
  const { data, error } = await client
    .from('favorites')
    .insert([payload])
    .select('*')
    .maybeSingle();
  return { data, error };
}

async function listFavoritesForTelegramId(telegramId, limit = 20) {
  const client = requireClient();
  const tg = String(telegramId || '').trim();
  if (!tg) return { data: [], error: null };
  const { data, error } = await client
    .from('favorites')
    .select('id, question, answer, subject, created_at')
    .eq('telegram_id', tg)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: data || [], error };
}

async function deleteFavorite({ telegramId, favoriteId }) {
  const client = requireClient();
  const tg = String(telegramId || '').trim();
  const id = String(favoriteId || '').trim();
  if (!tg || !id) return { data: null, error: null };
  const { data, error } = await client
    .from('favorites')
    .delete()
    .eq('id', id)
    .eq('telegram_id', tg)
    .select('id')
    .maybeSingle();
  return { data, error };
}

async function insertDiagnosticTest(payload) {
  const client = requireClient();
  const row = {
    telegram_id: String(payload.telegram_id || '').trim(),
    subject_key: String(payload.subject_key || '').trim(),
    correct_count: Number(payload.correct_count ?? 0),
    total: Number(payload.total ?? 10),
    weak_summary: payload.weak_summary ? String(payload.weak_summary).trim() : null,
    detail: payload.detail != null ? payload.detail : null,
    created_at: new Date().toISOString(),
  };
  if (!row.telegram_id || !row.subject_key) return { data: null, error: null };
  const { data, error } = await client
    .from('diagnostic_tests')
    .insert([row])
    .select('*')
    .maybeSingle();
  return { data, error };
}

async function getDailyChallengeByDate(dateISO) {
  const client = requireClient();
  const d = String(dateISO || '').trim();
  if (!d) return { data: null, error: null };
  const { data, error } = await client
    .from('daily_challenges')
    .select('*')
    .eq('challenge_date', d)
    .maybeSingle();
  return { data, error };
}

async function insertDailyChallenge(row) {
  const client = requireClient();
  const payload = {
    challenge_date: String(row.challenge_date || '').trim(),
    subject_key: String(row.subject_key || '').trim(),
    question: String(row.question || '').trim(),
    options: row.options,
    correct_index: Number(row.correct_index),
    created_at: new Date().toISOString(),
  };
  if (!payload.challenge_date || !payload.subject_key || !payload.question) {
    return { data: null, error: null };
  }
  const { data, error } = await client
    .from('daily_challenges')
    .insert([payload])
    .select('*')
    .maybeSingle();
  return { data, error };
}

async function getChallengeAnswerForUser(challengeId, telegramId) {
  const client = requireClient();
  const cid = String(challengeId || '').trim();
  const tg = String(telegramId || '').trim();
  if (!cid || !tg) return { data: null, error: null };
  const { data, error } = await client
    .from('challenge_answers')
    .select('*')
    .eq('challenge_id', cid)
    .eq('telegram_id', tg)
    .maybeSingle();
  return { data, error };
}

async function insertChallengeAnswer(payload) {
  const client = requireClient();
  const row = {
    challenge_id: String(payload.challenge_id || '').trim(),
    telegram_id: String(payload.telegram_id || '').trim(),
    chosen_index: Number(payload.chosen_index),
    is_correct: Boolean(payload.is_correct),
    response_ms: Math.max(0, Number(payload.response_ms || 0)),
    points: Math.max(0, Number(payload.points || 0)),
    created_at: new Date().toISOString(),
  };
  if (!row.challenge_id || !row.telegram_id) return { data: null, error: null };
  const { data, error } = await client
    .from('challenge_answers')
    .insert([row])
    .select('*')
    .maybeSingle();
  return { data, error };
}

async function listDailyChallengeIdsSince(dateISO) {
  const client = requireClient();
  const d = String(dateISO || '').trim();
  if (!d) return { data: [], error: null };
  const { data, error } = await client
    .from('daily_challenges')
    .select('id')
    .gte('challenge_date', d);
  return { data: data || [], error };
}

async function listChallengeAnswersForChallenges(challengeIds) {
  const client = requireClient();
  const ids = (challengeIds || []).map(String).filter(Boolean);
  if (!ids.length) return { data: [], error: null };
  const { data, error } = await client
    .from('challenge_answers')
    .select('telegram_id, points')
    .in('challenge_id', ids);
  return { data: data || [], error };
}

async function listTopChallengeUsersSince(dateISO, limit = 10) {
  const { data: chRows, error: e1 } = await listDailyChallengeIdsSince(dateISO);
  if (e1) return { data: [], error: e1 };
  const ids = (chRows || []).map((r) => r.id).filter(Boolean);
  const { data: ans, error: e2 } = await listChallengeAnswersForChallenges(ids);
  if (e2) return { data: [], error: e2 };
  const byTg = new Map();
  for (const r of ans || []) {
    const tg = String(r.telegram_id || '').trim();
    if (!tg) continue;
    byTg.set(tg, (byTg.get(tg) || 0) + Number(r.points || 0));
  }
  const sorted = Array.from(byTg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, Number(limit) || 10));
  return { data: sorted.map(([telegram_id, points]) => ({ telegram_id, points })), error: null };
}

async function listChallengeTopForDate(dateISO, limit = 5) {
  const client = requireClient();
  const d = String(dateISO || '').trim();
  if (!d) return { data: [], error: null };
  const { data: ch, error: e1 } = await getDailyChallengeByDate(d);
  if (e1 || !ch?.id) return { data: [], error: e1 };
  const { data, error } = await client
    .from('challenge_answers')
    .select('telegram_id, points, response_ms, is_correct')
    .eq('challenge_id', ch.id)
    .order('points', { ascending: false })
    .order('response_ms', { ascending: true })
    .limit(Math.max(1, Number(limit) || 5));
  return { data: data || [], error };
}

async function getStudentNamesByTelegramIds(telegramIds) {
  const client = requireClient();
  const ids = [...new Set((telegramIds || []).map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length) return { data: [], error: null };
  const { data, error } = await client
    .from('students')
    .select('telegram_id, name')
    .in('telegram_id', ids);
  return { data: data || [], error };
}

async function insertStudentRow(row) {
  const client = requireClient();
  const payload = {
    name: String(row.name || '').trim(),
    national_id: row.national_id != null ? String(row.national_id).trim() || null : null,
    grade: row.grade != null ? String(row.grade).trim() || null : null,
    class: row.class != null ? String(row.class).trim() || null : null,
    committee_number: row.committee_number != null ? String(row.committee_number).trim() || null : null,
    committee_location: row.committee_location != null ? String(row.committee_location).trim() || null : null,
    created_at: new Date().toISOString(),
  };
  if (!payload.name) return { data: null, error: new Error('name required') };
  const { data, error } = await client.from('students').insert([payload]).select('*').maybeSingle();
  return { data, error };
}

async function updateStudentRow(studentId, patch) {
  const client = requireClient();
  const id = String(studentId || '').trim();
  if (!id) return { data: null, error: null };
  const allowed = ['name', 'national_id', 'grade', 'class', 'committee_number', 'committee_location'];
  const update = {};
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      const v = patch[k];
      update[k] = v == null || v === '' ? null : String(v).trim();
    }
  }
  if (!Object.keys(update).length) return { data: null, error: null };
  const { data, error } = await client
    .from('students')
    .update(update)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  return { data, error };
}

async function deleteStudentRow(studentId) {
  const client = requireClient();
  const id = String(studentId || '').trim();
  if (!id) return { data: null, error: null };
  const { data, error } = await client.from('students').delete().eq('id', id).select('id').maybeSingle();
  return { data, error };
}

async function getAdminDashboardCounts() {
  const client = requireClient();
  const [a, b, c, d] = await Promise.all([
    client.from('students').select('id', { count: 'exact', head: true }),
    client.from('teachers').select('id', { count: 'exact', head: true }),
    client.from('content_items').select('id', { count: 'exact', head: true }),
    client.from('exams_schedule').select('id', { count: 'exact', head: true }),
  ]);
  return {
    data: {
      students: a.count ?? 0,
      teachers: b.count ?? 0,
      contentItems: c.count ?? 0,
      examsSchedule: d.count ?? 0,
    },
    error: a.error || b.error || c.error || d.error,
  };
}

async function listStudentsAdmin({ nameQuery, grade, limit = 100 }) {
  const client = requireClient();
  const lim = Math.min(Math.max(1, Number(limit) || 100), 400);
  let q = client
    .from('students')
    .select('id, name, national_id, grade, class, telegram_id, created_at')
    .order('grade', { ascending: true })
    .order('class', { ascending: true })
    .order('name', { ascending: true })
    .limit(lim);
  const g = String(grade || '').trim();
  if (g) q = q.eq('grade', g);
  const nq = String(nameQuery || '').trim();
  if (nq && nq !== '.') {
    q = q.ilike('name', `%${escapeIlike(nq)}%`);
  }
  const { data, error } = await q;
  return { data: data || [], error };
}

async function listTeachersAdmin({ nameQuery, subject, limit = 100 }) {
  const client = requireClient();
  const lim = Math.min(Math.max(1, Number(limit) || 100), 400);
  let q = client
    .from('teachers')
    .select('id, name, subject, telegram_id, created_at')
    .order('name', { ascending: true })
    .limit(lim);
  const sub = String(subject || '').trim();
  if (sub) q = q.eq('subject', sub);
  const nq = String(nameQuery || '').trim();
  if (nq && nq !== '.') {
    q = q.ilike('name', `%${escapeIlike(nq)}%`);
  }
  const { data, error } = await q;
  return { data: data || [], error };
}

async function listContentItemsAdmin({ titleQuery, grade, subjectKey, limit = 100 }) {
  const client = requireClient();
  const lim = Math.min(Math.max(1, Number(limit) || 100), 400);
  let q = client
    .from('content_items')
    .select('id, kind, grade, subject_key, title, source, created_at')
    .order('created_at', { ascending: false })
    .limit(lim);
  const g = String(grade || '').trim();
  if (g) q = q.eq('grade', g);
  const sk = String(subjectKey || '').trim();
  if (sk) q = q.eq('subject_key', sk);
  const tq = String(titleQuery || '').trim();
  if (tq && tq !== '.') {
    q = q.ilike('title', `%${escapeIlike(tq)}%`);
  }
  const { data, error } = await q;
  return { data: data || [], error };
}

async function upsertTeacherRecord({ name, subject, telegram_id }) {
  const client = requireClient();
  const payload = {
    name: String(name || '').trim(),
    subject: subject != null ? String(subject).trim() || null : null,
    telegram_id: String(telegram_id || '').trim(),
  };
  if (!payload.name || !payload.telegram_id) return { data: null, error: null };
  const { data, error } = await client
    .from('teachers')
    .upsert([payload], { onConflict: 'telegram_id' })
    .select('*')
    .maybeSingle();
  return { data, error };
}

async function upsertStudentRecord({ name, national_id, grade, class: klass, committee_number, committee_location }) {
  const client = requireClient();
  const nid = normalizeNationalId(national_id);
  if (!nid) return { data: null, error: new Error('invalid_national_id') };
  const payload = {
    name: String(name || '').trim(),
    national_id: nid,
    grade: grade != null ? String(grade).trim() || null : null,
    class: klass != null ? String(klass).trim() || null : null,
    committee_number: committee_number != null ? String(committee_number).trim() || null : null,
    committee_location: committee_location != null ? String(committee_location).trim() || null : null,
  };
  if (!payload.name) return { data: null, error: new Error('name_required') };
  const { data, error } = await client
    .from('students')
    .upsert([payload], { onConflict: 'national_id' })
    .select('*')
    .maybeSingle();
  return { data, error };
}

async function insertScheduleSlot({ teacherTelegramId, day, period, grade, class: klass }) {
  const client = requireClient();
  const tg = String(teacherTelegramId || '').trim();
  if (!tg) return { data: null, error: null };
  const { data: teacher, error: tErr } = await client
    .from('teachers')
    .select('id, name')
    .eq('telegram_id', tg)
    .maybeSingle();
  if (tErr) return { data: null, error: tErr };
  if (!teacher?.id) return { data: null, error: new Error('teacher_not_found') };
  const row = {
    teacher_id: teacher.id,
    day: String(day || '').trim(),
    period: String(period || '').trim(),
    grade: grade != null ? String(grade).trim() || null : null,
    class: klass != null ? String(klass).trim() || null : null,
  };
  if (!row.day || !row.period) return { data: null, error: new Error('day_period_required') };
  const { data, error } = await client.from('schedule').insert([row]).select('*').maybeSingle();
  return { data, error };
}

async function getAdminWeeklyKpis() {
  const client = requireClient();
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceIso = since.toISOString();

  const head = (t, col = 'created_at') =>
    client.from(t).select('id', { count: 'exact', head: true }).gte(col, sinceIso);

  const [
    studentsTotal,
    studentsLinked,
    teachersLinked,
    parentsTotal,
    chatWeek,
    favWeek,
    diagWeek,
    challWeek,
    contentTotal,
    annWeek,
  ] = await Promise.all([
    client.from('students').select('id', { count: 'exact', head: true }),
    client.from('students').select('id', { count: 'exact', head: true }).not('telegram_id', 'is', null),
    client.from('teachers').select('id', { count: 'exact', head: true }).not('telegram_id', 'is', null),
    client.from('parents').select('id', { count: 'exact', head: true }),
    head('chat_history'),
    head('favorites'),
    head('diagnostic_tests'),
    head('challenge_answers'),
    client.from('content_items').select('id', { count: 'exact', head: true }),
    head('announcements', 'sent_at'),
  ]);

  const err =
    studentsTotal.error ||
    studentsLinked.error ||
    teachersLinked.error ||
    parentsTotal.error ||
    chatWeek.error ||
    favWeek.error ||
    diagWeek.error ||
    challWeek.error ||
    contentTotal.error ||
    annWeek.error;

  return {
    data: {
      studentsTotal: studentsTotal.count ?? 0,
      studentsLinked: studentsLinked.count ?? 0,
      teachersLinked: teachersLinked.count ?? 0,
      parentsTotal: parentsTotal.count ?? 0,
      chatHistoryWeek: chatWeek.count ?? 0,
      favoritesWeek: favWeek.count ?? 0,
      diagnosticTestsWeek: diagWeek.count ?? 0,
      challengeAnswersWeek: challWeek.count ?? 0,
      contentItemsTotal: contentTotal.count ?? 0,
      announcementsWeek: annWeek.count ?? 0,
    },
    error: err,
  };
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
  addChatHistory,
  addFavorite,
  listFavoritesForTelegramId,
  deleteFavorite,
  listTeachers,
  listStudentsPage,
  getScheduleForTeacherOnDay,
  getFullScheduleForTeacher,
  searchTeachersByName,
  createContentItem,
  insertContentChunks,
  listContentChunksForGradeSubject,
  insertDiagnosticTest,
  getDailyChallengeByDate,
  insertDailyChallenge,
  getChallengeAnswerForUser,
  insertChallengeAnswer,
  listDailyChallengeIdsSince,
  listChallengeAnswersForChallenges,
  listTopChallengeUsersSince,
  listChallengeTopForDate,
  getStudentNamesByTelegramIds,
  insertStudentRow,
  updateStudentRow,
  deleteStudentRow,
  getAdminWeeklyKpis,
  getAdminDashboardCounts,
  listStudentsAdmin,
  listTeachersAdmin,
  listContentItemsAdmin,
  upsertTeacherRecord,
  upsertStudentRecord,
  insertScheduleSlot,
};
