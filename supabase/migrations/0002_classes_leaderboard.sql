-- Классы учителя и рейтинг игроков.
-- Выполнить в Supabase: Dashboard → SQL Editor → вставить весь файл → Run (после 0001_init.sql).
-- Повторный запуск безопасен.

-- Класс: настройки, задания учителя и их статистика — одним JSON-документом с версией
create table if not exists public.classes (
  code        text        primary key,
  owner       bigint      not null,
  data        jsonb       not null,
  version     integer     not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists classes_owner_idx on public.classes (owner);
create index if not exists players_class_idx on public.players ((state->>'classCode'));

-- Рейтинг: лучшая ночь, при равенстве — больше верных ответов.
-- p_period: 'week' (только эта неделя, p_week вида '2026-W47') или 'all'; p_class — только этот класс или null.
-- Номера Telegram наружу не отдаются: только имя, место и флаг «это я».
create or replace function public.leaderboard(p_period text, p_week text, p_class text, p_limit integer, p_me bigint)
returns jsonb language sql stable as $$
  with t as (
    select tg_id, state->>'name' as name,
      case when p_period = 'week' then coalesce((state->'week'->>'best')::int, 0) else coalesce((state->>'bestWave')::int, 0) end as best,
      case when p_period = 'week' then coalesce((state->'week'->>'correct')::int, 0) else coalesce((state->>'totalCorrect')::int, 0) end as correct
    from public.players
    where (p_period <> 'week' or state->'week'->>'id' = p_week)
      and (p_class is null or state->>'classCode' = p_class)
  ), r as (
    select t.*, row_number() over (order by best desc, correct desc, tg_id) as rank
    from t where best > 0 or correct > 0
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('rank', rank, 'name', name, 'best', best, 'correct', correct, 'me', tg_id = p_me) order by rank)
      from (select * from r order by rank limit p_limit) top), '[]'::jsonb),
    'me', (select jsonb_build_object('rank', rank, 'name', name, 'best', best, 'correct', correct, 'me', true) from r where tg_id = p_me)
  );
$$;

-- Классы учителя с числом учеников
create or replace function public.teacher_classes(p_owner bigint)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'code', c.code, 'data', c.data,
      'students', (select count(*) from public.players p where p.state->>'classCode' = c.code))
    order by c.created_at), '[]'::jsonb)
  from public.classes c where c.owner = p_owner;
$$;

-- Ученики класса (для страницы учителя)
create or replace function public.class_students(p_code text)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('tgId', tg_id, 'state', state, 'updatedAt', updated_at)), '[]'::jsonb)
  from public.players where state->>'classCode' = p_code;
$$;

alter table public.classes enable row level security;
grant select, insert, update, delete on public.classes to service_role;

revoke execute on function public.leaderboard(text, text, text, integer, bigint), public.teacher_classes(bigint), public.class_students(text) from public, anon, authenticated;
grant execute on function public.leaderboard(text, text, text, integer, bigint), public.teacher_classes(bigint), public.class_students(text) to service_role;
