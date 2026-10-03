-- 0002_master_module.sql
-- Модуль «Мастер»: исполнители, участки, оборудование, наряды, история, приёмка.
-- Выполнить в Supabase → SQL Editor (после 0001_auth_by_role.sql).
--
-- Роли: две — Master / Worker (profiles.role). Первому зарегистрированному
-- пользователю автоматически назначается роль Master (bootstrap), остальным — Worker.
-- Вход — Supabase Auth (email/пароль), роль читается из profiles.

begin;

-- Полное имя в профиле (для отображения и истории).
alter table public.profiles add column if not exists full_name text;

-- ============================================================
-- Исполнители (Worker). Строка создаётся триггером при регистрации.
-- ============================================================
create table if not exists public.workers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users (id) on delete cascade,
  full_name  text not null default '',
  specialty  text not null default 'Слесарь',
  status     text not null default 'free'
             check (status in ('free', 'busy', 'queue', 'not_on_shift')),
  rating     numeric(3,1) not null default 4.0 check (rating >= 0 and rating <= 5),
  created_at timestamptz not null default now()
);

-- ============================================================
-- Участки и оборудование.
-- ============================================================
create table if not exists public.areas (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.equipment (
  id      uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas (id) on delete cascade,
  name    text not null,
  unique (area_id, name)
);

-- Справочные данные для старта (опционально, идемпотентно).
insert into public.areas (name)
values ('Участок №1'), ('Участок №2')
on conflict (name) do nothing;

insert into public.equipment (area_id, name)
select a.id, v.name
from (values
  ('Участок №1', 'Станок ЧПУ-1'),
  ('Участок №1', 'Пресс гидравлический'),
  ('Участок №2', 'Компрессор ВП-2'),
  ('Участок №2', 'Конвейер ленточный')
) as v(area_name, name)
join public.areas a on a.name = v.area_name
on conflict do nothing;

-- ============================================================
-- Наряды.
-- ============================================================
create table if not exists public.work_orders (
  id            uuid primary key default gen_random_uuid(),
  number        text not null unique,
  work_type     text not null check (work_type in ('planned', 'unplanned')),
  description   text not null,
  area_id       uuid not null references public.areas (id),
  equipment_id  uuid not null references public.equipment (id),
  worker_id     uuid references public.workers (id),
  deadline      timestamptz not null,
  priority      text not null
                check (priority in ('emergency', 'high', 'normal', 'planned')),
  status        text not null default 'issued'
                check (status in ('issued', 'accepted', 'in_work', 'queued',
                                  'completed', 'cancelled', 'suspended', 'closed')),
  fault_code    text,
  photos        jsonb not null default '[]'::jsonb,      -- фото неисправности (data URL), до 5
  comment       text,
  norm_hours    numeric(5,1),                             -- норматив, ч
  work_done     text,                                     -- описание выполненных работ (исполнитель)
  materials     text,                                     -- списанные материалы (исполнитель)
  photos_after  jsonb not null default '[]'::jsonb,       -- фото «после» (исполнитель), до 5
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  started_at    timestamptz,
  completed_at  timestamptz,
  closed_at     timestamptz
);

create index if not exists work_orders_status_idx on public.work_orders (status);
create index if not exists work_orders_worker_idx on public.work_orders (worker_id);

-- Автонумерация: Н-261003-0001.
create sequence if not exists public.work_order_number_seq start 1;

create or replace function public.work_orders_fill_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.number is null or new.number = '' then
    new.number := 'Н-' || to_char(now(), 'YYMMDD') || '-'
                  || lpad(nextval('work_order_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists work_orders_fill_number_trg on public.work_orders;
create trigger work_orders_fill_number_trg
  before insert on public.work_orders
  for each row execute function public.work_orders_fill_number();

-- ============================================================
-- История наряда.
-- ============================================================
create table if not exists public.work_order_history (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.work_orders (id) on delete cascade,
  actor_id   uuid references auth.users (id),
  actor_name text not null default 'Система',
  action     text not null,                -- «Наряд выдан», «Статус изменён», «Фото добавлено»…
  changes    jsonb not null default '[]'::jsonb, -- [{field, from, to}]
  created_at timestamptz not null default now()
);

create index if not exists work_order_history_order_idx
  on public.work_order_history (order_id, created_at desc);

-- Триггер: логирует выдачу и смены статуса наряда.
create or replace function public.work_orders_history_trg_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
begin
  select coalesce(nullif(full_name, ''), role::text) into v_actor
  from public.profiles where id = auth.uid();
  v_actor := coalesce(v_actor, 'Система');

  if (tg_op = 'INSERT') then
    insert into public.work_order_history (order_id, actor_id, actor_name, action, changes)
    values (new.id, auth.uid(), v_actor, 'Наряд выдан',
            jsonb_build_array(jsonb_build_object(
              'field', 'status', 'from', null, 'to', new.status)));
  elsif (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    insert into public.work_order_history (order_id, actor_id, actor_name, action, changes)
    values (new.id, auth.uid(), v_actor, 'Статус наряда',
            jsonb_build_array(jsonb_build_object(
              'field', 'status', 'from', old.status, 'to', new.status)));
  end if;
  return null;
end;
$$;

drop trigger if exists work_orders_history_trg on public.work_orders;
create trigger work_orders_history_trg
  after insert or update of status on public.work_orders
  for each row execute function public.work_orders_history_trg_fn();

-- ============================================================
-- Приёмка работ (вердикт ИИ + решение Мастера).
-- ============================================================
create table if not exists public.work_order_acceptance (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null unique references public.work_orders (id) on delete cascade,
  ai_score        int not null check (ai_score between 1 and 5),
  ai_comment      text not null default '',
  master_decision text not null
                  check (master_decision in ('accepted', 'with_remarks', 'rework')),
  agreed_with_ai  boolean not null default true,
  master_comment  text,
  decided_by      uuid references auth.users (id),
  created_at      timestamptz not null default now()
);

-- ============================================================
-- Помощники для RLS.
-- ============================================================
create or replace function public.is_master()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'Master')
$$;

create or replace function public.my_worker_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select w.id from public.workers w where w.user_id = auth.uid()
$$;

-- ============================================================
-- Автосоздание профиля при регистрации (bootstrap первого Мастера).
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      text;
  v_name      text;
  v_effective text;
  v_first     boolean;
begin
  v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'Worker');
  if v_role not in ('Master', 'Worker') then
    v_role := 'Worker';
  end if;

  select not exists (select 1 from public.profiles where role = 'Master') into v_first;
  v_effective := case when v_first then 'Master' else v_role end;

  v_name := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''),
                     split_part(new.email, '@', 1));

  insert into public.profiles (id, role, full_name)
  values (new.id, v_effective, v_name);

  if v_effective = 'Worker' then
    insert into public.workers (user_id, full_name)
    values (new.id, v_name)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RLS.
-- ============================================================
alter table public.workers  enable row level security;
alter table public.areas    enable row level security;
alter table public.equipment enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_history enable row level security;
alter table public.work_order_acceptance enable row level security;

-- workers
create policy "workers: read all" on public.workers for select
  to authenticated using (true);
create policy "workers: master write" on public.workers for all
  to authenticated using (public.is_master()) with check (public.is_master());
create policy "workers: self update" on public.workers for update
  to authenticated using (user_id = auth.uid());

-- areas / equipment
create policy "areas: read all" on public.areas for select
  to authenticated using (true);
create policy "areas: master write" on public.areas for all
  to authenticated using (public.is_master()) with check (public.is_master());

create policy "equipment: read all" on public.equipment for select
  to authenticated using (true);
create policy "equipment: master write" on public.equipment for all
  to authenticated using (public.is_master()) with check (public.is_master());

-- work_orders: мастер — всё, исполнитель — свои наряды.
create policy "work_orders: master all" on public.work_orders for all
  to authenticated using (public.is_master()) with check (public.is_master());
create policy "work_orders: worker read" on public.work_orders for select
  to authenticated using (worker_id = public.my_worker_id());
create policy "work_orders: worker update" on public.work_orders for update
  to authenticated
  using (worker_id = public.my_worker_id())
  with check (worker_id = public.my_worker_id());

-- history: мастер — ко всем; исполнитель — по своим нарядам.
create policy "history: master read" on public.work_order_history for select
  to authenticated using (public.is_master());
create policy "history: worker read" on public.work_order_history for select
  to authenticated using (
    exists (select 1 from public.work_orders o
            where o.id = order_id and o.worker_id = public.my_worker_id()));
create policy "history: insert" on public.work_order_history for insert
  to authenticated with check (
    public.is_master() or
    exists (select 1 from public.work_orders o
            where o.id = order_id and o.worker_id = public.my_worker_id()));

-- acceptance: читать как наряд; писать — мастер.
create policy "acceptance: master read" on public.work_order_acceptance for select
  to authenticated using (public.is_master());
create policy "acceptance: worker read" on public.work_order_acceptance for select
  to authenticated using (
    exists (select 1 from public.work_orders o
            where o.id = order_id and o.worker_id = public.my_worker_id()));
create policy "acceptance: master write" on public.work_order_acceptance for all
  to authenticated using (public.is_master()) with check (public.is_master());

commit;

-- После применения: сломанные демо-политики из 0001 не мешают.
-- Первый зарегистрированный пользователь станет Master автоматически.
