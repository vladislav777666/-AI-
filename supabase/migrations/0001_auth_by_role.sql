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
insert into public.demo_accounts (role, password_hash) values
  ('Master', crypt('1234', gen_salt('bf'))),
  ('Worker', crypt('1234', gen_salt('bf')))
on conflict (role) do nothing;

-- Вход по роли: возвращает true/false. security definer → читает хеши без RLS-доступа.
create or replace function public.login_with_role(p_role text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  if p_role not in ('Master', 'Worker') then
    return false;
  end if;

  select password_hash into v_hash
  from demo_accounts
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

create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles: insert own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);
