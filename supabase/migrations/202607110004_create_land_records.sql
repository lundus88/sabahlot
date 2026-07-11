-- Sprint 01B-1: land_records
--
-- Case/record-level metadata: lot identification, applicant/heir
-- summary, history notes, workflow status. Geometry, GPS points,
-- named parties and documents are deliberately split into their own
-- tables (see land_record_geometries, land_points, land_parties,
-- documents) rather than folded into one large JSON blob here -- see
-- "JSONB usage" note in supabase/migration_docs/sprint-01b1-migration-plan.md
-- for the one place this table does use jsonb-adjacent design
-- (it doesn't; geometry coordinates live in land_record_geometries).
--
-- Additive-only. Does not touch, reference for backfill, or depend on
-- `public.lots` in any way.

create table if not exists public.land_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  record_name text not null check (length(trim(record_name)) > 0),
  lot_number text,
  village text,
  district text,
  region public.region_id not null default 'sabah',

  land_case_type public.land_case_type,
  application_age public.application_age,
  records_available public.land_available_record[] not null default '{}',
  issue_tags public.land_issue_tag[] not null default '{}',
  original_applicant_status public.applicant_status,
  heirs_can_identify_location public.heir_location_knowledge,
  land_history_notes text,

  status public.land_record_status not null default 'draft',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.land_records is
  'Sprint 01B-1: case/record-level metadata only. Geometry, points, parties and documents live in their own child tables. Additive-only, independent of public.lots.';

create index if not exists land_records_owner_id_created_at_idx
  on public.land_records (owner_id, created_at desc);
create index if not exists land_records_status_idx
  on public.land_records (status);
create index if not exists land_records_issue_tags_gin_idx
  on public.land_records using gin (issue_tags);

alter table public.land_records enable row level security;

-- SELECT/INSERT/UPDATE/DELETE: strict owner-only. No policy grants
-- read/write to any authenticated user other than the owner, and no
-- policy grants anonymous access. land_records carries applicant
-- names, heir relationships and history notes -- this is personal
-- case data, not shareable-by-default content.
drop policy if exists "land_records_select_own" on public.land_records;
create policy "land_records_select_own"
  on public.land_records
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

-- Sprint 01B-3 fix: the original version of this policy only checked
-- ownership, leaving `status` completely unconstrained -- an owner
-- could INSERT a brand-new record directly in status 'approved'.
-- User-editable statuses are 'draft' and 'submitted' only (a user
-- filing/submitting their own case is normal self-service; every
-- other status -- 'under_review', 'approved', 'rejected', 'archived'
-- -- represents an official reviewer/adjudicator decision and is
-- deliberately excluded here). This is the safest default per Sprint
-- 01B-3 scope; see OWNER DECISION REQUIRED in the migration plan for
-- whether 'archived' should later be reclassified as user-editable
-- (e.g. a user archiving their own withdrawn draft).
drop policy if exists "land_records_insert_own" on public.land_records;
create policy "land_records_insert_own"
  on public.land_records
  for insert
  to authenticated
  with check (
    (select auth.uid()) = owner_id
    and status in ('draft', 'submitted')
  );

drop policy if exists "land_records_update_own" on public.land_records;
create policy "land_records_update_own"
  on public.land_records
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "land_records_delete_own" on public.land_records;
create policy "land_records_delete_own"
  on public.land_records
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

-- Sprint 01B-3 fix: prevent an owner from moving their own record
-- INTO a privileged status via UPDATE. This is deliberately a
-- trigger, not a `status in (...)` clause added to
-- land_records_update_own's WITH CHECK: an RLS whitelist on the NEW
-- row's status would also block the owner from editing any OTHER
-- field (record_name, land_history_notes, etc.) once status has
-- already moved to under_review/approved/rejected/archived by a
-- future admin process, because WITH CHECK evaluates the whole NEW
-- row every time, not just the columns being changed. This trigger
-- only rejects the update when `status` itself is being changed to a
-- non-user-editable value, comparing NEW against OLD directly (which
-- RLS policy expressions cannot do) -- unrelated field edits on an
-- already-progressed record are unaffected by this trigger either
-- way (see OWNER DECISION REQUIRED: whether such edits should
-- instead be locked entirely once a record leaves draft/submitted is
-- a separate, broader decision not made here).
create or replace function public.prevent_land_record_privileged_status()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'submitted') then
      raise exception
        'New land records may only be created with status draft or submitted. Review/approval statuses require a separate server-side/admin process (see OWNER DECISION REQUIRED).';
    end if;

    return new;
  end if;

  if new.status is distinct from old.status and new.status not in ('draft', 'submitted') then
    raise exception
      'Changing a land record to a review/approval status via a normal client update is not permitted. Status changes beyond draft/submitted require a separate server-side/admin process (see OWNER DECISION REQUIRED).';
  end if;

  return new;
end;
$$;

drop trigger if exists land_records_prevent_privileged_status on public.land_records;
create trigger land_records_prevent_privileged_status
  before insert or update on public.land_records
  for each row
  execute function public.prevent_land_record_privileged_status();

drop trigger if exists land_records_set_updated_at on public.land_records;
create trigger land_records_set_updated_at
  before update on public.land_records
  for each row
  execute function public.set_updated_at();
