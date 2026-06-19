-- DEVELOPMENT ONLY.
-- Do not apply this file to production.

alter table public.lots
  drop constraint if exists lots_user_id_fkey;

drop policy if exists "Development demo can create lots"
  on public.lots;

create policy "Development demo can create lots"
  on public.lots
  for insert
  to anon
  with check (
    user_id =
      '00000000-0000-4000-8000-000000000001'::uuid
  );

grant insert on public.lots to anon;
