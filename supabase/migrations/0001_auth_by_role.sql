-- Миграция: проверка пароля по роли (Master/Worker) через Supabase RPC.
-- Выполнить в Supabase → SQL Editor.

create extension if not exists pgcrypto;

-- Аккаунты демо-пользователей: одна строка на роль.
create table if not exists public.demo_accounts (
  role          text primary key check (role in ('Master', 'Worker')),
  password_hash text not null,
  created_at    timestamptz not null default now()
);

alter table public.demo_accounts enable row level security;

-- Строки аккаунтов не читаются напрямую: только через security definer функцию.
revoke all on public.demo_accounts from anon, authenticated;

-- Пароли по умолчанию для демо (замените crypt('ваш_пароль', gen_salt('bf'))).
-- В Supabase pgcrypto обычно лежит в схеме "extensions", которая не входит в
-- search_path: прямой вызов gen_salt('bf') без префикса схемы падает с 42883.
-- Поэтому схему расширения определяем динамически и вызываем crypt/gen_salt через неё.
do $$
declare
  v_ns   text;
  v_hash text;
begin
  select n.nspname into v_ns
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pgcrypto';

  if v_ns is null then
    create extension pgcrypto;
    select n.nspname into v_ns
      from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace
     where e.extname = 'pgcrypto';
  end if;

  execute format('select %I.crypt(%L, %I.gen_salt(%L))', v_ns, '1234', v_ns, 'bf')
    into v_hash;

  insert into public.demo_accounts (role, password_hash)
  values ('Master', v_hash), ('Worker', v_hash)
  on conflict (role) do nothing;
end;
$$;

-- Вход по роли: возвращает true/false. security definer → читает хеши без RLS-доступа.
create or replace function public.login_with_role(p_role text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = extensions, public
as $$
declare
  v_hash text;
begin
  if p_role not in ('Master', 'Worker') then
    return false;
  end if;

  select password_hash into v_hash
  from public.demo_accounts
  where role = p_role;

  if v_hash is null then
    return false;
  end if;

  return crypt(p_password, v_hash) = v_hash;
end;
$$;

revoke all on function public.login_with_role(text, text) from public;
grant execute on function public.login_with_role(text, text) to anon, authenticated;

-- Профили: роль пользователя (для будущего использования после входа).
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       text not null check (role in ('Master', 'Worker')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);
