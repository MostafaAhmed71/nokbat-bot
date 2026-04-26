-- Phase 4: تسجيل الطالب وولي الأمر
-- الهدف: ربط حساب تيليجرام بالطالب عبر students.telegram_id + جدول parents
-- نفّذ هذا الملف من Supabase SQL Editor مرة واحدة.

alter table public.students
  add column if not exists telegram_id text;

create index if not exists idx_students_telegram_id
  on public.students (telegram_id);

create table if not exists public.parents (
  id uuid primary key default uuid_generate_v4(),
  telegram_id text not null unique,
  student_id uuid references public.students (id) on delete cascade,
  created_at timestamptz default now()
);

