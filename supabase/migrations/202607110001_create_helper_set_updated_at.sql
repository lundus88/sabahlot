-- Sprint 01B-1: shared trigger function to maintain `updated_at` columns.
--
-- SECURITY INVOKER (the default, stated explicitly for clarity) is
-- sufficient here: the function only reads/writes NEW, a row already
-- being written by the calling statement under the caller's own
-- privileges and already subject to that table's RLS policies. No
-- elevated access is required or granted.
--
-- search_path is pinned to `public` to avoid any ambiguity/hijacking
-- risk, even though this function does not reference any other object.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Sprint 01B-1: sets updated_at = now() on UPDATE. Attached per-table via BEFORE UPDATE triggers. SECURITY INVOKER, no elevated privileges.';
