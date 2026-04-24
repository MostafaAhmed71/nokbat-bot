const { normalizeNationalId } = require('../utils/nationalId');
const { getStudentByNationalId } = require('../services/supabase');

async function promptForNationalId(ctx) {
  ctx.session.awaiting = 'student_result';
  return ctx.reply('اكتب رقم الهوية/الإقامة لمعرفة نتيجتك.');
}

async function handleNationalIdText(ctx, text) {
  try {
    const nid = normalizeNationalId(text);
    if (!nid) {
      return ctx.reply('رقم غير صالح. اكتب رقم الهوية فقط.');
    }

    const { data: student, error } = await getStudentByNationalId(nid);
    if (error) {
      return ctx.reply('تعذر جلب النتيجة حالياً. حاول لاحقاً.');
    }
    if (!student) {
      return ctx.reply(
        'رقم الهوية غير موجود. تأكد من الرقم أو تواصل مع الإدارة.'
      );
    }
    if (!student.result_image_url) {
      return ctx.reply('لا توجد نتيجة مرفوعة لك حتى الآن. راجع الإدارة لاحقاً.');
    }

    ctx.session.awaiting = null;
    try {
      await ctx.replyWithPhoto({ url: student.result_image_url });
    } catch (e) {
      // في حال فشل جلب الصورة من الرابط (TLS/SSL أو رابط غير متاح)
      return ctx.reply(
        'تم العثور على نتيجتك لكن تعذر إرسال الصورة من الرابط.\n\n' +
          'جرّب فتح الرابط مباشرة:\n' +
          `${student.result_image_url}\n\n` +
          'إذا استمرّت المشكلة، تواصل مع الإدارة.'
      );
    }
    return ctx.reply(`الاسم: ${student.name}`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('result lookup error', e);
    return ctx.reply('حدث خطأ غير متوقع. حاول لاحقاً.');
  }
}

module.exports = { promptForNationalId, handleNationalIdText };

