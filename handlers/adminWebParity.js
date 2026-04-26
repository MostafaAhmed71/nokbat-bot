const path = require('path');
const fs = require('fs');
const { Markup } = require('telegraf');
const {
  getAdminDashboardCounts,
  listStudentsAdmin,
  listTeachersAdmin,
  listContentItemsAdmin,
  upsertTeacherRecord,
  upsertStudentRecord,
  insertScheduleSlot,
  upsertExamsSchedule,
  setStudentResultImageUrlByNationalId,
} = require('../services/supabase');
const {
  readFirstSheetRowsFromBuffer,
  upsertTeachers,
  upsertStudents,
  insertSchedule,
  replaceSchedule,
} = require('../services/adminExcel');
const { ingestFile } = require('../services/contentLibrary');
const { normalizeNationalId } = require('../utils/nationalId');
const { gradesKeyboard } = require('./student');

function chunkText(s, max = 3800) {
  const parts = [];
  let rest = s;
  while (rest.length) {
    parts.push(rest.slice(0, max));
    rest = rest.slice(max);
  }
  return parts;
}

function adminPanelKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📈 أرقام (لوحة الويب)', 'adm:kpi')],
    [
      Markup.button.callback('👥 طلاب — بحث', 'adm:list:stu'),
      Markup.button.callback('👨‍🏫 معلمون', 'adm:list:tch'),
    ],
    [Markup.button.callback('📚 محتوى/مراجعات', 'adm:list:rev')],
    [
      Markup.button.callback('📤 Excel استيراد', 'adm:xlsx:menu'),
      Markup.button.callback('📅 امتحانات Excel', 'adm:exams:xlsx'),
    ],
    [
      Markup.button.callback('📖 مكتبة — رفع', 'adm:lib:start'),
      Markup.button.callback('🖼 نتيجة — صورة', 'adm:res:start'),
    ],
    [Markup.button.callback('✏️ إدخال يدوي', 'adm:man:menu')],
    [Markup.button.callback('👥 إدارة+CRUD طلاب', 'adm:stu:mgmt')],
    [Markup.button.callback('قائمة الطلاب (صفحات)', 'adm:stu:0')],
    [Markup.button.callback('جداول المعلمين', 'adm:sch:menu')],
    [
      Markup.button.callback('بحث لجنة', 'adm:find:stu'),
      Markup.button.callback('بحث معلم', 'adm:find:tch'),
    ],
    [Markup.button.callback('إعلان 📢', 'adm:ann:start')],
  ]);
}

function isAdmin(ctx) {
  const admin = process.env.ADMIN_TELEGRAM_ID;
  if (admin == null || admin === '') return false;
  return String(ctx.from.id) === String(admin);
}

function getFilesRoot() {
  return process.env.FILES_ROOT || path.join(__dirname, '..', 'files');
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

function gradeLabelFromKey(k) {
  const map = {
    m1: 'أول متوسط',
    m2: 'ثاني متوسط',
    m3: 'ثالث متوسط',
    s1: 'أول ثانوي',
    s2: 'ثاني ثانوي',
    s3: 'ثالث ثانوي',
  };
  return map[String(k || '')] || null;
}

function adminLibrarySubjectsKeyboard() {
  const rows = [
    [
      Markup.button.callback('📐 رياضيات', 'adm:libsub:math'),
      Markup.button.callback('🔬 علوم', 'adm:libsub:science'),
    ],
    [
      Markup.button.callback('📖 لغتي', 'adm:libsub:arabic'),
      Markup.button.callback('📚 إنجليزي', 'adm:libsub:english'),
    ],
    [
      Markup.button.callback('🕌 إسلاميات', 'adm:libsub:islamic'),
      Markup.button.callback('📜 اجتماعيات', 'adm:libsub:social'),
    ],
    [
      Markup.button.callback('فيزياء', 'adm:libsub:physics'),
      Markup.button.callback('كمياء', 'adm:libsub:chemistry'),
      Markup.button.callback('إحياء', 'adm:libsub:biology'),
    ],
    [
      Markup.button.callback('قدرات لفظي', 'adm:libsub:qudrat_verbal'),
      Markup.button.callback('قدرات كمي', 'adm:libsub:qudrat_quant'),
    ],
    [Markup.button.callback('التحصيلي', 'adm:libsub:tahsili')],
    [Markup.button.callback('🎯 أخرى', 'adm:libsub:other')],
    [Markup.button.callback('رجوع', 'adm:home')],
  ];
  return Markup.inlineKeyboard(rows);
}

function formatStudentRowsTelegram(rows) {
  if (!rows.length) return 'لا توجد نتائج.';
  return rows
    .map(
      (s) =>
        `• ${s.name} — ${s.grade || '—'} / ${s.class || '—'} — هوية: ${s.national_id || '—'} — ${
          s.telegram_id ? 'مربوط' : 'غير مربوط'
        }`
    )
    .join('\n');
}

function formatTeacherRowsTelegram(rows) {
  if (!rows.length) return 'لا توجد نتائج.';
  return rows
    .map((t) => `• ${t.name} — ${t.subject || '—'} — TG: ${t.telegram_id || '—'}`)
    .join('\n');
}

function formatContentRowsTelegram(rows) {
  if (!rows.length) return 'لا توجد نتائج.';
  return rows
    .map(
      (r) =>
        `• ${r.title} — ${r.kind} — ${r.grade} / ${r.subject_key} — ${r.source || ''}`.slice(0, 200)
    )
    .join('\n');
}

async function downloadTelegramFile(ctx, fileId) {
  const link = await ctx.telegram.getFileLink(fileId);
  const res = await fetch(String(link));
  if (!res.ok) throw new Error(`download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function registerAdminWeb(bot) {
  bot.action('adm:kpi', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    await ctx.answerCbQuery();
    const { data, error } = await getAdminDashboardCounts();
    if (error) {
      await ctx.reply('تعذر جلب الأرقام.', adminPanelKeyboard());
      return;
    }
    const msg =
      `📈 نفس بطاقات لوحة الويب:\n\n` +
      `👨‍🎓 طلاب: ${data.students}\n` +
      `👨‍🏫 معلمون: ${data.teachers}\n` +
      `📚 محتوى/مراجعات: ${data.contentItems}\n` +
      `📅 مواعيد امتحانات: ${data.examsSchedule}`;
    return ctx.reply(msg, adminPanelKeyboard());
  });

  bot.action('adm:list:stu', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.awaiting = 'admin_list_students';
    await ctx.answerCbQuery();
    return ctx.reply(
      'اكتب جزءاً من اسم الطالب للبحث.\n' +
        'لأول 100 طالباً تقريباً بدون بحث أرسل نقطة: .\n' +
        'لتصفية بالصف أرسل سطرين:\nالسطر1: الاسم أو .\nالسطر2: اسم الصف بالضبط كما في القاعدة'
    );
  });

  bot.action('adm:list:tch', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.awaiting = 'admin_list_teachers';
    await ctx.answerCbQuery();
    return ctx.reply(
      'اكتب جزءاً من اسم المعلم، أو . للقائمة.\n' +
        'اختياري — سطر ثانٍ: المادة للتصفية بالضبط كما في القاعدة.'
    );
  });

  bot.action('adm:list:rev', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.awaiting = 'admin_list_content';
    await ctx.answerCbQuery();
    return ctx.reply(
      'بحث بعنوان المحتوى — اكتب جزءاً من العنوان أو . للأحدث.\n' +
        'اختياري: سطر2 صف، سطر3 subject_key (مثل math)'
    );
  });

  bot.action('adm:xlsx:menu', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    await ctx.answerCbQuery();
    return ctx.reply(
      '📤 استيراد Excel (كصفحة الويب):',
      Markup.inlineKeyboard([
        [Markup.button.callback('معلمون', 'adm:xlsx:tch')],
        [Markup.button.callback('طلاب', 'adm:xlsx:stu')],
        [Markup.button.callback('جدول — إضافة فقط', 'adm:xlsx:sch:0')],
        [Markup.button.callback('جدول — استبدال كامل', 'adm:xlsx:sch:1')],
        [Markup.button.callback('رجوع', 'adm:home')],
      ])
    );
  });

  bot.action('adm:xlsx:tch', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.adminImportKind = 'teachers';
    ctx.session.adminScheduleReplace = false;
    ctx.session.awaiting = 'admin_send_xlsx';
    await ctx.answerCbQuery();
    return ctx.reply('أرسل ملف Excel (.xlsx) للمعلمين.', adminPanelKeyboard());
  });

  bot.action('adm:xlsx:stu', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.adminImportKind = 'students';
    ctx.session.adminScheduleReplace = false;
    ctx.session.awaiting = 'admin_send_xlsx';
    await ctx.answerCbQuery();
    return ctx.reply('أرسل ملف Excel (.xlsx) للطلاب.', adminPanelKeyboard());
  });

  bot.action(/^adm:xlsx:sch:([01])$/, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.adminImportKind = 'schedule';
    ctx.session.adminScheduleReplace = ctx.match[1] === '1';
    ctx.session.awaiting = 'admin_send_xlsx';
    await ctx.answerCbQuery();
    return ctx.reply(
      `أرسل ملف Excel للجدول.\nالوضع: ${ctx.match[1] === '1' ? 'استبدال كامل' : 'إضافة فقط'}`,
      adminPanelKeyboard()
    );
  });

  bot.action('adm:exams:xlsx', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.adminImportKind = 'exams';
    ctx.session.awaiting = 'admin_send_xlsx';
    await ctx.answerCbQuery();
    return ctx.reply('أرسل ملف Excel لجدول الامتحانات (grade, subject, exam_date, ...).', adminPanelKeyboard());
  });

  bot.action('adm:lib:start', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    await ctx.answerCbQuery();
    return ctx.reply(
      'اختر نوع الملف:',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('مراجعة', 'adm:libk:review'),
          Markup.button.callback('منهج', 'adm:libk:curriculum'),
        ],
        [Markup.button.callback('أخرى', 'adm:libk:other')],
        [Markup.button.callback('رجوع', 'adm:home')],
      ])
    );
  });

  bot.action(/^adm:libk:(review|curriculum|other)$/, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.adminLib = { kind: ctx.match[1], gradeKey: null, subjectKey: null };
    await ctx.answerCbQuery();
    return ctx.reply('اختر الصف:', gradesKeyboard('adm:libg', 'adm:home'));
  });

  bot.action(/^adm:libg:(m1|m2|m3|s1|s2|s3)$/, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.adminLib = ctx.session.adminLib || {};
    ctx.session.adminLib.gradeKey = ctx.match[1];
    await ctx.answerCbQuery();
    return ctx.reply('اختر المادة:', adminLibrarySubjectsKeyboard());
  });

  bot.action(/^adm:libsub:([a-z_]+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.adminLib = ctx.session.adminLib || {};
    ctx.session.adminLib.subjectKey = ctx.match[1];
    ctx.session.awaiting = 'admin_library_file';
    await ctx.answerCbQuery();
    return ctx.reply('أرسل الملف (PDF أو DOCX أو TXT).', adminPanelKeyboard());
  });

  bot.action('adm:res:start', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.awaiting = 'admin_result_nid';
    ctx.session.adminResultNid = null;
    await ctx.answerCbQuery();
    return ctx.reply('اكتب رقم الهوية/الإقامة لربط صورة النتيجة بهذا الطالب.', adminPanelKeyboard());
  });

  bot.action('adm:man:menu', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    await ctx.answerCbQuery();
    return ctx.reply(
      '✏️ إدخال يدوي (كصفحة الويب — يدوي):',
      Markup.inlineKeyboard([
        [Markup.button.callback('معلم', 'adm:man:tch')],
        [Markup.button.callback('طالب (upsert بالهوية)', 'adm:man:stu')],
        [Markup.button.callback('حصة في الجدول', 'adm:man:sch')],
        [Markup.button.callback('رجوع', 'adm:home')],
      ])
    );
  });

  bot.action('adm:man:tch', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.awaiting = 'admin_man_teacher';
    await ctx.answerCbQuery();
    return ctx.reply(
      'أرسل سطراً واحداً:\nالاسم | المادة أو - | telegram_id\nمثال:\n' + 'أحمد علي | رياضيات | 123456789'
    );
  });

  bot.action('adm:man:stu', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.awaiting = 'admin_man_student';
    await ctx.answerCbQuery();
    return ctx.reply(
      'سطر واحد:\nالاسم | الهوية | الصف | الفصل | رقم اللجنة أو - | المكان أو -\n' +
        '(نفس upsert الويب — الهوية مطلوبة)'
    );
  });

  bot.action('adm:man:sch', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.awaiting = 'admin_man_schedule';
    await ctx.answerCbQuery();
    return ctx.reply(
      'سطر واحد:\nteacher_telegram_id | اليوم | الحصة | الصف أو - | الفصل أو -\n' + 'مثال:\n12345 | الأحد | الأولى | ثالث متوسط | 2'
    );
  });
}

async function handleAdminWebText(ctx, t) {
  if (ctx.session.awaiting === 'admin_list_students') {
    ctx.session.awaiting = null;
    const lines = t.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const q = lines[0] || '';
    const grade = lines[1] || '';
    const nameQuery = q === '.' ? '' : q;
    const { data, error } = await listStudentsAdmin({
      nameQuery,
      grade,
      limit: 100,
    });
    if (error) {
      await ctx.reply('خطأ في القراءة.', adminPanelKeyboard());
      return true;
    }
    const body = formatStudentRowsTelegram(data);
    const parts = chunkText(`النتائج (${data.length}):\n\n${body}`);
    const last = parts.length ? parts.pop() : '';
    for (const p of parts) {
      // eslint-disable-next-line no-await-in-loop
      await ctx.reply(p);
    }
    await ctx.reply(last || '—', adminPanelKeyboard());
    return true;
  }

  if (ctx.session.awaiting === 'admin_list_teachers') {
    ctx.session.awaiting = null;
    const lines = t.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const q = lines[0] || '';
    const subject = lines[1] || '';
    const nameQuery = q === '.' ? '' : q;
    const { data, error } = await listTeachersAdmin({
      nameQuery,
      subject,
      limit: 100,
    });
    if (error) {
      await ctx.reply('خطأ في القراءة.', adminPanelKeyboard());
      return true;
    }
    const body = formatTeacherRowsTelegram(data);
    const parts = chunkText(`المعلمون (${data.length}):\n\n${body}`);
    const last = parts.length ? parts.pop() : '';
    for (const p of parts) {
      // eslint-disable-next-line no-await-in-loop
      await ctx.reply(p);
    }
    await ctx.reply(last || '—', adminPanelKeyboard());
    return true;
  }

  if (ctx.session.awaiting === 'admin_list_content') {
    ctx.session.awaiting = null;
    const lines = t.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const q = lines[0] || '';
    const grade = lines[1] || '';
    const subjectKey = lines[2] || '';
    const titleQuery = q === '.' ? '' : q;
    const { data, error } = await listContentItemsAdmin({
      titleQuery,
      grade,
      subjectKey,
      limit: 80,
    });
    if (error) {
      await ctx.reply('خطأ في القراءة.', adminPanelKeyboard());
      return true;
    }
    const body = formatContentRowsTelegram(data);
    const parts = chunkText(`المحتوى (${data.length}):\n\n${body}`);
    const last = parts.length ? parts.pop() : '';
    for (const p of parts) {
      // eslint-disable-next-line no-await-in-loop
      await ctx.reply(p);
    }
    await ctx.reply(last || '—', adminPanelKeyboard());
    return true;
  }

  if (ctx.session.awaiting === 'admin_man_teacher') {
    ctx.session.awaiting = null;
    const parts = t.split('|').map((x) => x.trim());
    const [name, subj, tg] = parts;
    if (!name || !tg) {
      await ctx.reply('صيغة ناقصة (الاسم و telegram_id مطلوبان).', adminPanelKeyboard());
      return true;
    }
    const subject = subj && subj !== '-' ? subj : null;
    const { error } = await upsertTeacherRecord({ name, subject, telegram_id: tg });
    if (error) {
      await ctx.reply(`خطأ: ${error.message}`, adminPanelKeyboard());
      return true;
    }
    await ctx.reply('✅ تم حفظ/تحديث المعلم.', adminPanelKeyboard());
    return true;
  }

  if (ctx.session.awaiting === 'admin_man_student') {
    ctx.session.awaiting = null;
    const parts = t.split('|').map((x) => x.trim());
    const [name, nid, grade, klass, cn, loc] = parts;
    if (!name || !nid) {
      await ctx.reply('الاسم والهوية مطلوبان.', adminPanelKeyboard());
      return true;
    }
    const { error } = await upsertStudentRecord({
      name,
      national_id: nid,
      grade: grade || null,
      class: klass || null,
      committee_number: cn && cn !== '-' ? cn : null,
      committee_location: loc && loc !== '-' ? loc : null,
    });
    if (error) {
      await ctx.reply(`خطأ: ${error.message}`, adminPanelKeyboard());
      return true;
    }
    await ctx.reply('✅ تم حفظ/تحديث الطالب.', adminPanelKeyboard());
    return true;
  }

  if (ctx.session.awaiting === 'admin_man_schedule') {
    ctx.session.awaiting = null;
    const parts = t.split('|').map((x) => x.trim());
    const [teacherTg, day, period, grade, klass] = parts;
    if (!teacherTg || !day || !period) {
      await ctx.reply('teacher_tg واليوم والحصة مطلوبة.', adminPanelKeyboard());
      return true;
    }
    const { error } = await insertScheduleSlot({
      teacherTelegramId: teacherTg,
      day,
      period,
      grade: grade && grade !== '-' ? grade : null,
      class: klass && klass !== '-' ? klass : null,
    });
    if (error) {
      const msg = error.message === 'teacher_not_found' ? 'المعلم غير موجود بهذا المعرف.' : String(error.message);
      await ctx.reply(`خطأ: ${msg}`, adminPanelKeyboard());
      return true;
    }
    await ctx.reply('✅ تمت إضافة الحصة.', adminPanelKeyboard());
    return true;
  }

  if (ctx.session.awaiting === 'admin_result_nid') {
    if (t === 'إلغاء') {
      ctx.session.awaiting = null;
      await ctx.reply('تم الإلغاء.', adminPanelKeyboard());
      return true;
    }
    const nid = normalizeNationalId(t);
    if (!nid) {
      await ctx.reply('رقم الهوية غير صالح. أعد الإدخال أو أرسل: إلغاء');
      return true;
    }
    ctx.session.adminResultNid = nid;
    ctx.session.awaiting = 'admin_result_photo';
    await ctx.reply('الآن أرسل صورة النتيجة كصورة (وليس ملفاً).');
    return true;
  }

  return false;
}

async function handleAdminDocument(ctx) {
  if (!isAdmin(ctx)) return false;
  const awaiting = ctx.session.awaiting;
  const doc = ctx.message.document;
  if (!doc) return false;

  if (awaiting === 'admin_send_xlsx') {
    const name = String(doc.file_name || '').toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      await ctx.reply('يُقبل Excel فقط (.xlsx أو .xls).');
      return true;
    }
    const kind = ctx.session.adminImportKind;
    if (!kind) {
      await ctx.reply('ابدأ من قائمة استيراد Excel.');
      return true;
    }
    try {
      const buf = await downloadTelegramFile(ctx, doc.file_id);
      const rows = readFirstSheetRowsFromBuffer(buf);
      ctx.session.awaiting = null;
      ctx.session.adminImportKind = null;

      if (kind === 'exams') {
        const { data, error } = await upsertExamsSchedule(rows);
        if (error) throw error;
        await ctx.reply(`تم استيراد امتحانات: ${(data || []).length} سطر.`, adminPanelKeyboard());
        return true;
      }
      if (kind === 'teachers') {
        const n = await upsertTeachers(rows);
        await ctx.reply(`تم استيراد معلمين: ${n} سطر.`, adminPanelKeyboard());
        return true;
      }
      if (kind === 'students') {
        const out = await upsertStudents(rows);
        let msg = `تم استيراد طلاب: ${out.accepted} سطر مقبول.`;
        if (out.rejected?.length) {
          msg += `\nمرفوض: ${out.rejected.length}\n`;
          msg += out.rejected
            .slice(0, 15)
            .map((r) => `• ${r.name}: ${r.reason}`)
            .join('\n');
          if (out.rejected.length > 15) msg += '\n...';
        }
        const parts = chunkText(msg);
        const last = parts.length ? parts.pop() : '';
        for (const p of parts) {
          // eslint-disable-next-line no-await-in-loop
          await ctx.reply(p);
        }
        await ctx.reply(last || '—', adminPanelKeyboard());
        return true;
      }
      if (kind === 'schedule') {
        const rep = Boolean(ctx.session.adminScheduleReplace);
        const n = rep ? await replaceSchedule(rows) : await insertSchedule(rows);
        await ctx.reply(`تم جدول الحصص: ${n} صف (${rep ? 'استبدال' : 'إضافة'}).`, adminPanelKeyboard());
        return true;
      }
    } catch (e) {
      ctx.session.awaiting = null;
      await ctx.reply(`فشل الاستيراد: ${e.message || e}`, adminPanelKeyboard());
      return true;
    }
    return true;
  }

  if (awaiting === 'admin_library_file') {
    const ext = String(path.extname(doc.file_name || '') || '').toLowerCase();
    if (!['.pdf', '.docx', '.txt'].includes(ext)) {
      await ctx.reply('صيغة غير مدعومة. أرسل PDF أو DOCX أو TXT.');
      return true;
    }
    const lib = ctx.session.adminLib || {};
    const grade = gradeLabelFromKey(lib.gradeKey);
    const subjectKey = String(lib.subjectKey || '').trim();
    const kind = String(lib.kind || 'review').trim() || 'review';
    if (!grade || !subjectKey) {
      await ctx.reply('ابدأ من مكتبة — رفع ملف واختر الصف والمادة.');
      return true;
    }
    const filesRoot = getFilesRoot();
    const libDir = path.join(
      filesRoot,
      'library',
      sanitizeSegment(grade),
      sanitizeSegment(subjectKey)
    );
    ensureDir(libDir);
    const base = sanitizeSegment(path.basename(doc.file_name || 'file', ext) || 'file');
    const outPath = path.join(libDir, `${base}-${Date.now()}${ext}`);
    try {
      const buf = await downloadTelegramFile(ctx, doc.file_id);
      fs.writeFileSync(outPath, buf);
      const ing = await ingestFile({
        kind,
        grade,
        subjectKey,
        title: base,
        filePath: outPath,
        mime: doc.mime_type || '',
        source: 'telegram',
        uploadedByTelegramId: String(ctx.from.id),
      });
      ctx.session.awaiting = null;
      ctx.session.adminLib = null;
      await ctx.reply(
        `تم الرفع والفهرسة.\nالعنوان: ${ing.title}\nالأجزاء: ${ing.chunksCount}`,
        adminPanelKeyboard()
      );
    } catch (e) {
      await ctx.reply(`تعذر الرفع: ${e.message || e}`, adminPanelKeyboard());
    }
    return true;
  }

  return false;
}

async function handleAdminPhoto(ctx) {
  if (!isAdmin(ctx)) return false;
  if (ctx.session.awaiting !== 'admin_result_photo') return false;
  const nid = normalizeNationalId(ctx.session.adminResultNid || '');
  if (!nid) {
    ctx.session.awaiting = null;
    await ctx.reply('انتهت الجلسة. ابدأ من جديد: نتيجة — صورة.');
    return true;
  }
  const photos = ctx.message.photo || [];
  const best = photos[photos.length - 1];
  if (!best) return false;
  const ext = '.jpg';
  const filesRoot = getFilesRoot();
  const outDir = path.join(filesRoot, 'results');
  ensureDir(outDir);
  const outName = `${nid}${ext}`;
  const outPath = path.join(outDir, outName);
  try {
      const buf = await downloadTelegramFile(ctx, best.file_id);
      fs.writeFileSync(outPath, buf);
      const base = String(process.env.BASE_PUBLIC_URL || '')
        .trim()
        .replace(/\/+$/, '');
      ctx.session.awaiting = null;
      ctx.session.adminResultNid = null;
      if (!base) {
        await ctx.reply(
          '⚠️ تم حفظ الصورة على السيرفر. اضبط BASE_PUBLIC_URL في .env ثم حدّث رابط النتيجة من الويب أو أعد الرفع.',
          adminPanelKeyboard()
        );
        return true;
      }
      const url = `${base}/files/results/${encodeURIComponent(outName)}`;
      const { data, error } = await setStudentResultImageUrlByNationalId(nid, url);
      if (error) throw error;
      if (!data) {
        await ctx.reply(
          'تم حفظ الصورة لكن الطالب غير موجود بهذه الهوية في قاعدة البيانات.',
          adminPanelKeyboard()
        );
        return true;
      }
      await ctx.reply(`تم ربط النتيجة بالطالب: ${data.name}\n${url}`, adminPanelKeyboard());
  } catch (e) {
    await ctx.reply(`تعذر الرفع: ${e.message || e}`, adminPanelKeyboard());
  }
  return true;
}

module.exports = {
  adminPanelKeyboard,
  chunkText,
  registerAdminWeb,
  handleAdminWebText,
  handleAdminDocument,
  handleAdminPhoto,
};
