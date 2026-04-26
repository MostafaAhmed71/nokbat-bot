const { Markup } = require('telegraf');
const {
  adminPanelKeyboard,
  chunkText,
  registerAdminWeb,
  handleAdminWebText,
  handleAdminDocument,
  handleAdminPhoto,
} = require('./adminWebParity');
const {
  listStudentsPage,
  listTeachers,
  searchStudentsByName,
  searchTeachersByName,
  getFullScheduleForTeacher,
  listAllStudentTelegramIds,
  listAllTeacherTelegramIds,
  listAllParentTelegramIds,
  createAnnouncement,
  insertStudentRow,
  updateStudentRow,
  deleteStudentRow,
} = require('../services/supabase');
const { normalizeNationalId } = require('../utils/nationalId');
const { formatStudentCommittee, studentPickKeyboard } = require('./student');

function isAdmin(ctx) {
  const admin = process.env.ADMIN_TELEGRAM_ID;
  if (admin == null || admin === '') return false;
  return String(ctx.from.id) === String(admin);
}

function adminStudentPickKeyboard(students, mode) {
  const prefix = mode === 'delete' ? 'adm:stu:delpick' : 'adm:stu:editpick';
  const rows = students.map((s) => [
    Markup.button.callback(
      `${s.name} (${s.grade || '؟'} / ${s.class || '؟'})`.slice(0, 60),
      `${prefix}:${s.id}`
    ),
  ]);
  rows.push([Markup.button.callback('رجوع للوحة', 'adm:home')]);
  return Markup.inlineKeyboard(rows);
}

function formatStudentsList(rows) {
  if (!rows.length) return 'لا يوجد طلاب في هذه الصفحة.';
  return rows
    .map((r) => `• ${r.name} — ${r.grade || '؟'} / ${r.class || '؟'}`)
    .join('\n');
}

function formatTeacherSchedule(rows) {
  if (!rows.length) return 'لا يوجد جدول مسجل لهذا المعلم.';
  const byDay = new Map();
  for (const r of rows) {
    const d = r.day || '—';
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(r);
  }
  const lines = [];
  for (const [day, items] of byDay) {
    lines.push(`${day}`);
    for (const it of items) {
      lines.push(`  • ${it.period}: ${it.grade || '—'} / ${it.class || '—'}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

async function replyAdminPanel(ctx) {
  return ctx.reply(
    'لوحة المدير — نفس خدمات صفحة الويب (استيراد، امتحانات، مكتبة، نتائج، يدوي، قوائم).\nاختر:',
    adminPanelKeyboard()
  );
}

function registerAdmin(bot) {
  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.reply('هذا الأمر متاح للمدير فقط.');
    }
    return replyAdminPanel(ctx);
  });

  bot.action(/^adm:stu:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    const offset = Number(ctx.match[1]) || 0;
    const limit = 35;
    const { data, error, count } = await listStudentsPage(offset, limit);
    if (error) {
      await ctx.answerCbQuery('خطأ في القراءة');
      return ctx.reply('تعذر جلب قائمة الطلاب.');
    }
    const header = `قائمة الطلاب (من ${offset + 1} إلى ${offset + data.length} من أصل ${count}):\n\n`;
    const body = formatStudentsList(data);
    const nav = [];
    if (offset > 0) {
      nav.push(
        Markup.button.callback(
          '⬅️ السابق',
          `adm:stu:${Math.max(0, offset - limit)}`
        )
      );
    }
    if (offset + data.length < count) {
      nav.push(Markup.button.callback('التالي ➡️', `adm:stu:${offset + limit}`));
    }
    const rowsKb = [];
    if (nav.length) rowsKb.push(nav);
    rowsKb.push([Markup.button.callback('رجوع للوحة', 'adm:home')]);
    const kb = Markup.inlineKeyboard(rowsKb);

    await ctx.answerCbQuery();
    const full = header + body;
    const parts = chunkText(full);
    const last = parts.length ? parts.pop() : '';
    for (const p of parts) {
      await ctx.reply(p);
    }
    return ctx.reply(last || '—', kb);
  });

  bot.action('adm:home', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    await ctx.answerCbQuery();
    return replyAdminPanel(ctx);
  });

  bot.action('adm:sch:menu', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    const { data, error } = await listTeachers();
    if (error || !data.length) {
      await ctx.answerCbQuery();
      return ctx.reply('لا يوجد معلمون أو تعذر الجلب.');
    }
    const rows = data.map((t) => [
      Markup.button.callback(
        `${t.name} (${t.subject || '—'})`.slice(0, 60),
        `adm:sch:${t.id}`
      ),
    ]);
    await ctx.answerCbQuery();
    return ctx.reply('اختر معلماً لعرض جدوله:', Markup.inlineKeyboard(rows));
  });

  bot.action(/^adm:sch:([0-9a-f-]{36})$/i, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    const id = ctx.match[1];
    const { data, error } = await getFullScheduleForTeacher(id);
    if (error) {
      await ctx.answerCbQuery();
      return ctx.reply('تعذر جلب الجدول.');
    }
    await ctx.answerCbQuery();
    const text = formatTeacherSchedule(data);
    const parts = chunkText(text);
    const last = parts.length ? parts.pop() : '';
    for (const p of parts) {
      await ctx.reply(p);
    }
    return ctx.reply(
      last || '—',
      Markup.inlineKeyboard([[Markup.button.callback('رجوع', 'adm:home')]])
    );
  });

  bot.action('adm:find:stu', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.awaiting = 'admin_student';
    await ctx.answerCbQuery();
    return ctx.reply(
      'اكتب اسم الطالب (أو جزءاً منه) لعرض الصف والفصل ورقم اللجنة ومكانها.'
    );
  });

  bot.action('adm:find:tch', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.awaiting = 'admin_teacher';
    await ctx.answerCbQuery();
    return ctx.reply('اكتب اسم المعلم للبحث.');
  });

  bot.action('adm:stu:mgmt', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    await ctx.answerCbQuery();
    return ctx.reply(
      '👥 إدارة الطلاب — اختر:',
      Markup.inlineKeyboard([
        [Markup.button.callback('➕ إضافة (سطر واحد)', 'adm:add:go')],
        [Markup.button.callback('✏️ تعديل (بحث بالاسم)', 'adm:edit:go')],
        [Markup.button.callback('🗑️ حذف (بحث بالاسم)', 'adm:del:go')],
        [Markup.button.callback('رجوع للوحة', 'adm:home')],
      ])
    );
  });

  bot.action('adm:add:go', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.awaiting = 'admin_student_add_line';
    await ctx.answerCbQuery();
    return ctx.reply(
      'أرسل سطراً واحداً الحقول بالترتيب ومفصولة بـ |\n\n' +
        'الاسم | الهوية أو - | الصف | الفصل | رقم اللجنة أو - | مكان اللجنة أو -\n\n' +
        'مثال:\n' +
        'محمد أحمد | 1234567890 | ثالث متوسط | 2 | 5 | مدرسة النخبة'
    );
  });

  bot.action('adm:edit:go', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.awaiting = 'admin_student_edit_search';
    await ctx.answerCbQuery();
    return ctx.reply('اكتب اسماً أو جزءاً منه للبحث عن الطالب المراد تعديله.');
  });

  bot.action('adm:del:go', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.awaiting = 'admin_student_del_search';
    await ctx.answerCbQuery();
    return ctx.reply('اكتب اسماً أو جزءاً منه للبحث عن الطالب المراد حذفه.');
  });

  bot.action(/^adm:stu:editpick:([0-9a-f-]{36})$/i, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    const id = ctx.match[1];
    ctx.session.adminEditStudentId = id;
    ctx.session.awaiting = 'admin_student_edit_kv';
    await ctx.answerCbQuery();
    return ctx.reply(
      'اكتب سطراً واحداً: الحقل=القيمة\n\n' +
        'الحقول المسموحة: name, grade, class, national_id, committee_number, committee_location\n\n' +
        'مثال: class=3\nأو أرسل كلمة: إلغاء'
    );
  });

  bot.action(/^adm:stu:delpick:([0-9a-f-]{36})$/i, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    const id = ctx.match[1];
    ctx.session.adminDeleteStudentId = id;
    await ctx.answerCbQuery();
    return ctx.reply(
      '⚠️ تأكيد حذف هذا الطالب من قاعدة البيانات؟',
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ نعم، احذف', `adm:stu:del:yes:${id}`)],
        [Markup.button.callback('❌ لا', 'adm:stu:mgmt')],
      ])
    );
  });

  bot.action(/^adm:stu:del:yes:([0-9a-f-]{36})$/i, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    const id = ctx.match[1];
    await ctx.answerCbQuery();
    ctx.session.adminDeleteStudentId = null;
    const { error } = await deleteStudentRow(id);
    if (error) {
      return ctx.reply(`تعذر الحذف: ${error.message || 'خطأ'}`, adminPanelKeyboard());
    }
    return ctx.reply('تم حذف الطالب.', adminPanelKeyboard());
  });

  bot.action('adm:ann:start', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    ctx.session.awaiting = 'admin_announcement_target';
    await ctx.answerCbQuery();
    return ctx.reply(
      'اختر مستهدف الإعلان:',
      Markup.inlineKeyboard([
        [Markup.button.callback('الكل', 'adm:ann:target:all')],
        [Markup.button.callback('الطلاب', 'adm:ann:target:students')],
        [Markup.button.callback('المعلمين', 'adm:ann:target:teachers')],
        [Markup.button.callback('أولياء الأمور', 'adm:ann:target:parents')],
        [Markup.button.callback('رجوع', 'adm:home')],
      ])
    );
  });

  bot.action(/^adm:ann:target:(all|students|teachers|parents)$/, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('غير مصرح');
    const target = ctx.match[1];
    ctx.session.awaiting = 'admin_announcement_text';
    ctx.session.announcementTarget = target;
    await ctx.answerCbQuery();
    return ctx.reply('اكتب نص الإعلان الآن (سيتم إرساله فوراً):');
  });

  registerAdminWeb(bot);
}

async function handleAdminText(ctx) {
  const t = (ctx.message.text || '').trim();
  if (await handleAdminWebText(ctx, t)) return;
  if (ctx.session.awaiting === 'admin_announcement_target') {
    return ctx.reply('اختر المستهدف من أزرار الرسالة السابقة (الكل / الطلاب / ...).');
  }
  if (ctx.session.awaiting === 'admin_student_edit_kv') {
    if (t === 'إلغاء') {
      ctx.session.awaiting = null;
      ctx.session.adminEditStudentId = null;
      return ctx.reply('تم الإلغاء.', adminPanelKeyboard());
    }
    const m = t.match(/^([^=]+)=(.+)$/);
    if (!m) {
      return ctx.reply('صيغة غير صحيحة. استخدم: الحقل=القيمة');
    }
    const field = m[1].trim().toLowerCase();
    const value = m[2].trim();
    const allowed = new Set([
      'name',
      'grade',
      'class',
      'national_id',
      'committee_number',
      'committee_location',
    ]);
    if (!allowed.has(field)) {
      return ctx.reply('حقل غير مسموح. راجع القائمة في التعليمات.');
    }
    const sid = String(ctx.session.adminEditStudentId || '').trim();
    if (!sid) {
      ctx.session.awaiting = null;
      return ctx.reply('انتهت الجلسة. ابدأ من جديد.', adminPanelKeyboard());
    }
    const patch = {};
    if (field === 'national_id') {
      const nid = normalizeNationalId(value);
      if (!nid) return ctx.reply('رقم الهوية غير صالح بعد التنظيف.');
      patch.national_id = nid;
    } else {
      patch[field] = value;
    }
    const { error } = await updateStudentRow(sid, patch);
    ctx.session.awaiting = null;
    ctx.session.adminEditStudentId = null;
    if (error) {
      return ctx.reply(`تعذر التحديث: ${error.message || 'خطأ'}`, adminPanelKeyboard());
    }
    return ctx.reply('✅ تم تحديث بيانات الطالب.', adminPanelKeyboard());
  }

  if (ctx.session.awaiting === 'admin_student_add_line') {
    ctx.session.awaiting = null;
    if (t === 'إلغاء') return ctx.reply('تم الإلغاء.', adminPanelKeyboard());
    const parts = t.split('|').map((x) => x.trim());
    if (parts.length < 4) {
      return ctx.reply(
        'صيغة غير كافية. المطلوب:\nالاسم | الهوية أو - | الصف | الفصل | رقم اللجنة (اختياري) | المكان (اختياري)',
        adminPanelKeyboard()
      );
    }
    const [name, rawNid, grade, klass, cn, loc] = parts;
    if (!name) return ctx.reply('الاسم مطلوب.', adminPanelKeyboard());
    let national_id = null;
    if (rawNid && rawNid !== '-') {
      national_id = normalizeNationalId(rawNid);
      if (!national_id) {
        return ctx.reply('رقم الهوية غير صالح. استخدم أرقاماً صحيحة أو "-" لتخطيه.', adminPanelKeyboard());
      }
    }
    const committee_number = cn && cn !== '-' ? cn : null;
    const committee_location = loc && loc !== '-' ? loc : null;
    const { data, error } = await insertStudentRow({
      name,
      national_id,
      grade,
      class: klass,
      committee_number,
      committee_location,
    });
    if (error) {
      return ctx.reply(
        `تعذر الإضافة: ${error.message || 'ربما الهوية مكررة'}`,
        adminPanelKeyboard()
      );
    }
    return ctx.reply(`✅ تمت إضافة الطالب: ${data?.name || name}`, adminPanelKeyboard());
  }

  if (ctx.session.awaiting === 'admin_student_edit_search') {
    ctx.session.awaiting = null;
    const { data, error } = await searchStudentsByName(t);
    if (error) return ctx.reply('خطأ أثناء البحث.', adminPanelKeyboard());
    if (!data.length) return ctx.reply('لم يتم العثور على طالب.', adminPanelKeyboard());
    return ctx.reply('اختر الطالب لتعديل بياناته:', adminStudentPickKeyboard(data, 'edit'));
  }

  if (ctx.session.awaiting === 'admin_student_del_search') {
    ctx.session.awaiting = null;
    const { data, error } = await searchStudentsByName(t);
    if (error) return ctx.reply('خطأ أثناء البحث.', adminPanelKeyboard());
    if (!data.length) return ctx.reply('لم يتم العثور على طالب.', adminPanelKeyboard());
    return ctx.reply('اختر الطالب للحذف:', adminStudentPickKeyboard(data, 'delete'));
  }

  if (ctx.session.awaiting === 'admin_student') {
    ctx.session.awaiting = null;
    const { data, error } = await searchStudentsByName(t);
    if (error) return ctx.reply('خطأ أثناء البحث.');
    if (!data.length) return ctx.reply('لم يتم العثور على طالب.');
    if (data.length === 1) {
      return ctx.reply(
        formatStudentCommittee(data[0], { forStaff: true }),
        adminPanelKeyboard()
      );
    }
    return ctx.reply(
      'وجدنا أكثر من نتيجة. اختر الطالب لعرض بيانات لجنته:',
      studentPickKeyboard(data)
    );
  }
  if (ctx.session.awaiting === 'admin_teacher') {
    ctx.session.awaiting = null;
    const { data, error } = await searchTeachersByName(t);
    if (error) return ctx.reply('خطأ أثناء البحث.');
    if (!data.length) return ctx.reply('لم يتم العثور على معلم.');
    const lines = data.map(
      (x) =>
        `• ${x.name} — ${x.subject || '—'} — تيليجرام: ${x.telegram_id || 'غير مربوط'}`
    );
    return ctx.reply(lines.join('\n'), adminPanelKeyboard());
  }
  if (ctx.session.awaiting === 'admin_announcement_text') {
    ctx.session.awaiting = null;
    const target = String(ctx.session.announcementTarget || 'all');
    ctx.session.announcementTarget = null;
    if (!t) return ctx.reply('نص الإعلان فارغ.');

    let ids = [];
    if (target === 'students') {
      const { data } = await listAllStudentTelegramIds();
      ids = data || [];
    } else if (target === 'teachers') {
      const { data } = await listAllTeacherTelegramIds();
      ids = data || [];
    } else if (target === 'parents') {
      const { data } = await listAllParentTelegramIds();
      ids = data || [];
    } else {
      const [s, te, p] = await Promise.all([
        listAllStudentTelegramIds(),
        listAllTeacherTelegramIds(),
        listAllParentTelegramIds(),
      ]);
      ids = Array.from(new Set([...(s.data || []), ...(te.data || []), ...(p.data || [])]));
    }

    const header = '📢 إعلان من الإدارة:\n\n';
    const msg = header + t;
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await ctx.telegram.sendMessage(id, msg);
        ok += 1;
      } catch {
        fail += 1;
      }
    }

    await createAnnouncement({ message: t, target });
    return ctx.reply(
      `تم إرسال الإعلان.\n\nالمستهدف: ${target}\nتم الإرسال: ${ok}\nفشل: ${fail}`,
      adminPanelKeyboard()
    );
  }
  return null;
}

module.exports = {
  registerAdmin,
  isAdmin,
  replyAdminPanel,
  handleAdminText,
  adminPanelKeyboard,
  adminStudentPickKeyboard,
  handleAdminDocument,
  handleAdminPhoto,
};
