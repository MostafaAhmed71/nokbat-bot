const { Markup } = require('telegraf');
const {
  listStudentsPage,
  listTeachers,
  searchStudentsByName,
  searchTeachersByName,
  getFullScheduleForTeacher,
} = require('../services/supabase');
const { formatStudentCommittee, studentPickKeyboard } = require('./student');

function isAdmin(ctx) {
  const admin = process.env.ADMIN_TELEGRAM_ID;
  if (admin == null || admin === '') return false;
  return String(ctx.from.id) === String(admin);
}

function adminPanelKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('قائمة الطلاب', 'adm:stu:0')],
    [Markup.button.callback('جداول المعلمين', 'adm:sch:menu')],
    [Markup.button.callback('بحث عن طالب (لجنة)', 'adm:find:stu')],
    [Markup.button.callback('بحث عن معلم', 'adm:find:tch')],
  ]);
}

function chunkText(s, max = 3800) {
  const parts = [];
  let rest = s;
  while (rest.length) {
    parts.push(rest.slice(0, max));
    rest = rest.slice(max);
  }
  return parts;
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
  return ctx.reply('لوحة تحكم المدير — اختر:', adminPanelKeyboard());
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
}

async function handleAdminText(ctx) {
  const t = (ctx.message.text || '').trim();
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
  return null;
}

module.exports = {
  registerAdmin,
  isAdmin,
  replyAdminPanel,
  handleAdminText,
  adminPanelKeyboard,
};
