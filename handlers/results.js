const { normalizeNationalId } = require('../utils/nationalId');
const { getStudentByNationalId } = require('../services/supabase');

async function promptForNationalId(ctx) {
  ctx.session.awaiting = 'student_result';
  return ctx.reply('اكتب رقم الهوية/الإقامة لمعرفة نتيجتك.');
}

async function handleNationalIdText(ctx, text) {
  const nid = normalizeNationalId(text);
  if (!nid) {
    return ctx.reply('رقم غير صالح. اكتب رقم الهوية فقط.');
  }

  const { data: student, error } = await getStudentByNationalId(nid);
  if (error) {
    return ctx.reply('تعذر جلب النتيجة حالياً. حاول لاحقاً.');
  }
  if (!student) {
    return ctx.reply('رقم الهوية غير موجود. تأكد من الرقم أو تواصل مع الإدارة.');
  }
  if (!student.result_image_url) {
    return ctx.reply('لا توجد نتيجة مرفوعة لك حتى الآن. راجع الإدارة لاحقاً.');
  }

  ctx.session.awaiting = null;
  await ctx.replyWithPhoto({ url: student.result_image_url });
  return ctx.reply(`الاسم: ${student.name}`);
}

module.exports = { promptForNationalId, handleNationalIdText };

