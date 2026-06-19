create table if not exists public.lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lot_name text not null check (length(trim(lot_name)) > 0),
  polygon_geojson jsonb not null check (polygon_geojson ->> 'type' = 'Polygon'),
  area_m2 double precision not null check (area_m2 >= 0),
  area_ha double precision not null check (area_ha >= 0),
  area_acre double precision not null check (area_acre >= 0),
  created_at timestamptz not null default now()
);

create index if not exists lots_user_id_created_at_idx
  on public.lots (user_id, created_at desc);

alter table public.lots enable row level security;

create policy "Users can view their own lots"
  on public.lots
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own lots"
  on public.lots
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own lots"
  on public.lots
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
