-- Sprint 01B-1: profiles
--
-- One row per auth.users identity. Holds only what the app already
-- displays about "yourself" -- no tokens, no secrets, no admin
-- assignment logic. Additive-only; does not touch `public.lots`.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  role public.user_role not null default 'public_user',
  region public.region_id,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Sprint 01B-1: one row per auth.users identity. role/region are app-facing preferences, not an authorization mechanism by themselves (see RLS policies).';
comment on column public.profiles.role is
  'ADMIN POLICY PENDING OWNER APPROVAL: role exists as a data column only. No RLS policy in this migration set grants elevated access based on role. See OWNER DECISION REQUIRED in the migration plan for how role is meant to actually be assigned.';

create index if not exists profiles_role_idx
  on public.profiles (role);

alter table public.profiles enable row level security;

-- SELECT: a user can only ever see their own profile row. No policy
-- exists that allows one authenticated user to browse another's
-- profile, and no policy grants anonymous read access.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

-- INSERT: a user may only create the profile row matching their own
-- id, and only with the lowest/default role ('public_user'). In
-- normal operation this is done automatically by the
-- handle_new_user() trigger below; this policy exists as a safety net
-- (e.g. a client-side lazy-create-on-first-use path) and still cannot
-- be used to create a profile for anyone else, nor to self-assign an
-- elevated role (Sprint 01B-3 fix: the original version of this
-- policy only checked `auth.uid() = id`, leaving `role` unconstrained
-- on INSERT -- see prevent_profile_role_escalation() below for the
-- second, trigger-level layer of the same rule).
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (
    (select auth.uid()) = id
    and role = 'public_user'
  );

-- UPDATE: a user may only update their own row. Row-level access is
-- enforced here; column-level protection against self-promoting
-- `role` is enforced separately by the
-- prevent_profile_role_escalation trigger below, because RLS
-- USING/WITH CHECK clauses cannot compare NEW.role against OLD.role
-- directly.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- DELETE: intentionally no policy. Profile lifecycle is tied to the
-- auth.users lifecycle (see ON DELETE CASCADE above); a user does not
-- independently delete their profile while keeping their account.
-- This is a deliberate default-deny, not an oversight.

-- Prevent a user from self-assigning or escalating their own role,
-- covering BOTH INSERT and UPDATE (Sprint 01B-3 fix: the original
-- version of this trigger only fired BEFORE UPDATE, leaving INSERT
-- completely unguarded at the trigger layer -- the profiles_insert_own
-- policy's new `role = 'public_user'` check above is the first layer;
-- this trigger is the second, independent layer, so a future change
-- to the RLS policy alone cannot silently reopen this gap).
--
-- RLS controls which ROWS are reachable; this trigger controls which
-- COLUMN VALUES are allowed once a row is reachable.
create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.role is distinct from 'public_user'::public.user_role then
      raise exception
        'New profiles must be created with the default role (public_user). Elevated roles require a separate server-side/admin process (see OWNER DECISION REQUIRED).';
    end if;

    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception
      'Changing profile role via a normal client update is not permitted. Role assignment requires a service-role/admin-only process (see OWNER DECISION REQUIRED).';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation
  before insert or update on public.profiles
  for each row
  execute function public.prevent_profile_role_escalation();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Auto-provision a profile row when a new auth.users row is created.
-- SECURITY DEFINER is required: this trigger fires in the auth
-- system's context, which does not otherwise have INSERT rights on
-- public.profiles under RLS. search_path is pinned to `public` to
-- avoid search-path hijacking. The function does exactly one minimal,
-- safe thing and nothing else.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
