-- 0005_admin_role.sql
-- Веб-роль «Администратор» (ТЗ §2): отдельная от Мастера роль для
-- веб-панели «Справочники». Доступ — только в веб-продакшене
-- (не в APK): интерфейс гейтится на фронтенде, БД даёт админу права
-- на справочники и чтение нарядов.
-- Выполнить в Supabase → SQL Editor после 0004_admin_reference_books.sql.

begin;

-- ============================================================
-- 1. Роль Admin в профилях (расширяем check-констрейнт из 0001).
-- ============================================================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('Master', 'Worker', 'Admin'));

-- ============================================================
-- 2. Хелперы для RLS.
--    is_admin  — только администратор;
--    is_staff  — мастер или администратор (общие права чтения).
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'Admin')
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('Master', 'Admin')
  )
$$;

-- ============================================================
-- 3. handle_new_user: разрешаем роль Admin из метаданных
--    (админ-аккаунт заводится оператором через SQL, workers-строку
--    для него не создаём — он не исполнитель).
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
  if v_role not in ('Master', 'Worker', 'Admin') then
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

-- ============================================================
-- 4. RLS: справочники §2 — администратор пишет наравне с мастером.
--    (Чтение уже открыто всем авторизованным политиками 0002/0004.)
-- ============================================================
drop policy if exists "areas: admin write" on public.areas;
create policy "areas: admin write" on public.areas for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "equipment: admin write" on public.equipment;
create policy "equipment: admin write" on public.equipment for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "workers: admin write" on public.workers;
create policy "workers: admin write" on public.workers for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "materials: admin write" on public.materials;
create policy "materials: admin write" on public.materials for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "fault_codes: admin write" on public.fault_codes;
create policy "fault_codes: admin write" on public.fault_codes for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 5. RLS: наряды, история и приёмка — администратор читает
--    (списки нарядов по оборудованию/сотруднику, карточка наряда §3).
--    Писать наряды может только Мастер — как и прежде.
-- ============================================================
drop policy if exists "work_orders: admin read" on public.work_orders;
create policy "work_orders: admin read" on public.work_orders for select
  to authenticated using (public.is_admin());

drop policy if exists "history: admin read" on public.work_order_history;
create policy "history: admin read" on public.work_order_history for select
  to authenticated using (public.is_admin());

drop policy if exists "acceptance: admin read" on public.work_order_acceptance;
create policy "acceptance: admin read" on public.work_order_acceptance for select
  to authenticated using (public.is_admin());

commit;

-- ============================================================
-- Как назначить администратора (Supabase → SQL Editor):
-- пользователь сначала регистрируется в приложении, затем:
--
--   update public.profiles
--      set role = 'Admin', full_name = 'Администратор'
--    where id = (select id from auth.users where email = 'admin@example.com');
--
-- Роль Admin работает только в веб-продакшене: в APK интерфейс
-- администратора скрыт на фронтенде (!Capacitor.isNativePlatform()).
-- ============================================================
