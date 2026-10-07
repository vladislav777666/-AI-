-- 0008_head_admin_split.sql
-- «Веб-руководитель» и «Веб-администратор» — РАЗНЫЕ должности
-- (уточнение заказчика; отменяет решение 0006 «по правам равны»).
--
--   Head (Веб-руководитель)    — только чтение: аналитика панели
--                                руководителя и просмотр нарядов/истории/
--                                приёмки. Справочники §2 ему доступны
--                                на чтение (policy «read all» из 0002/0004),
--                                но не на изменение.
--   Admin (Веб-администратор)  — редактирует справочники §2 (участки,
--                                оборудование, сотрудники, материалы,
--                                шифры неисправности) и читает наряды.
--
-- Здесь заменяем общие политики записи «*: web write» (0006, Admin + Head)
-- на «*: admin write» (только Admin). Политики чтения не меняются.
-- Выполнить в Supabase → SQL Editor после 0007_head_analytics.sql.

begin;

-- ============================================================
-- 1. Хелпер прав чтения веб-панелей (Admin + Head) — остаётся
--    без изменений, меняется только смысл: теперь это «читающая»
--    роль веб-панелей, а не «полные права».
-- ============================================================
create or replace function public.is_web_role()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('Admin', 'Head')
  )
$$;

comment on function public.is_web_role() is
  'Веб-панели: Администратор (пишет справочники §2) и Руководитель (только чтение).';

-- ============================================================
-- 2. Запись в справочники §2 — только веб-администратор.
--    (0006 выдавала запись обеим веб-ролям — теперь только Admin.)
-- ============================================================
drop policy if exists "areas: web write" on public.areas;
drop policy if exists "areas: admin write" on public.areas;
create policy "areas: admin write" on public.areas for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "equipment: web write" on public.equipment;
drop policy if exists "equipment: admin write" on public.equipment;
create policy "equipment: admin write" on public.equipment for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "workers: web write" on public.workers;
drop policy if exists "workers: admin write" on public.workers;
create policy "workers: admin write" on public.workers for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "materials: web write" on public.materials;
drop policy if exists "materials: admin write" on public.materials;
create policy "materials: admin write" on public.materials for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "fault_codes: web write" on public.fault_codes;
drop policy if exists "fault_codes: admin write" on public.fault_codes;
create policy "fault_codes: admin write" on public.fault_codes for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 3. Чтение нарядов, истории, приёмки и списка аккаунтов —
--    обе веб-роли (как в 0006), изменений нет. Оставлено для
--    наглядности: политики «*: web read» продолжают действовать.
-- ============================================================
-- work_orders: web read, work_order_history: web read,
-- work_order_acceptance: web read, profiles: web read.

commit;

-- ============================================================
-- Итог по правам веб-панелей:
--
--   Мастер (Master)     — работа с нарядами, приёмка (без изменений).
--   Администратор (Admin) — справочники §2 (запись) + чтение нарядов.
--   Руководитель (Head)   — аналитика и просмотр нарядов (только чтение);
--                           изменять что-либо в БД не может.
--
-- Назначение ролей — SQL-ом (см. 0006):
--   select public.set_user_role('head@example.com',  'Head');
--   select public.set_user_role('admin@example.com', 'Admin');
-- ============================================================
