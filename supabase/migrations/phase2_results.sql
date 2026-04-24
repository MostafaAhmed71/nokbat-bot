-- Phase 2: نتائج الطلاب (بدون Supabase Storage)
-- الهدف: حفظ رابط صورة النتيجة داخل students وربطها برقم الهوية.
--
-- نفّذ هذا الملف من Supabase SQL Editor مرة واحدة.

alter table public.students
  add column if not exists result_image_url text,
  add column if not exists result_updated_at timestamptz;

-- منع تكرار رقم الهوية (يسهّل upsert عند الاستيراد)
-- ملاحظة: UNIQUE يسمح بتعدد NULL تلقائياً.
create unique index if not exists students_national_id_unique
  on public.students (national_id);

