-- Fix: Supabase upsert(onConflict: 'national_id') يحتاج UNIQUE constraint/index غير جزئي
-- نفّذ هذا الملف مرة واحدة من SQL Editor في Supabase.

-- 1) حوّل القيم الفارغة إلى NULL لتفادي تعارض "unique"
update public.students
set national_id = null
where national_id is not null and btrim(national_id) = '';

-- 2) احذف الـ partial unique index إن كان موجوداً
drop index if exists public.students_national_id_unique;

-- 3) أنشئ unique index عادي (يسمح بتعدد NULL تلقائياً)
create unique index if not exists students_national_id_unique
  on public.students (national_id);

