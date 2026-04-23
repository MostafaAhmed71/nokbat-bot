-- أمثلة لإدخال بيانات بعد إنشاء الجداول (عدّل القيم ثم نفّذ من SQL Editor في Supabase)
-- أسماء الأيام في schedule يجب أن تطابق ما يستخدمه البوت: السبت، الأحد، الاثنين، الثلاثاء، الأربعاء، الخميس، الجمعة

-- ========== معلمون (telegram_id = رقم معرف تيليجرام، أرقام فقط كنص) ==========
insert into public.teachers (name, subject, telegram_id) values
  ('أحمد محمد', 'رياضيات', '123456789'),
  ('فاطمة علي', 'علوم', '987654321')
on conflict (telegram_id) do nothing;

-- ========== طلاب ==========
insert into public.students (name, national_id, grade, class, committee_number, committee_location) values
  ('خالد عبدالله السعيد', '1xxxxxxxx', 'الأول المتوسط', 'أ', '12', 'قاعة A'),
  ('نورة سالم', '2xxxxxxxx', 'الثاني الثانوي', 'ب', '5', 'المختبر');

-- ========== جدول (ربط teacher_id بمعرف المعلم من الجدول) ==========
-- الطريقة 1: استخدام الاسم لجلب id تلقائياً
insert into public.schedule (teacher_id, day, period, grade, class)
select t.id, 'الأحد', 'الأولى', 'الأول المتوسط', 'أ'
from public.teachers t
where t.telegram_id = '123456789';

insert into public.schedule (teacher_id, day, period, grade, class)
select t.id, 'الأحد', 'الثانية', 'الأول المتوسط', 'ب'
from public.teachers t
where t.telegram_id = '123456789';
