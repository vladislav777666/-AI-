-- 0004_admin_reference_books.sql
-- Веб-панель администратора (ТЗ §2): справочник материалов, детализация
-- участков, сотрудников и шифров неисправности.
-- Выполнить в Supabase → SQL Editor после 0003_worker_cabinet.sql.

begin;

-- ============================================================
-- 1. Материалы и запчасти (ТЗ §2.2)
--    Карточка: название, количество, привязка к участку.
-- ============================================================
create table if not exists public.materials (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  qty        numeric(12, 2) not null default 0,
  unit       text not null default 'шт',
  area_id    uuid references public.areas (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists materials_area_idx on public.materials (area_id);

alter table public.materials enable row level security;

drop policy if exists "materials: read all" on public.materials;
create policy "materials: read all" on public.materials for select
  to authenticated using (true);

drop policy if exists "materials: master write" on public.materials;
create policy "materials: master write" on public.materials for all
  to authenticated using (public.is_master()) with check (public.is_master());

-- ============================================================
-- 2. Участки (ТЗ §2.1): закреплённое оборудование, сотрудники, материалы.
--    Оборудование связано через equipment.area_id, материалы — через
--    materials.area_id; для сотрудников добавляем привязку.
-- ============================================================
alter table public.workers add column if not exists area_id
  uuid references public.areas (id) on delete set null;

-- ============================================================
-- 3. Сотрудники (ТЗ §2.4): специальность «и разряд», бригада.
--    Сотрудник добавляется администратором и до регистрации аккаунта,
--    поэтому user_id становится необязательным (в триггере 0002 строки
--    создаются и при регистрации — оба пути совместимы).
-- ============================================================
alter table public.workers alter column user_id drop not null;
alter table public.workers add column if not exists rank    text;
alter table public.workers add column if not exists brigade text;

-- ============================================================
-- 4. Шифры неисправности (ТЗ §2.5): норматив времени,
--    материальный норматив, статус «Плановый\Неплановый».
-- ============================================================
alter table public.fault_codes add column if not exists norm_hours    numeric(5, 1);
alter table public.fault_codes add column if not exists material_norm text;
alter table public.fault_codes add column if not exists work_type     text
  constraint fault_codes_work_type_check check (work_type in ('planned', 'unplanned'));

-- В 0003 для шифров было только право чтения — добавляем право редактирования.
drop policy if exists "fault_codes: master write" on public.fault_codes;
create policy "fault_codes: master write" on public.fault_codes for all
  to authenticated using (public.is_master()) with check (public.is_master());

commit;

-- После применения: справочники «Справочники → Материалы / Участки /
-- Сотрудники / Шифры» наполняются через веб-панель администратора.
-- Права: читают все авторизованные, изменяет только Master.
