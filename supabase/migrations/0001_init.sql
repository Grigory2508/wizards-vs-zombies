-- Волшебники против Зомби: схема базы.
-- Выполнить один раз в Supabase: Dashboard → SQL Editor → вставить весь файл → Run.
-- Повторный запуск безопасен (if not exists / or replace).
--
-- Игрок хранится одним JSON-документом (state) с номером версии: сервер сохраняет его,
-- только если версия не изменилась (оптимистичная блокировка), иначе перечитывает и повторяет.
-- Вся логика — в src/core (та же, что на клиенте), база только хранит.

create table if not exists public.players (
  tg_id       bigint      primary key,
  state       jsonb       not null,
  version     integer     not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Бой: задания с правильными ответами живут только здесь, клиент присылает лишь свои ответы
create table if not exists public.battles (
  id          bigserial   primary key,
  tg_id       bigint      not null,
  data        jsonb       not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  result      jsonb
);
create index if not exists battles_open_idx on public.battles (tg_id) where finished_at is null;
create index if not exists battles_started_idx on public.battles (started_at);

-- Настройки сложности (редактируются админ-ботом); отсутствующий ключ = значение по умолчанию из кода
create table if not exists public.config (
  key   text  primary key,
  value jsonb not null
);

create table if not exists public.config_log (
  id          bigserial   primary key,
  admin_id    bigint,
  admin_name  text,
  key         text        not null,
  before      jsonb,
  after       jsonb,
  note        text        not null default '',
  at          timestamptz not null default now()
);

create table if not exists public.answer_stats (
  topic     text    not null,
  tier      integer not null,
  total     bigint  not null default 0,
  correct   bigint  not null default 0,
  total_ms  bigint  not null default 0,
  primary key (topic, tier)
);

-- ---------- Функции ----------

-- Атомарно помечает бой завершённым и отдаёт его данные: один отчёт нельзя засчитать дважды.
create or replace function public.claim_battle(p_id bigint, p_tg bigint)
returns jsonb language plpgsql as $$
declare d jsonb;
begin
  update public.battles set finished_at = now()
    where id = p_id and tg_id = p_tg and finished_at is null
    returning data into d;
  if d is not null then return jsonb_build_object('status', 'ok', 'data', d); end if;
  if exists (select 1 from public.battles where id = p_id and tg_id = p_tg) then
    return jsonb_build_object('status', 'finished');
  end if;
  return jsonb_build_object('status', 'missing');
end $$;

-- Прибавляет статистику ответов: [{topic, tier, total, correct, ms}]
create or replace function public.add_answer_stats(p_rows jsonb)
returns void language sql as $$
  insert into public.answer_stats as s (topic, tier, total, correct, total_ms)
  select r.topic, r.tier, r.total, r.correct, r.ms
  from jsonb_to_recordset(p_rows) as r(topic text, tier integer, total bigint, correct bigint, ms bigint)
  on conflict (topic, tier) do update
    set total = s.total + excluded.total,
        correct = s.correct + excluded.correct,
        total_ms = s.total_ms + excluded.total_ms;
$$;

-- Сводка для админ-бота (/stats)
create or replace function public.admin_stats()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'players', (select jsonb_build_object(
        'n', count(*),
        'best', coalesce(max((state->>'bestWave')::int), 0),
        'lvl', coalesce(avg((state->>'level')::numeric), 0)::float8)
      from public.players),
    'active', (select jsonb_build_object('n', count(distinct tg_id))
      from public.battles where started_at > now() - interval '7 days'),
    'battles', (select jsonb_build_object(
        'n', count(*),
        'wins', count(*) filter (where (result->>'victory')::boolean))
      from public.battles where result is not null and jsonb_typeof(result) = 'object'),
    'answers', coalesce((select jsonb_agg(jsonb_build_object('topic', topic, 'tier', tier, 'total', total, 'correct', correct, 'total_ms', total_ms) order by topic, tier)
      from public.answer_stats), '[]'::jsonb),
    'grades', coalesce((select jsonb_agg(jsonb_build_object('grade', g, 'n', n) order by g nulls first)
      from (select (state->>'grade')::int as g, count(*) as n from public.players group by 1) t), '[]'::jsonb)
  );
$$;

-- ---------- Доступ ----------
-- Таблицы и функции доступны только серверным функциям (service role). RLS включён, политик для anon нет.
alter table public.players enable row level security;
alter table public.battles enable row level security;
alter table public.config enable row level security;
alter table public.config_log enable row level security;
alter table public.answer_stats enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.players, public.battles, public.config, public.config_log, public.answer_stats to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Функции по умолчанию может вызвать кто угодно — оставляем только серверу
revoke execute on function public.claim_battle(bigint, bigint), public.add_answer_stats(jsonb), public.admin_stats() from public, anon, authenticated;
grant execute on function public.claim_battle(bigint, bigint), public.add_answer_stats(jsonb), public.admin_stats() to service_role;
