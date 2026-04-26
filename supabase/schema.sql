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
  result_image_url text,
  result_updated_at timestamptz,
  telegram_id text,
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

create unique index if not exists students_national_id_unique
  on public.students (national_id);

create index if not exists idx_students_telegram_id
  on public.students (telegram_id);

-- مكتبة المنهج والمراجعات
create table if not exists public.content_items (
  id uuid primary key default uuid_generate_v4(),
  kind text not null default 'review', -- review | curriculum | other
  grade text not null,
  subject_key text not null,
  title text not null,
  file_path text not null,
  mime text,
  source text not null default 'web', -- web | telegram
  uploaded_by_telegram_id text,
  created_at timestamptz default now()
);

create table if not exists public.content_chunks (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid references public.content_items (id) on delete cascade,
  chunk_order int not null,
  chunk_text text not null,
  created_at timestamptz default now()
);

create index if not exists idx_content_items_grade_subject
  on public.content_items (grade, subject_key);

create index if not exists idx_content_chunks_item_order
  on public.content_chunks (item_id, chunk_order);

-- أولياء الأمور
create table if not exists public.parents (
  id uuid primary key default uuid_generate_v4(),
  telegram_id text not null unique,
  student_id uuid references public.students (id) on delete cascade,
  created_at timestamptz default now()
);

-- جدول الامتحانات
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

-- الإعلانات
create table if not exists public.announcements (
  id uuid primary key default uuid_generate_v4(),
  message text not null,
  target text not null, -- all | students | teachers | parents
  sent_at timestamptz default now()
);

create index if not exists idx_announcements_sent_at
  on public.announcements (sent_at desc);

-- سجل محادثات AI
create table if not exists public.chat_history (
  id uuid primary key default uuid_generate_v4(),
  telegram_id text not null,
  question text not null,
  answer text not null,
  subject text,
  created_at timestamptz default now()
);

create index if not exists idx_chat_history_tg_created
  on public.chat_history (telegram_id, created_at desc);

-- المفضلة
create table if not exists public.favorites (
  id uuid primary key default uuid_generate_v4(),
  telegram_id text not null,
  question text not null,
  answer text not null,
  subject text,
  created_at timestamptz default now()
);

create index if not exists idx_favorites_tg_created
  on public.favorites (telegram_id, created_at desc);
