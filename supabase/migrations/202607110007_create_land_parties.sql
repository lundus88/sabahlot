-- Sprint 01B-1: land_parties
--
-- Normalizes two previously-flat, overlapping client concepts into
-- one table: LandRecordDetails.originalApplicantName /
-- mainHeirName / relationshipToApplicant (free-text fields on the
-- record itself) and LocalPdfIdentities.{surveyor,witness,
-- villageHead,applicant} (a fixed set of named people attached to a
-- PDF export). Both describe "a named person associated with this
-- case," so both become rows here instead of duplicate name columns.

create table if not exists public.land_parties (
  id uuid primary key default gen_random_uuid(),
  land_record_id uuid not null references public.land_records (id) on delete cascade,

  party_role public.party_role not null,
  full_name text not null check (length(trim(full_name)) > 0),
  id_number text,
  relationship_to_applicant text,
  contact_phone text,
  contact_email text,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.land_parties is
  'Sprint 01B-1: named people tied to a land_record (owner/applicant/heir/surveyor/witness/village head).';
comment on column public.land_parties.id_number is
  'HIGH SENSITIVITY: government ID number tied to a named individual and a specific parcel. No column-level encryption is applied in this migration -- flagged as an unresolved risk in the migration plan (see Risks section), not solved here.';

create index if not exists land_parties_land_record_id_idx
  on public.land_parties (land_record_id);

alter table public.land_parties enable row level security;

drop policy if exists "land_parties_select_own" on public.land_parties;
create policy "land_parties_select_own"
  on public.land_parties
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.land_records lr
      where lr.id = land_parties.land_record_id
        and lr.owner_id = (select auth.uid())
    )
  );

drop policy if exists "land_parties_insert_own" on public.land_parties;
create policy "land_parties_insert_own"
  on public.land_parties
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.land_records lr
      where lr.id = land_parties.land_record_id
        and lr.owner_id = (select auth.uid())
    )
  );

drop policy if exists "land_parties_update_own" on public.land_parties;
create policy "land_parties_update_own"
  on public.land_parties
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.land_records lr
      where lr.id = land_parties.land_record_id
        and lr.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.land_records lr
      where lr.id = land_parties.land_record_id
        and lr.owner_id = (select auth.uid())
    )
  );

drop policy if exists "land_parties_delete_own" on public.land_parties;
create policy "land_parties_delete_own"
  on public.land_parties
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.land_records lr
      where lr.id = land_parties.land_record_id
        and lr.owner_id = (select auth.uid())
    )
  );

drop trigger if exists land_parties_set_updated_at on public.land_parties;
create trigger land_parties_set_updated_at
  before update on public.land_parties
  for each row
  execute function public.set_updated_at();
