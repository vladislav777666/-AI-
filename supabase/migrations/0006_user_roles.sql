-- 0006_user_roles.sql
-- Роли зарегистрированных аккаунтов: Мастер (Master), Исполнитель (Worker),
-- Веб-руководитель (Head) и Веб-администратор (Admin).
--
-- «Веб-руководитель» по правам равен веб-администратору (решение заказчика):
-- справочники §2 и чтение нарядов/истории/приёмки. Роль назначается SQL-ом:
--   select public.set_user_role('user@example.com', 'Head');
-- либо напрямую: update public.profiles set role = 'Head' where email = '...';
-- Список зарегистрированных с ролями: select * from public.registered_users;
--
-- Выполнить в Supabase → SQL Editor после 0005_admin_role.sql.
-- Роли Master/Worker продолжают работать как прежде (0001–0003).

begin;

-- ============================================================
-- 1. Столбец роли: четыре допустимых значения.
--    profiles.role — единственный источник правды о роли аккаунта
--    (auth.users.raw_user_meta_data.role читается только при регистрации).
-- ============================================================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('Master', 'Worker', 'Head', 'Admin'));

-- ============================================================
-- 2. Email в профилях: чтобы выдавать роль зарегистрированному
--    пользователю по адресу, а не по UUID.
-- ============================================================
alter table public.profiles add column if not exists email text;

update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is null;

create index if not exists profiles_email_idx on public.profiles (lower(email));

-- ============================================================
-- 3. Хелперы прав.
--    is_web_role — веб-руководитель или веб-администратор (полные права
--                  веб-панели: справочники §2 + чтение нарядов);
--    is_admin    — только веб-администратор (точечные проверки);
--    is_staff    — персонал с правами чтения (Мастер, Администратор,
--                  Руководитель); Исполнитель сюда не входит.
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
    where id = auth.uid() and role in ('Master', 'Admin', 'Head')
  )
$$;

-- ============================================================
-- 4. handle_new_user: принимаем роль Head из метаданных и сохраняем
--    email. Первый пользователь по-прежнему становится Мастером;
--    неизвестная роль трактуется как Worker. Строку в workers
--    создаём только Исполнителю (веб-роли в справочник не попадают).
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
  if v_role not in ('Master', 'Worker', 'Head', 'Admin') then
    v_role := 'Worker';
  end if;

  select not exists (select 1 from public.profiles where role = 'Master') into v_first;
  v_effective := case when v_first then 'Master' else v_role end;

  v_name := coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''),
                     split_part(new.email, '@', 1));

  insert into public.profiles (id, role, full_name, email)
  values (new.id, v_effective, v_name, new.email);

  if v_effective = 'Worker' then
    insert into public.workers (user_id, full_name)
    values (new.id, v_name)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- ============================================================
-- 5. Права веб-ролей на справочники §2 (руководитель = администратор).
--    Пересоздаём политики 0005: admin-only → web (Admin + Head).
-- ============================================================
drop policy if exists "areas: admin write" on public.areas;
drop policy if exists "areas: web write" on public.areas;
create policy "areas: web write" on public.areas for all
  to authenticated using (public.is_web_role()) with check (public.is_web_role());

drop policy if exists "equipment: admin write" on public.equipment;
drop policy if exists "equipment: web write" on public.equipment;
create policy "equipment: web write" on public.equipment for all
  to authenticated using (public.is_web_role()) with check (public.is_web_role());

drop policy if exists "workers: admin write" on public.workers;
drop policy if exists "workers: web write" on public.workers;
create policy "workers: web write" on public.workers for all
  to authenticated using (public.is_web_role()) with check (public.is_web_role());

drop policy if exists "materials: admin write" on public.materials;
drop policy if exists "materials: web write" on public.materials;
create policy "materials: web write" on public.materials for all
  to authenticated using (public.is_web_role()) with check (public.is_web_role());

drop policy if exists "fault_codes: admin write" on public.fault_codes;
drop policy if exists "fault_codes: web write" on public.fault_codes;
create policy "fault_codes: web write" on public.fault_codes for all
  to authenticated using (public.is_web_role()) with check (public.is_web_role());

-- ============================================================
-- 6. Чтение нарядов, истории и приёмки веб-ролями
--    (списки нарядов и карточка §3; писать наряды может только Мастер).
-- ============================================================
drop policy if exists "work_orders: admin read" on public.work_orders;
drop policy if exists "work_orders: web read" on public.work_orders;
create policy "work_orders: web read" on public.work_orders for select
  to authenticated using (public.is_web_role());

drop policy if exists "history: admin read" on public.work_order_history;
drop policy if exists "history: web read" on public.work_order_history;
create policy "history: web read" on public.work_order_history for select
  to authenticated using (public.is_web_role());

drop policy if exists "acceptance: admin read" on public.work_order_acceptance;
drop policy if exists "acceptance: web read" on public.work_order_acceptance;
create policy "acceptance: web read" on public.work_order_acceptance for select
  to authenticated using (public.is_web_role());

-- Профили: веб-роли видят все учётные записи (список зарегистрированных
-- и их роли). Свою строку, как и прежде, видит каждый.
drop policy if exists "profiles: web read" on public.profiles;
create policy "profiles: web read" on public.profiles for select
  to authenticated using (public.is_web_role());

-- ============================================================
-- 7. Выдача роли по email (SQL-only).
--    security definer: обходит RLS профилей; выполнять из SQL Editor
--    или service_role. Клиентским ролям функция недоступна.
-- ============================================================
create or replace function public.set_user_role(p_email text, p_role text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_role text;
  v_row  public.profiles;
begin
  v_role := case lower(trim(p_role))
              when 'master' then 'Master'
              when 'worker' then 'Worker'
              when 'head'   then 'Head'
              when 'admin'  then 'Admin'
            end;

  if v_role is null then
    raise exception 'Неизвестная роль «%». Допустимо: Master, Worker, Head, Admin', p_role;
  end if;

  select id into v_id
    from auth.users
   where lower(email) = lower(trim(p_email));

  if v_id is null then
    raise exception 'Зарегистрированный пользователь % не найден (auth.users)', p_email;
  end if;

  update public.profiles
     set role = v_role,
         email = coalesce(email, (select email from auth.users where id = v_id))
   where id = v_id
  returning * into v_row;

  if v_row is null then
    -- Регистрация была, а профиля нет (например, триггер отключён) —
    -- создаём строку, чтобы роль применилась.
    insert into public.profiles (id, role, full_name, email)
    values (
      v_id,
      v_role,
      coalesce((select raw_user_meta_data ->> 'full_name' from auth.users where id = v_id),
               split_part(p_email, '@', 1)),
      (select email from auth.users where id = v_id)
    )
    returning * into v_row;
  end if;

  -- Исполнителю нужна строка в справочнике сотрудников (ТЗ §2.4).
  if v_role = 'Worker' then
    insert into public.workers (user_id, full_name)
    values (v_id, v_row.full_name)
    on conflict (user_id) do nothing;
  end if;

  return v_row;
end;
$$;

-- Функция выдаёт роли: доступна только SQL Editor / service_role.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.set_user_role(text, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.set_user_role(text, text) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.set_user_role(text, text) to service_role';
  end if;
end;
$$;

-- ============================================================
-- 8. Вью зарегистрированных аккаунтов: email, имя, роль.
--    Удобно для выдачи ролей и проверки, кто как зарегистрирован.
-- ============================================================
create or replace view public.registered_users
with (security_invoker = true)
as
select
  p.id,
  coalesce(p.email, u.email) as email,
  p.full_name,
  p.role,
  p.created_at   as registered_at,
  u.last_sign_in_at
from public.profiles p
join auth.users u on u.id = p.id;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.registered_users from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.registered_users from authenticated';
  end if;
end;
$$;

commit;

-- ============================================================
-- Как выдать роль зарегистрированному пользователю (SQL Editor):
--
--   select public.set_user_role('user@example.com', 'Master');
--   select public.set_user_role('user@example.com', 'Worker');
--   select public.set_user_role('user@example.com', 'Head');   -- веб-руководитель
--   select public.set_user_role('user@example.com', 'Admin');  -- веб-администратор
--
-- Список зарегистрированных и их ролей:
--   select * from public.registered_users order by registered_at;
--
-- Веб-роли (Head/Admin) работают только в веб-продакшене: в APK их
-- интерфейс скрыт на фронтенде (!Capacitor.isNativePlatform()).
-- Роль изменится при следующем входе пользователя (getProfile читает
-- public.profiles.role).
-- ============================================================
