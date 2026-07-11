-- Sprint 01B-1: land_record_geometries
--
-- One land_record can have many geometries (parent lot, proposed
-- sub-lots, boundary/access/setback lines, reference lines) --
-- mirrors src/lib/drawing-types.ts DrawingObject exactly (a
-- discriminated union of PolygonDrawingObject | LineDrawingObject).
--
-- `coordinates` is stored as jsonb, deliberately:
--   Reason:      it is a direct, unmodified copy of the coordinate
--                array shape the client already produces
--                (DrawingCoordinate[] -> [{lat,lng}, ...]) and the
--                same GeoJSON-ring shape `lots.polygon_geojson`
--                already uses today. No coordinate transform, no
--                projection/BRSO/WGS84 logic is touched by this
--                migration.
--   Structure:   an array of {lat, lng} pairs (or a nested ring array
--                for polygons, matching lots.polygon_geojson). Not
--                normalized into a coordinates table because the
--                client always reads/writes a whole geometry's
--                coordinate list atomically -- there is no query
--                pattern today that needs to filter by an individual
--                vertex.
--   Validation:  a CHECK enforces the top-level value is a JSON
--                array; deeper structural validation (numeric lat/lng
--                bounds, ring closure) is left to the application
--                layer, matching how the client already validates
--                before sending data today.
--   Future risk: if per-vertex spatial querying is ever needed
--                (e.g. "find geometries near X"), this column would
--                need a PostGIS `geometry` migration. That is out of
--                scope for Sprint 01B-1 and flagged as an OWNER
--                DECISION REQUIRED item, not decided here.

create table if not exists public.land_record_geometries (
  id uuid primary key default gen_random_uuid(),
  land_record_id uuid not null references public.land_records (id) on delete cascade,

  geometry_type public.geometry_type not null,
  category public.geometry_category not null,
  name text,
  coordinates jsonb not null check (jsonb_typeof(coordinates) = 'array'),

  line_style public.line_style,
  color text,
  weight numeric,
  is_visible boolean not null default true,

  area_m2 numeric,
  area_ha numeric,
  area_acre numeric,
  perimeter_m numeric,

  length_m numeric,
  start_bearing numeric,
  end_bearing numeric,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Mirrors the DrawingObject discriminated union: a polygon never
  -- carries line-only fields and a line never carries polygon-only
  -- fields.
  constraint land_record_geometries_polygon_fields_check check (
    geometry_type <> 'polygon'
    or (length_m is null and start_bearing is null and end_bearing is null)
  ),
  constraint land_record_geometries_line_fields_check check (
    geometry_type <> 'line'
    or (area_m2 is null and area_ha is null and area_acre is null and perimeter_m is null)
  )
);

comment on table public.land_record_geometries is
  'Sprint 01B-1: 1:N geometries per land_record. Mirrors src/lib/drawing-types.ts DrawingObject. See file header for the JSONB coordinates design rationale.';

create index if not exists land_record_geometries_land_record_id_idx
  on public.land_record_geometries (land_record_id);

alter table public.land_record_geometries enable row level security;

-- Ownership is not duplicated onto this table; it is derived from the
-- parent land_records row via EXISTS, so there is a single source of
-- truth for "who owns this". A geometry has no meaning without its
-- parent record, hence the CASCADE on land_record_id above.
drop policy if exists "land_record_geometries_select_own" on public.land_record_geometries;
create policy "land_record_geometries_select_own"
  on public.land_record_geometries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.land_records lr
      where lr.id = land_record_geometries.land_record_id
        and lr.owner_id = (select auth.uid())
    )
  );

drop policy if exists "land_record_geometries_insert_own" on public.land_record_geometries;
create policy "land_record_geometries_insert_own"
  on public.land_record_geometries
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.land_records lr
      where lr.id = land_record_geometries.land_record_id
        and lr.owner_id = (select auth.uid())
    )
  );

drop policy if exists "land_record_geometries_update_own" on public.land_record_geometries;
create policy "land_record_geometries_update_own"
  on public.land_record_geometries
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.land_records lr
      where lr.id = land_record_geometries.land_record_id
        and lr.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.land_records lr
      where lr.id = land_record_geometries.land_record_id
        and lr.owner_id = (select auth.uid())
    )
  );

drop policy if exists "land_record_geometries_delete_own" on public.land_record_geometries;
create policy "land_record_geometries_delete_own"
  on public.land_record_geometries
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.land_records lr
      where lr.id = land_record_geometries.land_record_id
        and lr.owner_id = (select auth.uid())
    )
  );

drop trigger if exists land_record_geometries_set_updated_at on public.land_record_geometries;
create trigger land_record_geometries_set_updated_at
  before update on public.land_record_geometries
  for each row
  execute function public.set_updated_at();
