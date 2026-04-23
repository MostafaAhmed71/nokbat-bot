-- نفّذ هذا الملف مرة واحدة من SQL Editor في Supabase لتحسين البحث عن الأسماء العربية
-- (أ/إ/آ/ٱ، ى/ي، ة/ه، إزالة التشكيل، إلخ)

create or replace function public.arabic_search_key(src text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                lower(trim(coalesce(src, ''))),
                '[\u064B-\u065F\u0670\u0640\u06DF]',
                '',
                'g'
              ),
              '[أإآٱ]',
              'ا',
              'g'
            ),
            'ى',
            'ي',
            'g'
          ),
          'ة',
          'ه',
          'g'
        ),
        'ؤ',
        'و',
        'g'
      ),
      'ئ',
      'ي',
      'g'
    ),
    '\s+',
    ' ',
    'g'
  );
$$;

create or replace function public.search_students_by_name(q text)
returns setof public.students
language sql
stable
as $$
  select s.*
  from public.students s
  where length(trim(coalesce(q, ''))) > 0
    and public.arabic_search_key(s.name) like '%' || public.arabic_search_key(q) || '%'
  order by s.grade nulls last, s.class nulls last, s.name
  limit 30;
$$;

create or replace function public.search_teachers_by_name(q text)
returns setof public.teachers
language sql
stable
as $$
  select t.*
  from public.teachers t
  where length(trim(coalesce(q, ''))) > 0
    and public.arabic_search_key(t.name) like '%' || public.arabic_search_key(q) || '%'
  order by t.name
  limit 20;
$$;

create index if not exists idx_students_arabic_name_key
  on public.students using btree (public.arabic_search_key(name));

create index if not exists idx_teachers_arabic_name_key
  on public.teachers using btree (public.arabic_search_key(name));

grant execute on function public.arabic_search_key(text) to anon, authenticated, service_role;
grant execute on function public.search_students_by_name(text) to anon, authenticated, service_role;
grant execute on function public.search_teachers_by_name(text) to anon, authenticated, service_role;
