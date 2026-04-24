const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fs = require('fs');
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');

const {
  supabase,
  setStudentResultImageUrlByNationalId,
} = require('../services/supabase');
const { ingestFile } = require('../services/contentLibrary');
const { normalizeNationalId } = require('../utils/nationalId');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function basicAuth(req, res, next) {
  const user = process.env.ADMIN_WEB_USER;
  const pass = process.env.ADMIN_WEB_PASS;
  if (!user || !pass) return res.status(500).send('Admin auth not configured');

  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm=\"admin\"');
    return res.status(401).send('Auth required');
  }
  const raw = Buffer.from(h.slice(6), 'base64').toString('utf8');
  const [u, p] = raw.split(':');
  if (u !== user || p !== pass) {
    res.setHeader('WWW-Authenticate', 'Basic realm=\"admin\"');
    return res.status(401).send('Invalid credentials');
  }
  return next();
}

function htmlPage(title, body) {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body{font-family:system-ui,Segoe UI,Arial;max-width:900px;margin:24px auto;padding:0 16px;line-height:1.5}
    .card{border:1px solid #ddd;border-radius:12px;padding:16px;margin:12px 0}
    input,select,button{font-size:16px;padding:10px;border-radius:10px;border:1px solid #ccc}
    button{cursor:pointer}
    .row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
    .muted{color:#666}
    code{background:#f5f5f5;padding:2px 6px;border-radius:6px}
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function sanitizeSegment(s) {
  return String(s || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getFilesRoot() {
  return process.env.FILES_ROOT || path.join(__dirname, '..', 'files');
}

function getBaseUrl(req) {
  const configured = process.env.BASE_PUBLIC_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .toString()
    .split(',')[0]
    .trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '')
    .toString()
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}

function readFirstSheetRows(filePath) {
  const wb = XLSX.readFile(filePath);
  const name = wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

async function upsertTeachers(rows) {
  const payload = rows
    .map((r) => ({
      name: String(r.name || r.الاسم || '').trim(),
      subject: String(r.subject || r.المادة || '').trim() || null,
      telegram_id: String(r.telegram_id || r.telegramid || r.تيليجرام || '').trim(),
    }))
    .filter((x) => x.name && x.telegram_id);

  const { error } = await supabase
    .from('teachers')
    .upsert(payload, { onConflict: 'telegram_id' });
  if (error) throw error;
  return payload.length;
}

async function upsertStudents(rows) {
  const payload = rows
    .map((r) => ({
      name: String(r.name || r.الاسم || '').trim(),
      national_id:
        normalizeNationalId(
          r.national_id || r.nationalid || r.الهوية || r.رقم_الهوية
        ) || null,
      grade: String(r.grade || r.الصف || '').trim() || null,
      class: String(r.class || r.الفصل || '').trim() || null,
      committee_number:
        String(r.committee_number || r.رقم_اللجنة || '').trim() || null,
      committee_location:
        String(r.committee_location || r.مكان_اللجنة || '').trim() || null,
    }))
    .filter((x) => x.name && x.national_id);

  const { error } = await supabase
    .from('students')
    .upsert(payload, { onConflict: 'national_id' });
  if (error) throw error;
  return payload.length;
}

async function replaceSchedule(rows) {
  const { error: delErr } = await supabase.from('schedule').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) throw delErr;
  return insertSchedule(rows);
}

async function insertSchedule(rows) {
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

function main() {
  if (!supabase) {
    throw new Error('Supabase غير مهيأ. تحقق من .env (SUPABASE_URL و key).');
  }

  const app = express();
  app.use(express.urlencoded({ extended: true }));

  const filesRoot = getFilesRoot();
  ensureDir(filesRoot);
  ensureDir(path.join(filesRoot, 'results'));

  app.use('/files', express.static(filesRoot, { fallthrough: false }));

  const uploadTmp = multer({ dest: path.join(filesRoot, '_tmp') });

  app.get('/admin', basicAuth, (req, res) => {
    res.send(
      htmlPage(
        'لوحة الأدمن',
        `<h2>لوحة الأدمن</h2>
<div class="card">
  <div class="row">
    <a href="/admin/import">استيراد Excel</a>
    <span class="muted">|</span>
    <a href="/admin/results">رفع صور النتائج</a>
    <span class="muted">|</span>
    <a href="/admin/manual">إدخال يدوي</a>
    <span class="muted">|</span>
    <a href="/admin/library">مكتبة المنهج والمراجعات</a>
  </div>
</div>
<div class="card">
  <div class="muted">ملفات النتائج ستكون متاحة عبر <code>/files/results/...</code></div>
</div>`
      )
    );
  });

  app.get('/admin/library', basicAuth, (req, res) => {
    res.send(
      htmlPage(
        'مكتبة المنهج والمراجعات',
        `<h2>مكتبة المنهج والمراجعات</h2>
<div class="card">
  <form method="post" action="/admin/library" enctype="multipart/form-data">
    <div class="row">
      <select name="kind" required>
        <option value="review">مراجعة</option>
        <option value="curriculum">منهج</option>
        <option value="other">أخرى</option>
      </select>
      <input name="grade" placeholder="الصف (مثال: ثاني متوسط)" required />
      <input name="subject_key" placeholder="subject_key (مثال: math)" required />
    </div>
    <div class="row" style="margin-top:12px">
      <input name="title" placeholder="عنوان الملف (اختياري)" />
      <input type="file" name="file" accept=".pdf,.docx,.txt" required />
      <button type="submit">رفع وفهرسة</button>
    </div>
    <p class="muted">ملاحظة: يتم حفظ الملف على السيرفر داخل <code>FILES_ROOT/library</code> ثم استخراج النص وتجزيئه للبحث.</p>
  </form>
</div>
<div class="card"><a href="/admin">رجوع</a></div>`
      )
    );
  });

  app.post('/admin/library', basicAuth, uploadTmp.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).send('file is required');
      const kind = String(req.body.kind || 'review').trim() || 'review';
      const grade = String(req.body.grade || '').trim();
      const subjectKey = String(req.body.subject_key || '').trim();
      const title = String(req.body.title || '').trim() || null;
      if (!grade || !subjectKey) return res.status(400).send('grade & subject_key required');

      const libDir = path.join(
        filesRoot,
        'library',
        sanitizeSegment(grade),
        sanitizeSegment(subjectKey)
      );
      ensureDir(libDir);

      const original = String(req.file.originalname || 'file').trim();
      const ext = (path.extname(original) || '').toLowerCase() || '';
      const base = sanitizeSegment(path.basename(original, ext) || 'file');
      const outName = `${base}-${Date.now()}${ext}`;
      const outPath = path.join(libDir, outName);
      fs.renameSync(req.file.path, outPath);

      const ing = await ingestFile({
        kind,
        grade,
        subjectKey,
        title,
        filePath: outPath,
        mime: req.file.mimetype,
        source: 'web',
        uploadedByTelegramId: null,
      });

      return res.send(
        htmlPage(
          'تم',
          `<h2>تم الرفع والفهرسة</h2>
<div class="card">
  <div>العنوان: <b>${escapeHtml(ing.title)}</b></div>
  <div>عدد الأجزاء: <b>${ing.chunksCount}</b></div>
  <div class="muted">تم حفظ الملف داخل: <code>${escapeHtml(outPath)}</code></div>
</div>
<div class="card"><a href="/admin/library">رفع ملف آخر</a></div>`
        )
      );
    } catch (e) {
      return res.status(500).send(String(e.message || e));
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.rm(req.file.path, { force: true }, () => {});
      }
    }
  });

  app.get('/admin/manual', basicAuth, (req, res) => {
    res.send(
      htmlPage(
        'إدخال يدوي',
        `<h2>إدخال يدوي</h2>
<div class="card">
  <h3>إضافة/تحديث معلم</h3>
  <form method="post" action="/admin/manual/teacher">
    <div class="row">
      <input name="name" placeholder="اسم المعلم" required />
      <input name="subject" placeholder="المادة (اختياري)" />
      <input name="telegram_id" placeholder="Telegram User ID (أرقام)" required />
      <button type="submit">حفظ</button>
    </div>
  </form>
</div>

<div class="card">
  <h3>إضافة/تحديث طالب</h3>
  <form method="post" action="/admin/manual/student">
    <div class="row">
      <input name="name" placeholder="اسم الطالب" required />
      <input name="national_id" placeholder="رقم الهوية (أرقام)" required />
    </div>
    <div class="row" style="margin-top:12px">
      <input name="grade" placeholder="الصف" />
      <input name="class" placeholder="الفصل" />
      <input name="committee_number" placeholder="رقم اللجنة" />
      <input name="committee_location" placeholder="مكان اللجنة" />
      <button type="submit">حفظ</button>
    </div>
  </form>
</div>

<div class="card">
  <h3>إضافة حصة للجدول</h3>
  <form method="post" action="/admin/manual/schedule">
    <div class="row">
      <input name="teacher_telegram_id" placeholder="Telegram ID للمعلم (أرقام)" required />
      <input name="day" placeholder="اليوم (مثال: الأحد)" required />
      <input name="period" placeholder="الحصة (مثال: الأولى)" required />
    </div>
    <div class="row" style="margin-top:12px">
      <input name="grade" placeholder="الصف" />
      <input name="class" placeholder="الفصل" />
      <button type="submit">إضافة</button>
    </div>
  </form>
  <p class="muted">تنبيه: يجب أن يكون المعلم موجوداً في teachers أولاً.</p>
</div>

<div class="card"><a href="/admin">رجوع</a></div>`
      )
    );
  });

  app.post('/admin/manual/teacher', basicAuth, async (req, res) => {
    try {
      const name = String(req.body.name || '').trim();
      const subject = String(req.body.subject || '').trim() || null;
      const telegram_id = String(req.body.telegram_id || '').trim();
      if (!name || !telegram_id) return res.status(400).send('name & telegram_id required');
      const { error } = await supabase
        .from('teachers')
        .upsert([{ name, subject, telegram_id }], { onConflict: 'telegram_id' });
      if (error) throw error;
      return res.send(
        htmlPage(
          'تم',
          `<div class="card">تم حفظ المعلم: <b>${escapeHtml(name)}</b></div>
<div class="card"><a href="/admin/manual">رجوع</a></div>`
        )
      );
    } catch (e) {
      return res.status(500).send(String(e.message || e));
    }
  });

  app.post('/admin/manual/student', basicAuth, async (req, res) => {
    try {
      const name = String(req.body.name || '').trim();
      const national_id = normalizeNationalId(req.body.national_id || '');
      if (!name || !national_id) return res.status(400).send('name & national_id required');
      const payload = {
        name,
        national_id,
        grade: String(req.body.grade || '').trim() || null,
        class: String(req.body.class || '').trim() || null,
        committee_number: String(req.body.committee_number || '').trim() || null,
        committee_location: String(req.body.committee_location || '').trim() || null,
      };
      const { error } = await supabase
        .from('students')
        .upsert([payload], { onConflict: 'national_id' });
      if (error) throw error;
      return res.send(
        htmlPage(
          'تم',
          `<div class="card">تم حفظ الطالب: <b>${escapeHtml(name)}</b> (هوية: ${escapeHtml(national_id)})</div>
<div class="card"><a href="/admin/manual">رجوع</a></div>`
        )
      );
    } catch (e) {
      return res.status(500).send(String(e.message || e));
    }
  });

  app.post('/admin/manual/schedule', basicAuth, async (req, res) => {
    try {
      const teacherTg = String(req.body.teacher_telegram_id || '').trim();
      const day = String(req.body.day || '').trim();
      const period = String(req.body.period || '').trim();
      if (!teacherTg || !day || !period) return res.status(400).send('teacher_telegram_id, day, period required');

      const { data: teacher, error: tErr } = await supabase
        .from('teachers')
        .select('id, name')
        .eq('telegram_id', teacherTg)
        .maybeSingle();
      if (tErr) throw tErr;
      if (!teacher) return res.status(404).send('المعلم غير موجود بهذا Telegram ID');

      const payload = {
        teacher_id: teacher.id,
        day,
        period,
        grade: String(req.body.grade || '').trim() || null,
        class: String(req.body.class || '').trim() || null,
      };
      const { error } = await supabase.from('schedule').insert([payload]);
      if (error) throw error;
      return res.send(
        htmlPage(
          'تم',
          `<div class="card">تم إضافة حصة للمعلم: <b>${escapeHtml(teacher.name)}</b></div>
<div class="card"><a href="/admin/manual">رجوع</a></div>`
        )
      );
    } catch (e) {
      return res.status(500).send(String(e.message || e));
    }
  });

  app.get('/admin/import', basicAuth, (req, res) => {
    res.send(
      htmlPage(
        'استيراد Excel',
        `<h2>استيراد Excel</h2>
<div class="card">
  <form method="post" action="/admin/import" enctype="multipart/form-data">
    <div class="row">
      <label>النوع:</label>
      <select name="kind" required>
        <option value="teachers">teachers (المعلمين)</option>
        <option value="students">students (الطلاب)</option>
        <option value="schedule">schedule (الجدول)</option>
      </select>
      <label><input type="checkbox" name="replaceSchedule" value="1" /> استبدال كامل للجدول (schedule)</label>
    </div>
    <div class="row" style="margin-top:12px">
      <input type="file" name="file" accept=".xlsx,.xls" required />
      <button type="submit">رفع واستيراد</button>
    </div>
    <p class="muted">الأعمدة المفضلة: name, subject, telegram_id للمعلمين — و name, national_id, grade, class, committee_number, committee_location للطلاب — و teacher_telegram_id, day, period, grade, class للجدول.</p>
  </form>
</div>
<div class="card"><a href="/admin">رجوع</a></div>`
      )
    );
  });

  app.post('/admin/import', basicAuth, uploadTmp.single('file'), async (req, res) => {
    try {
      const kind = String(req.body.kind || '').trim();
      const replace = String(req.body.replaceSchedule || '') === '1';
      if (!req.file) return res.status(400).send('file is required');

      const rows = readFirstSheetRows(req.file.path);
      let count = 0;
      if (kind === 'teachers') count = await upsertTeachers(rows);
      else if (kind === 'students') count = await upsertStudents(rows);
      else if (kind === 'schedule') {
        count = replace ? await replaceSchedule(rows) : await insertSchedule(rows);
      } else {
        return res.status(400).send('invalid kind');
      }

      res.send(
        htmlPage(
          'تم',
          `<h2>تم الاستيراد</h2>
<div class="card">تمت معالجة <b>${count}</b> صف/سطر.</div>
<div class="card"><a href="/admin/import">رجوع</a></div>`
        )
      );
    } catch (e) {
      res.status(500).send(String(e.message || e));
    } finally {
      if (req.file?.path) fs.rm(req.file.path, { force: true }, () => {});
    }
  });

  app.get('/admin/results', basicAuth, (req, res) => {
    res.send(
      htmlPage(
        'رفع النتائج',
        `<h2>رفع صورة نتيجة</h2>
<div class="card">
  <form method="post" action="/admin/results" enctype="multipart/form-data">
    <div class="row">
      <label>رقم الهوية:</label>
      <input name="national_id" placeholder="اختياري إن كان اسم الملف هو رقم الهوية" />
    </div>
    <div class="row" style="margin-top:12px">
      <input type="file" name="image" accept="image/*" required />
      <button type="submit">رفع</button>
    </div>
    <p class="muted">يفضل أن يكون اسم الملف = رقم الهوية (مثال <code>1234567890.jpg</code>) لتسهيل الرفع الجماعي.</p>
  </form>
</div>
<div class="card"><a href="/admin">رجوع</a></div>`
      )
    );
  });

  app.post('/admin/results', basicAuth, uploadTmp.single('image'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).send('image is required');

      const fromField = normalizeNationalId(req.body.national_id || '');
      const fromName = normalizeNationalId(path.parse(req.file.originalname).name);
      const nid = fromField || fromName;
      if (!nid) return res.status(400).send('national_id is required');

      const ext = (path.extname(req.file.originalname) || '.jpg').toLowerCase();
      const outDir = path.join(filesRoot, 'results');
      ensureDir(outDir);
      const outPath = path.join(outDir, `${nid}${ext}`);
      fs.renameSync(req.file.path, outPath);

      const url = `${getBaseUrl(req)}/files/results/${encodeURIComponent(`${nid}${ext}`)}`;
      const { data, error } = await setStudentResultImageUrlByNationalId(nid, url);
      if (error) throw error;
      if (!data) {
        return res
          .status(404)
          .send('تم رفع الصورة لكن الطالب غير موجود بهذا الرقم. أدخل الطالب أولاً في students.');
      }

      res.send(
        htmlPage(
          'تم',
          `<h2>تم رفع النتيجة</h2>
<div class="card">
  <div>الطالب: <b>${data.name}</b></div>
  <div>الرابط: <a href="${url}" target="_blank" rel="noreferrer">${url}</a></div>
</div>
<div class="card"><a href="/admin/results">رفع صورة أخرى</a></div>`
        )
      );
    } catch (e) {
      res.status(500).send(String(e.message || e));
    } finally {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.rm(req.file.path, { force: true }, () => {});
      }
    }
  });

  app.get('/', (req, res) => res.redirect('/admin'));

  const port = Number(process.env.WEB_PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`admin web listening on ${port}`);
  });
}

main();

