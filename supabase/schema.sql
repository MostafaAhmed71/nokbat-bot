-- تشغيل مرة واحدة من SQL Editor في Supabase
-- للبوت على VPS يُفضّل وضع SUPABASE_SERVICE_ROLE_KEY في .env (لا ترفعه لأي مستودع)

create extension if not exists "uuid-ossp";

create table if not exists public.students (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  national_id text,
  grade text,
  class text,
  committee_number text,
  committee_location text,
  created_at timestamptz default now()
);

create table if not exists public.teachers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  subject text,
  telegram_id text unique,
  created_at timestamptz default now()
);

create table if not exists public.schedule (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references public.teachers (id) on delete cascade,
  day text not null,
  period text not null,
  grade text,
  class text
);

create table if not exists public.results (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students (id) on delete cascade,
  subject text,
  score numeric,
  total numeric,
  semester text,
  created_at timestamptz default now()
);

create index if not exists idx_schedule_teacher_day on public.schedule (teacher_id, day);
