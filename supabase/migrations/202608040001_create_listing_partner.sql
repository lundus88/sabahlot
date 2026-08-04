-- Sprint listing-partner-schema: listing_partners + property_listings.
--
-- See docs/ai/ARCHITECTURE_DECISIONS.md ADR-026 and
-- docs/ai/SPRINT_BRIEF_listing-partner-schema.md for the full design
-- reasoning. Three owner-decided points implemented here:
--   1. property_listings is the first genuinely public (anon-readable)
--      table in this schema -- only for status='active' rows whose
--      parent listing_partners row is status='approved'.
--   2. listing_partners.status can only move to
--      approved/rejected/suspended via an admin (profiles.role='admin'),
--      enforced at two independent layers (RLS + trigger), mirroring
--      prevent_profile_role_escalation() in create_profiles.sql.
--   3. property_listings is standalone -- no FK to land_records.
--
-- Schema-only sprint: no application code, no Storage bucket (listing
-- photos are explicitly deferred, see the sprint brief's "Owner
-- decisions required" #3), no seed data.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'listing_partner_status') then
    create type public.listing_partner_status as enum (
      'pending',
      'approved',
      'suspended',
      'rejected'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'property_listing_status') then
    create type public.property_listing_status as enum (
      'draft',
      'pending_review',
      'active',
      'under_offer',
      'sold',
      'leased',
      'expired',
      'removed'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'property_listing_type') then
    create type public.property_listing_type as enum (
      'for_sale',
      'for_lease'
    );
  end if;
end
$$;

create table if not exists public.listing_partners (
  id uuid primary key references auth.users (id) on delete cascade,

  company_name text,
  display_name text not null check (length(trim(display_name)) > 0),
  phone text not null check (length(trim(phone)) > 0),
  email text not null check (length(trim(email)) > 0),
  ren_number text,
  bio text,

  status public.listing_partner_status not null default 'pending',
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  public_contact_consent boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.listing_partners is
  'Sprint listing-partner-schema: one row per registered listing-partner identity. status starts pending; only an admin (profiles.role=admin) may move it to approved/rejected/suspended -- see prevent_listing_partner_self_approval() below.';
comment on column public.listing_partners.public_contact_consent is
  'Must be explicitly true before phone/email may ever be surfaced publicly. This migration does not itself implement any mechanism that reads this flag to expose contact info -- see ADR-026 point 4 / sprint brief owner-decision item 1.';
comment on column public.listing_partners.ren_number is
  'Malaysia real-estate agent license number. Nullable -- not every partner is assumed to be a licensed REN agent in this first schema; see sprint brief owner-decision item 2.';

create index if not exists listing_partners_status_idx
  on public.listing_partners (status);

alter table public.listing_partners enable row level security;

-- SELECT: a partner sees only their own row. No anon/other-user access
-- exists at all on this table, regardless of public_contact_consent --
-- consent only ever gates data copied into a public property_listings
-- row (not yet implemented), never this table's own visibility.
drop policy if exists "listing_partners_select_own" on public.listing_partners;
create policy "listing_partners_select_own"
  on public.listing_partners
  for select
  to authenticated
  using ((select auth.uid()) = id);

-- INSERT: a partner creates only their own row, and only starting
-- 'pending' -- self-registering as already-approved is rejected here.
drop policy if exists "listing_partners_insert_own" on public.listing_partners;
create policy "listing_partners_insert_own"
  on public.listing_partners
  for insert
  to authenticated
  with check (
    (select auth.uid()) = id
    and status = 'pending'
  );

-- UPDATE (own row): a partner may update their own row's other fields;
-- prevent_listing_partner_self_approval() below is the second, trigger
-- layer that blocks them from changing `status` this way (RLS
-- USING/WITH CHECK cannot compare NEW.status against OLD.status
-- directly -- same reasoning as prevent_profile_role_escalation()).
drop policy if exists "listing_partners_update_own" on public.listing_partners;
create policy "listing_partners_update_own"
  on public.listing_partners
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- UPDATE (admin): an admin (profiles.role='admin') may update any
-- listing_partners row, including another user's -- this is the
-- intended path for approving/rejecting/suspending a partner.
drop policy if exists "listing_partners_update_admin" on public.listing_partners;
create policy "listing_partners_update_admin"
  on public.listing_partners
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );

-- DELETE: intentionally no policy. A partner identity's lifecycle is
-- tied to auth.users (ON DELETE CASCADE above), matching profiles --
-- not an independent self-delete path in this sprint.

-- Second, trigger-level layer: blocks any non-admin from changing
-- their own status, even though listing_partners_update_own's RLS
-- WITH CHECK would otherwise allow it (it only checks row ownership,
-- not which columns changed). SECURITY INVOKER is correct here: the
-- function only ever reads the CALLING user's own profiles row (RLS
-- profiles_select_own already permits that for every authenticated
-- user, admin or not), so it never needs elevated privilege.
create or replace function public.prevent_listing_partner_self_approval()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  caller_is_admin boolean;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    select exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
    into caller_is_admin;

    if not caller_is_admin then
      raise exception
        'Only an admin may change listing_partners.status.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists listing_partners_prevent_self_approval on public.listing_partners;
create trigger listing_partners_prevent_self_approval
  before update on public.listing_partners
  for each row
  execute function public.prevent_listing_partner_self_approval();

drop trigger if exists listing_partners_set_updated_at on public.listing_partners;
create trigger listing_partners_set_updated_at
  before update on public.listing_partners
  for each row
  execute function public.set_updated_at();

create table if not exists public.property_listings (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.listing_partners (id) on delete cascade,

  title text not null check (length(trim(title)) > 0),
  description text,
  listing_type public.property_listing_type not null,
  price numeric,
  district text,
  village text,
  region public.region_id,

  status public.property_listing_status not null default 'draft',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.property_listings is
  'Sprint listing-partner-schema: standalone property listing owned by a listing_partners row. No FK to land_records -- see ADR-026 point 3. Publicly readable (anon) only when status=active and the parent partner is approved.';

create index if not exists property_listings_partner_id_idx
  on public.property_listings (partner_id);
create index if not exists property_listings_status_idx
  on public.property_listings (status);

alter table public.property_listings enable row level security;

-- SELECT (public): the one anon-readable policy in this entire schema.
-- Only active listings from an approved partner are ever visible here.
drop policy if exists "property_listings_select_public" on public.property_listings;
create policy "property_listings_select_public"
  on public.property_listings
  for select
  to anon, authenticated
  using (
    status = 'active'
    and exists (
      select 1
      from public.listing_partners lp
      where lp.id = property_listings.partner_id
        and lp.status = 'approved'
    )
  );

-- SELECT (own): a partner sees all of their own listings regardless of
-- status (e.g. their own drafts), which the public policy above would
-- not otherwise expose to them.
drop policy if exists "property_listings_select_own" on public.property_listings;
create policy "property_listings_select_own"
  on public.property_listings
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.listing_partners lp
      where lp.id = property_listings.partner_id
        and lp.id = (select auth.uid())
    )
  );

-- INSERT/UPDATE/DELETE: only an approved partner may create or modify
-- their own listings -- a pending/suspended/rejected partner cannot,
-- even for a listing that would otherwise belong to them.
drop policy if exists "property_listings_insert_approved_partner" on public.property_listings;
create policy "property_listings_insert_approved_partner"
  on public.property_listings
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.listing_partners lp
      where lp.id = partner_id
        and lp.id = (select auth.uid())
        and lp.status = 'approved'
    )
  );

drop policy if exists "property_listings_update_approved_partner" on public.property_listings;
create policy "property_listings_update_approved_partner"
  on public.property_listings
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.listing_partners lp
      where lp.id = partner_id
        and lp.id = (select auth.uid())
        and lp.status = 'approved'
    )
  )
  with check (
    exists (
      select 1
      from public.listing_partners lp
      where lp.id = partner_id
        and lp.id = (select auth.uid())
        and lp.status = 'approved'
    )
  );

drop policy if exists "property_listings_delete_approved_partner" on public.property_listings;
create policy "property_listings_delete_approved_partner"
  on public.property_listings
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.listing_partners lp
      where lp.id = partner_id
        and lp.id = (select auth.uid())
        and lp.status = 'approved'
    )
  );

drop trigger if exists property_listings_set_updated_at on public.property_listings;
create trigger property_listings_set_updated_at
  before update on public.property_listings
  for each row
  execute function public.set_updated_at();
