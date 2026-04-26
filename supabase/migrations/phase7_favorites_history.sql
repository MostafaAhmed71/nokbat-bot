-- Phase 7: المفضلة + سجل محادثات AI
-- نفّذ هذا الملف من Supabase SQL Editor مرة واحدة.

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

