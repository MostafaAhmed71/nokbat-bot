-- Phase 6: الإعلانات
-- نفّذ هذا الملف من Supabase SQL Editor مرة واحدة.

create table if not exists public.announcements (
  id uuid primary key default uuid_generate_v4(),
  message text not null,
  target text not null, -- all | students | teachers | parents
  sent_at timestamptz default now()
);

create index if not exists idx_announcements_sent_at
  on public.announcements (sent_at desc);

