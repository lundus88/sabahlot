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
  add column if not exists polygon_geojson jsonb;

update public.lots
set polygon_geojson = jsonb_build_object(
  'type',
  'Polygon',
  'coordinates',
  jsonb_build_array()
)
where polygon_geojson is null;

alter table public.lots
  alter column polygon_geojson set not null;

drop policy if exists "Users can delete their own lots"
  on public.lots;

create policy "Users can delete their own lots"
  on public.lots
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
