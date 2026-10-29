const { Markup } = require('telegraf');
const {
  listUploadedMaterialsPlatform,
  listElectronicTestsPlatform,
  getParentByTelegramId,
} = require('../services/supabase');
const { gradeKeyToPlatform, arabicGradeLabelToPlatform } = require('../utils/platformGrade');
const { groupMaterialsBySubject } = require('../utils/sortUploadedMaterials');
const { chunkUtf16 } = require('../utils/telegramFormat');
const { isAdmin } = require('./admin');
const { studentMainKeyboard, parentMainKeyboard, gradesKeyboard } = require('./student');

const HEAR_STUDENT_PLATFORM = '🌐 محتوى المنصة التعليمية';
const HEAR_PARENT_PLATFORM = '🌐 محتوى المنصة (ابني)';

function getPlatformBaseUrl() {
  const raw = (
    process.env.PLATFORM_PUBLIC_URL ||
    process.env.BASE_PUBLIC_URL ||
    ''
  ).trim();
  return raw.replace(/\/+$/, '');
}

async function guardStudentOrParent(ctx, getTeacherByTelegramId) {
  if (isAdmin(ctx)) return { block: true, msg: 'هذا الخيار للطلاب وأولياء الأمور.' };
  const { data: teacher } = await getTeacherByTelegramId(ctx.from.id);
  if (teacher) return { block: true, msg: 'هذا الخيار للطلاب وأولياء الأمور.' };
  return {};
}

/**
 * Resolve stage + numeric grade + reply keyboard (parent telegram row checked first).
 */
async function resolvePlatformIdentity(ctx) {
  const { data: parent } = await getParentByTelegramId(ctx.from.id);
  if (parent?.students) {
    const st = parent.students;
    const pg = arabicGradeLabelToPlatform(st.grade);
    if (!pg) {
      return {
        error: `تعذر مطابقة صف الطالب («${String(st.grade || '')}») مع المنصّة.`,
        replyKb: parentMainKeyboard(),
      };
    }
    return { ...pg, replyKb: parentMainKeyboard(), isParent: true };
  }

  const gradeKey = ctx.session?.student?.gradeKey;
  const pg = gradeKeyToPlatform(gradeKey);
  if (pg) return { ...pg, replyKb: studentMainKeyboard(), isParent: false };
  return { needGrade: true, replyKb: studentMainKeyboard() };
}

function platformTypeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📅 جدول من المنصة', 'plat:schedule')],
    [
      Markup.button.callback('✅ محلولة', 'plat:solved'),
      Markup.button.callback('📋 غير محلولة', 'plat:unsolved'),
    ],
    [Markup.button.callback('▶️ فيديوهات', 'plat:videos')],
    [Markup.button.callback('💻 اختبارات إلكترونية', 'plat:etext')],
  ]);
}

/** @param {object} row @param {number} idx */
function fmtMaterialCaption(row, idx) {
  const title =
    row.video_title ||
    row.quiz_title ||
    row.file_name ||
    `محتوى ${idx + 1}`;
  const lines = [`${idx + 1}. ${title}`];
  if (row.subject_name) lines.push(`   📖 ${row.subject_name}`);
  const url = String(row.file_url || row.quiz_url || '').trim();
  if (url) lines.push(`   🔗 ${url}`);
  return lines.join('\n');
}

function isProbablyImageUrl(u) {
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(String(u || ''));
}

async function replyGroupedMaterials(ctx, rows, heading, replyKb) {
  if (!rows.length) {
    return ctx.reply(
      `${heading}\n\nلا يوجد محتوى لهذا الصف على المنصّة حتى الآن.`,
      replyKb
    );
  }
  let body = `${heading}\n\n`;
  let idx = 0;
  const groups = groupMaterialsBySubject(rows);
  for (const [subj, items] of groups) {
    body += `━━━━━━━━\n📚 ${subj}\n`;
    for (const r of items) {
      body += `${fmtMaterialCaption(r, idx)}\n\n`;
      idx += 1;
    }
  }
  for (const part of chunkUtf16(body.trim())) {
    await ctx.reply(part.slice(0, 3900));
  }
  return ctx.reply('استخدم الأزرار أدناه للقائمة الرئيسية.', replyKb);
}

/**
 * Sends schedule uploads: photo for image URLs; otherwise plain message with link.
 */
async function sendScheduleFromPlatform(ctx, rows, replyKb) {
  if (!rows.length) {
    return ctx.reply(
      '📅 جداول من المنصّة:\n\nلا توجد ملفات لهذا الصف حالياً.',
      replyKb
    );
  }

  await ctx.reply('📅 جداول من المنصّة (رفع الإدارة):');

  let sentCount = 0;
  const maxItems = 25;
  const groups = groupMaterialsBySubject(rows);

  for (const [, items] of groups) {
    for (const r of items) {
      if (sentCount >= maxItems) {
        await ctx.reply(
          'تم الوصول للحد المعروض؛ لبقيّة الجداول ادخل المنصّة من المتصفّح.',
          replyKb
        );
        return;
      }
      const url = String(r.file_url || '').trim();
      if (!url) continue;

      const cap =
        `${r.subject_name ? `📖 ${r.subject_name}\n` : ''}${r.file_name ? r.file_name : 'جدول'}`.trim();

      if (isProbablyImageUrl(url)) {
        try {
          await ctx.replyWithPhoto(
            { url },
            { caption: cap.slice(0, 1024) }
          );
        } catch {
          await ctx.reply(`${cap}\n🔗 ${url}`.slice(0, 3900));
        }
      } else {
        await ctx.reply(`${cap}\n🔗 ${url}`.slice(0, 3900));
      }
      sentCount += 1;
    }
  }

  await ctx.reply(
    'ملاحظة: جدول الامتحانات النصّي الآلي أيضاً موجود من زر «📅 جدول الامتحانات».',
    replyKb
  );
}

async function sendElectronicTestsFromPlatform(ctx, stage, gradeNum, replyKb) {
  const base = getPlatformBaseUrl();
  if (!base) {
    return ctx.reply(
      'لم يُعرّف رابط المنصّة في الإعدادات (PLATFORM_PUBLIC_URL أو BASE_PUBLIC_URL).',
      replyKb
    );
  }

  const { data: rows, error } = await listElectronicTestsPlatform(stage, gradeNum);
  if (error) return ctx.reply('تعذر جلب الاختبارات الآن.', replyKb);
  if (!rows.length) {
    return ctx.reply(
      'لا توجد اختبارات إلكترونية مفعّلة لهذا الصف على المنصّة.',
      replyKb
    );
  }

  await ctx.reply(
    '💻 افتح كل اختبار في المتصفّح لإتمام الإجابة والتقييم:',
    replyKb
  );

  for (const t of rows) {
    const rawTok = String(t.share_token || '').trim();
    if (!rawTok) continue;
    const href = `${base}/#test/${rawTok}`;
    const title = `${t.subject_name ? `${t.subject_name}: ` : ''}${t.test_title || 'اختبار'}`.slice(
      0,
      120
    );
    const desc = (t.test_description || '').trim().slice(0, 300);
    const text = `${title}${desc ? `\n\n${desc}` : ''}\n\n📎 افتح الرابط من الزر أسفله.`;

    await ctx.reply(
      text.slice(0, 3900),
      Markup.inlineKeyboard([
        [
          Markup.button.url(`فتح: ${title.slice(0, 28)}`, href),
        ],
      ])
    );
  }

  return ctx.reply('انتهت القائمة.', replyKb);
}

function registerPlatformContent(bot, { getTeacherByTelegramId }) {
  bot.hears(HEAR_STUDENT_PLATFORM, async (ctx) => {
    const g = await guardStudentOrParent(ctx, getTeacherByTelegramId);
    if (g.block) return ctx.reply(g.msg);
    const identity = await resolvePlatformIdentity(ctx);
    if (identity.error) {
      return ctx.reply(identity.error, identity.replyKb);
    }
    if (identity.needGrade) {
      ctx.session.awaiting = 'student_pick_grade';
      return ctx.reply(
        'اختر صفّك الدراسي أولاً لمشاهدة محتوى المنصّة:',
        gradesKeyboard('grade:set')
      );
    }
    ctx.session.awaiting = null;
    return ctx.reply(
      '🌐 محتوى المنصّة التعليمية — اختر نوع المحتوى:',
      platformTypeKeyboard()
    );
  });

  bot.hears(HEAR_PARENT_PLATFORM, async (ctx) => {
    const g = await guardStudentOrParent(ctx, getTeacherByTelegramId);
    if (g.block) return ctx.reply(g.msg);

    const { data: parent } = await getParentByTelegramId(ctx.from.id);
    if (!parent?.students) {
      return ctx.reply(
        'لم يتم ربطك بطالب بعد. افتح /start واختر «ولي أمر».',
        parentMainKeyboard()
      );
    }

    const identity = await resolvePlatformIdentity(ctx);
    if (identity.error) return ctx.reply(identity.error, identity.replyKb);

    return ctx.reply(
      '🌐 محتوى المنصّة لابنك — اختر النوع:',
      platformTypeKeyboard()
    );
  });

  bot.action(/^plat:(schedule|solved|unsolved|videos|etext)$/, async (ctx) => {
    const g = await guardStudentOrParent(ctx, getTeacherByTelegramId);
    if (g.block) {
      await ctx.answerCbQuery('غير مصرح');
      return;
    }
    await ctx.answerCbQuery();

    const kind = ctx.match[1];
    const identity = await resolvePlatformIdentity(ctx);
    if (identity.error) {
      return ctx.reply(identity.error, identity.replyKb);
    }
    if (identity.needGrade && !identity.isParent) {
      return ctx.reply(
        'اختر الصف من «⚙️ الإعدادات» ثم عد إلى هذه القائمة.',
        gradesKeyboard('grade:set')
      );
    }

    const { stage, gradeNum, replyKb } = identity;

    if (kind === 'etext') {
      return sendElectronicTestsFromPlatform(ctx, stage, gradeNum, replyKb);
    }

    /** @type {'schedule' | 'solved' | 'unsolved' | 'videos'} */
    const contentType = kind === 'schedule' ? 'schedule' : kind;

    const { data: rowsRaw, error } = await listUploadedMaterialsPlatform(
      stage,
      gradeNum,
      contentType
    );
    if (error) return ctx.reply('تعذر جلب المحتوى من المنصّة الآن.', replyKb);

    if (kind === 'schedule') {
      await sendScheduleFromPlatform(ctx, rowsRaw || [], replyKb);
      return undefined;
    }

    const headings = {
      solved: '✅ مراجعات محلولة من المنصّة',
      unsolved: '📋 مراجعات غير محلولة من المنصّة',
      videos: '▶️ فيديوهات من المنصّة',
    };
    await replyGroupedMaterials(ctx, rowsRaw || [], headings[kind], replyKb);
    return undefined;
  });
}

module.exports = {
  registerPlatformContent,
  HEAR_STUDENT_PLATFORM,
  HEAR_PARENT_PLATFORM,
};
