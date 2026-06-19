do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lots'
      and column_name = 'polygon'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lots'
      and column_name = 'polygon_geojson'
  ) then
    alter table public.lots
      rename column polygon to polygon_geojson;
  end if;
end
$$;

alter table public.lots
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists lot_name text,
  add column if not exists polygon_geojson jsonb,
  add column if not exists area_m2 double precision,
  add column if not exists area_ha double precision,
  add column if not exists area_acre double precision,
  add column if not exists created_at timestamptz default now();

update public.lots
set
  lot_name = coalesce(nullif(trim(lot_name), ''), 'Untitled Lot'),
  polygon_geojson = coalesce(
    polygon_geojson,
    jsonb_build_object(
      'type',
      'Polygon',
      'coordinates',
      jsonb_build_array()
    )
  ),
  area_m2 = coalesce(area_m2, 0),
  area_ha = coalesce(area_ha, 0),
  area_acre = coalesce(area_acre, 0),
  created_at = coalesce(created_at, now());

alter table public.lots
  alter column lot_name set not null,
  alter column polygon_geojson set not null,
  alter column area_m2 set not null,
  alter column area_ha set not null,
  alter column area_acre set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists lots_user_id_created_at_idx
  on public.lots (user_id, created_at desc);

notify pgrst, 'reload schema';
