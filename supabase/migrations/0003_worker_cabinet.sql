-- 0003_worker_cabinet.sql
-- Кабинет Исполнителя: статусы REJECTED/REWORK, причины, справочник шифров,
-- уведомления, чек-лист приёмки, материалы-позиции, защита переходов (сервер).
-- Выполнить в Supabase → SQL Editor после 0002_master_module.sql.

begin;

-- ---------- 1. Новые статусы ----------
alter table public.work_orders drop constraint if exists work_orders_status_check;
alter table public.work_orders add constraint work_orders_status_check
  check (status in ('issued', 'accepted', 'in_work', 'queued', 'completed',
                    'cancelled', 'suspended', 'closed', 'rejected', 'rework'));

alter table public.work_orders add column if not exists pause_reason  text;
alter table public.work_orders add column if not exists reject_reason text;
alter table public.work_orders add column if not exists paused_at     timestamptz;
alter table public.work_orders add column if not exists materials_list jsonb not null default '[]'::jsonb;
alter table public.work_orders add column if not exists worker_comment text;

-- ---------- 2. Аудит: тип события и причина ----------
alter table public.work_order_history add column if not exists event_type text;
alter table public.work_order_history add column if not exists reason     text;

-- ---------- 3. Чек-лист приёмки в acceptance ----------
alter table public.work_order_acceptance add column if not exists checklist jsonb;

-- ---------- 4. Справочник шифров неисправностей ----------
create table if not exists public.fault_codes (
  code        text primary key,
  name        text not null,
  description text not null default '',
  active      boolean not null default true,
  sort_order  int not null default 0
);

alter table public.fault_codes enable row level security;
create policy "fault_codes: read all" on public.fault_codes for select
  to authenticated using (true);

insert into public.fault_codes (code, name, description, sort_order) values
  ('М-01', 'Механика: износ подшипника', 'Замена/ремонт подшипниковых узлов', 10),
  ('М-02', 'Механика: люфт вала', 'Устранение люфтов и перекосов валов', 20),
  ('М-03', 'Механика: вибрация', 'Балансировка, крепёж, демпфирование', 30),
  ('М-04', 'Механика: деформация корпуса', 'Трещины, сколы, правка корпусных деталей', 40),
  ('Э-01', 'Электрика: обрыв цепи', 'Поиск и устранение обрывов', 50),
  ('Э-02', 'Электрика: КЗ/замыкание', 'Изоляция, замена проводки', 60),
  ('Э-03', 'Электрика: двигатель', 'Ремонт/замена электродвигателя', 70),
  ('Э-04', 'Электрика: датчики/АСУ', 'Неисправности датчиков и автоматики', 80),
  ('Г-01', 'Гидравлика: утечка', 'Течь по соединениям и уплотнениям', 90),
  ('Г-02', 'Гидравлика: насос', 'Ремонт/замена насосного узла', 100),
  ('Г-03', 'Гидравлика: давление', 'Настройка редукторов, клапанов', 110),
  ('П-01', 'Пневматика: утечка воздуха', 'Течь пневмосоединений', 120),
  ('П-02', 'Пневматика: клапан/цилиндр', 'Замена пневмоэлементов', 130),
  ('С-01', 'Смазка: недостаток смазки', 'Восстановление подачи смазки', 140),
  ('С-02', 'Смазка: загрязнение масла', 'Замена масла, промывка', 150)
on conflict (code) do nothing;

-- ---------- 5. Уведомления ----------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  work_order_id uuid references public.work_orders (id) on delete set null,
  type         text not null,
  title        text not null,
  message      text not null,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
create policy "notifications: read own" on public.notifications for select
  to authenticated using (user_id = auth.uid());
create policy "notifications: insert" on public.notifications for insert
  to authenticated with check (true);
create policy "notifications: mark read" on public.notifications for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- 6. Серверная защита переходов статуса (ТЗ §54) ----------
create or replace function public.work_orders_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if not (
      (old.status = 'issued'    and new.status in ('accepted', 'queued', 'rejected')) or
      (old.status = 'accepted'  and new.status in ('in_work', 'queued', 'rejected')) or
      (old.status = 'queued'    and new.status in ('in_work', 'rejected')) or
      (old.status = 'in_work'   and new.status in ('suspended', 'completed', 'cancelled')) or
      (old.status = 'suspended' and new.status in ('in_work', 'cancelled')) or
      (old.status = 'completed' and new.status in ('closed', 'rework')) or
      (old.status = 'rework'    and new.status in ('in_work', 'completed', 'cancelled')) or
      (old.status = 'rejected'  and new.status in ('issued', 'cancelled')) or
      (old.status = 'cancelled' and false)
    ) then
      raise exception 'INVALID_TRANSITION: % -> %', old.status, new.status
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists work_orders_guard_trg on public.work_orders;
create trigger work_orders_guard_trg
  before update of status on public.work_orders
  for each row execute function public.work_orders_guard();

-- ---------- 7. Триггер истории: пересоздаём с event_type и причиной ----------
drop trigger if exists work_orders_history_trg on public.work_orders;

create or replace function public.work_orders_history_trg_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_reason text;
begin
  select coalesce(nullif(full_name, ''), role::text) into v_actor
  from public.profiles where id = auth.uid();
  v_actor := coalesce(v_actor, 'Система');
  v_reason := coalesce(new.reject_reason, new.pause_reason);

  if (tg_op = 'INSERT') then
    insert into public.work_order_history
      (order_id, actor_id, actor_name, action, changes, event_type, reason)
    values (new.id, auth.uid(), v_actor, 'Наряд выдан',
            jsonb_build_array(jsonb_build_object('field','status','from',null,'to',new.status)),
            'ASSIGNED', null);
  elsif (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    insert into public.work_order_history
      (order_id, actor_id, actor_name, action, changes, event_type, reason)
    values (new.id, auth.uid(), v_actor,
            case new.status
              when 'suspended' then 'Приостановлен: ' || coalesce(v_reason, 'причина не указана')
              when 'rejected'  then 'Отклонён: ' || coalesce(v_reason, 'причина не указана')
              when 'rework'    then 'Возвращён на доработку'
              else 'Статус наряда'
            end,
            jsonb_build_array(jsonb_build_object('field','status','from',old.status,'to',new.status)),
            upper(new.status),
            v_reason);
  end if;
  return null;
end;
$$;

create trigger work_orders_history_trg
  after insert or update of status on public.work_orders
  for each row execute function public.work_orders_history_trg_fn();

commit;

-- После применения: разрешённые переходы (ТЗ §5):
-- issued → accepted|queued|rejected; accepted → in_work|queued|rejected;
-- queued → in_work|rejected; in_work → suspended|completed|cancelled;
-- suspended → in_work|cancelled; completed → closed|rework;
-- rework → in_work|completed|cancelled; rejected → issued|cancelled (переназначение).
