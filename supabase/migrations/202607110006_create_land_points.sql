-- Sprint 01B-1: land_points
--
-- Consolidates src/lib/field-gps.types.ts FieldGpsPoint,
-- FieldGpsTrackPoint and FoundPointRecord into one table. All three
-- client shapes describe the same underlying thing (a captured GPS
-- reading) with slightly different optional metadata depending on how
-- it was captured, so a single table with nullable capture-specific
-- columns matches the data more faithfully than three separate
-- tables.
--
-- land_record_id is nullable by design: a surveyor/public user
-- captures points in the field before necessarily attaching them to a
-- saved land_record. Ownership therefore has two branches (see RLS
-- below): linked points are owned via the land_record; unlinked
-- points are owned via whoever captured them.

create table if not exists public.land_points (
  id uuid primary key default gen_random_uuid(),
  land_record_id uuid references public.land_records (id) on delete set null,
  captured_by uuid references auth.users (id) on delete set null,

  point_type public.point_type not null,
  label text,

  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  altitude double precision,
  accuracy_m double precision,
  altitude_accuracy_m double precision,
  heading double precision,
  speed double precision,

  quality_grade text check (quality_grade in ('A', 'B', 'C', 'D')),
  capture_method text check (capture_method in ('single', 'averaged', 'best-fix', 'manual-key-in')),
  source text check (source in ('phone-gps', 'keyed-coordinate')),
  sample_count integer,
  occupation_seconds integer,

  distance_difference_m double precision,
  bearing_degrees double precision,
  note text,

  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.land_points is
  'Sprint 01B-1: consolidates FieldGpsPoint / FieldGpsTrackPoint / FoundPointRecord. land_record_id is nullable: points may exist before being attached to a saved record. ON DELETE SET NULL (not CASCADE) preserves the measurement as a standalone record if the parent land_record is later deleted -- see OWNER DECISION REQUIRED in the migration plan.';

comment on column public.land_points.quality_grade is
  'Plain text CHECK, not an enum: this is a 4-value grading scale (A-D) not expected to grow, but not mirrored from an existing DB enum decision -- kept as CHECK for now per "enum only if genuinely stable"; revisit if it needs to compose with other enum columns later.';

create index if not exists land_points_land_record_id_idx
  on public.land_points (land_record_id);
create index if not exists land_points_captured_by_captured_at_idx
  on public.land_points (captured_by, captured_at desc);

alter table public.land_points enable row level security;

-- Two-branch ownership: a point linked to a land_record is owned via
-- that record's owner; an unlinked (land_record_id is null) point is
-- owned by whoever captured it.
drop policy if exists "land_points_select_own" on public.land_points;
create policy "land_points_select_own"
  on public.land_points
  for select
  to authenticated
  using (
    (
      land_record_id is not null
      and exists (
        select 1
        from public.land_records lr
        where lr.id = land_points.land_record_id
          and lr.owner_id = (select auth.uid())
      )
    )
    or (
      land_record_id is null
      and captured_by = (select auth.uid())
    )
  );

drop policy if exists "land_points_insert_own" on public.land_points;
create policy "land_points_insert_own"
  on public.land_points
  for insert
  to authenticated
  with check (
    (
      land_record_id is not null
      and exists (
        select 1
        from public.land_records lr
        where lr.id = land_points.land_record_id
          and lr.owner_id = (select auth.uid())
      )
    )
    or (
      land_record_id is null
      and captured_by = (select auth.uid())
    )
  );

drop policy if exists "land_points_update_own" on public.land_points;
create policy "land_points_update_own"
  on public.land_points
  for update
  to authenticated
  using (
    (
      land_record_id is not null
      and exists (
        select 1
        from public.land_records lr
        where lr.id = land_points.land_record_id
          and lr.owner_id = (select auth.uid())
      )
    )
    or (
      land_record_id is null
      and captured_by = (select auth.uid())
    )
  )
  with check (
    (
      land_record_id is not null
      and exists (
        select 1
        from public.land_records lr
        where lr.id = land_points.land_record_id
          and lr.owner_id = (select auth.uid())
      )
    )
    or (
      land_record_id is null
      and captured_by = (select auth.uid())
    )
  );

drop policy if exists "land_points_delete_own" on public.land_points;
create policy "land_points_delete_own"
  on public.land_points
  for delete
  to authenticated
  using (
    (
      land_record_id is not null
      and exists (
        select 1
        from public.land_records lr
        where lr.id = land_points.land_record_id
          and lr.owner_id = (select auth.uid())
      )
    )
    or (
      land_record_id is null
      and captured_by = (select auth.uid())
    )
  );
