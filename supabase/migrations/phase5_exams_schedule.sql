-- Phase 5: جدول الامتحانات
-- نفّذ هذا الملف من Supabase SQL Editor مرة واحدة.

create table if not exists public.exams_schedule (
  id uuid primary key default uuid_generate_v4(),
  grade text not null,
  subject text not null,
  exam_date date not null,
  exam_time text,
  created_at timestamptz default now()
);

create unique index if not exists exams_schedule_unique
  on public.exams_schedule (grade, subject, exam_date);

create index if not exists idx_exams_schedule_grade_date
  on public.exams_schedule (grade, exam_date);

