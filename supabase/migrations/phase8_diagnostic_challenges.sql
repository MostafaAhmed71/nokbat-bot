-- اختبار تشخيصي (10 أسئلة) + تحدي اليوم + إجابات + تقارير

create table if not exists public.diagnostic_tests (
  id uuid primary key default uuid_generate_v4(),
  telegram_id text not null,
  subject_key text not null,
  correct_count int not null default 0,
  total int not null default 10,
  weak_summary text,
  detail jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_diagnostic_tg_created
  on public.diagnostic_tests (telegram_id, created_at desc);

create table if not exists public.daily_challenges (
  id uuid primary key default uuid_generate_v4(),
  challenge_date date not null,
  subject_key text not null,
  question text not null,
  options jsonb not null,
  correct_index int not null,
  created_at timestamptz default now(),
  constraint daily_challenges_date_unique unique (challenge_date)
);

create table if not exists public.challenge_answers (
  id uuid primary key default uuid_generate_v4(),
  challenge_id uuid not null references public.daily_challenges (id) on delete cascade,
  telegram_id text not null,
  chosen_index int not null,
  is_correct boolean not null default false,
  response_ms int not null default 0,
  points int not null default 0,
  created_at timestamptz default now(),
  constraint challenge_answers_one_per_user unique (challenge_id, telegram_id)
);

create index if not exists idx_challenge_answers_challenge_points
  on public.challenge_answers (challenge_id, points desc);

create index if not exists idx_challenge_answers_telegram
  on public.challenge_answers (telegram_id);
