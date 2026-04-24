-- Phase 3: مكتبة المنهج والمراجعات (Content Library)
-- الهدف: حفظ ملفات المنهج/المراجعات على السيرفر، وتخزين ميتاداتا + نص مجزّأ للبحث في Supabase.
-- نفّذ هذا الملف من Supabase SQL Editor مرة واحدة.

create extension if not exists "uuid-ossp";

create table if not exists public.content_items (
  id uuid primary key default uuid_generate_v4(),
  kind text not null default 'review', -- review | curriculum | other
  grade text not null, -- مثال: "ثاني متوسط"
  subject_key text not null, -- مثال: "math"
  title text not null,
  file_path text not null, -- مسار على السيرفر (داخل FILES_ROOT)
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

