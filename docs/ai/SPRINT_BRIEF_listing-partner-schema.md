# Sprint Brief — `sprint-listing-partner-schema`

Follows the structure required by `docs/ai/SPRINT_TEMPLATE.md`. This is the
**first** sprint of the Listing Partner module (see `docs/ai/ARCHITECTURE_DECISIONS.md`
ADR-026 for the design decisions this brief implements) — schema + RLS
only. Backend TypeScript (repository/validation/write-coordinator, mirroring
`land-parties`/`documents` patterns) and UI are explicitly **separate, later
sprints**, not part of this one.

**This brief is a proposal.** Writing this file does not start the sprint —
per `docs/ai/SAFETY_RULES.md`, a migration against `sabahlot-dev` requires its
own explicit "go ahead" from the owner, separate from approving this brief's
content.

---

## Sprint ID
`sprint-listing-partner-schema`

## Objective
Add the `listing_partners` and `property_listings` tables (plus their
supporting enums, indexes, RLS policies, and `updated_at` triggers) to
`sabahlot-dev`, implementing ADR-026's three owner-decided design points:
public read of active listings from approved partners, manual admin-gated
partner approval, and a data model standalone from `land_records`. This
sprint does **not** write any TypeScript (no repository/validation/
write-coordinator/UI-sync files), does not touch `src/`, and does not create
the `listing-photos` Storage bucket (deferred — see Owner decisions required
below) or any Admin Dashboard UI.

## Base branch/commit
- Base branch: `main`
- Base commit: verify with `git rev-parse origin/main` immediately before
  starting (this brief was written from local branch
  `claude/adr-018-production-docs-q722el` at `7890f08`, itself based on
  `main@882c785` — re-verify, do not assume, since the AI-sprint pattern in
  this repo is always to branch from current `main`, not from a docs branch)

## Allowed files
- `supabase/migrations/20260804133614_create_listing_partner.sql` (new file
  only — originally created as `202608040001_create_listing_partner.sql`,
  chosen at brief-writing time to sort after the existing highest migration,
  `202607110012_harden_security_definer_privileges.sql`, and to avoid
  colliding with same-day numbering; renamed 2026-08-07 to match the version
  `apply_migration` actually recorded in `sabahlot-dev`'s `schema_migrations`
  at apply time — see `PROJECT_STATE.md`'s forty-third-pass entry)
- `docs/ai/PROJECT_STATE.md`, `docs/ai/MODULE_STATUS.md` (status update only,
  at the end of the sprint — same convention as every other merged sprint)
- `docs/ai/ARCHITECTURE_DECISIONS.md` — only to flip ADR-026's Status line
  from "Proposed" to "Accepted and implemented" once this sprint's migration
  is actually applied and verified; no other ADR text may change

## Forbidden files
- `.env*`, `package.json`, `package-lock.json`, Vercel config
- Any file under `src/` (this is a schema-only sprint — no client code)
- Any other file under `supabase/migrations/**` (existing migrations are
  append-only history; none may be edited)
- Any file outside "Allowed files" above

## Database operations
- **Environment:** `sabahlot-dev` (ref `xsflrehitrmobiyfbfhk`) **only** — same
  standing restriction as every other sprint in this repo. Beta/Production
  are forbidden regardless of any instruction in this brief.
- **DDL:** `CREATE TYPE` (3 new enums), `CREATE TABLE` (2 new tables),
  `CREATE INDEX`, `CREATE POLICY`, `CREATE TRIGGER`, `ALTER TABLE ... ENABLE
  ROW LEVEL SECURITY`. No `ALTER`/`DROP` of any existing table, enum,
  function, or policy.
- **DML:** none. This sprint creates empty tables; it does not seed data.
- Apply via `supabase/migrations/` + the project's normal migration
  application path (matching how `202607110001`–`012` were applied) — not
  raw `execute_sql` against a live project, consistent with every prior
  schema sprint in this repo.

## Proposed schema (precise spec — implement exactly, do not redesign)

```sql
-- Enums
create type public.listing_partner_status as enum (
  'pending', 'approved', 'suspended', 'rejected'
);
create type public.property_listing_status as enum (
  'draft', 'pending_review', 'active', 'under_offer', 'sold', 'leased', 'expired', 'removed'
);
create type public.property_listing_type as enum (
  'for_sale', 'for_lease'
);

-- listing_partners: one row per registered partner identity
create table public.listing_partners (
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

-- property_listings: standalone, no FK to land_records
create table public.property_listings (
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

create index listing_partners_status_idx on public.listing_partners (status);
create index property_listings_partner_id_idx on public.property_listings (partner_id);
create index property_listings_status_idx on public.property_listings (status);

alter table public.listing_partners enable row level security;
alter table public.property_listings enable row level security;

-- listing_partners RLS
-- SELECT: partner sees own row only. No anon/other-user access, ever --
-- even with public_contact_consent = true, this table itself stays private
-- (see ADR-026 point 4: consent gates a future copy into a public listing
-- row, not this table's own visibility).
create policy "listing_partners_select_own"
  on public.listing_partners for select to authenticated
  using ((select auth.uid()) = id);

-- INSERT: partner creates own row only, must start 'pending'
-- (self-approval blocked at the RLS layer here, AND at the trigger layer
-- below, mirroring create_profiles.sql's two-layer role-escalation guard).
create policy "listing_partners_insert_own"
  on public.listing_partners for insert to authenticated
  with check ((select auth.uid()) = id and status = 'pending');

-- UPDATE: partner may update their own row, but the trigger below blocks
-- them from changing `status` themselves; admin may update any row
-- (including status).
create policy "listing_partners_update_own"
  on public.listing_partners for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "listing_partners_update_admin"
  on public.listing_partners for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

-- Second layer: blocks a non-admin from changing their own `status`
-- (RLS USING/WITH CHECK cannot compare NEW.status vs OLD.status directly --
-- same reasoning as prevent_profile_role_escalation() in create_profiles.sql).
create function public.prevent_listing_partner_self_approval()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  caller_is_admin boolean;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
      into caller_is_admin;
    if not caller_is_admin then
      raise exception 'Only an admin may change listing_partners.status.';
    end if;
  end if;
  return new;
end;
$$;

create trigger listing_partners_prevent_self_approval
  before update on public.listing_partners
  for each row execute function public.prevent_listing_partner_self_approval();

create trigger listing_partners_set_updated_at
  before update on public.listing_partners
  for each row execute function public.set_updated_at();

-- property_listings RLS
-- SELECT (public): active listing from an approved partner, readable by
-- anyone -- the first anon-readable policy in this schema.
create policy "property_listings_select_public"
  on public.property_listings for select to anon, authenticated
  using (
    status = 'active'
    and exists (
      select 1 from public.listing_partners lp
      where lp.id = property_listings.partner_id and lp.status = 'approved'
    )
  );

-- SELECT (own, any status): a partner can see their own listings regardless
-- of status (e.g. their own 'draft' rows), which the public policy above
-- would not otherwise expose to them either (it only matches 'active').
create policy "property_listings_select_own"
  on public.property_listings for select to authenticated
  using (
    exists (select 1 from public.listing_partners lp where lp.id = property_listings.partner_id and lp.id = (select auth.uid()))
  );

-- INSERT/UPDATE/DELETE: partner acting on their own listings, only if their
-- partner row is currently 'approved' (a pending/suspended/rejected partner
-- cannot create or modify listings at all).
create policy "property_listings_insert_approved_partner"
  on public.property_listings for insert to authenticated
  with check (
    exists (select 1 from public.listing_partners lp where lp.id = partner_id and lp.id = (select auth.uid()) and lp.status = 'approved')
  );

create policy "property_listings_update_approved_partner"
  on public.property_listings for update to authenticated
  using (
    exists (select 1 from public.listing_partners lp where lp.id = partner_id and lp.id = (select auth.uid()) and lp.status = 'approved')
  )
  with check (
    exists (select 1 from public.listing_partners lp where lp.id = partner_id and lp.id = (select auth.uid()) and lp.status = 'approved')
  );

create policy "property_listings_delete_approved_partner"
  on public.property_listings for delete to authenticated
  using (
    exists (select 1 from public.listing_partners lp where lp.id = partner_id and lp.id = (select auth.uid()) and lp.status = 'approved')
  );

create trigger property_listings_set_updated_at
  before update on public.property_listings
  for each row execute function public.set_updated_at();
```

`public.set_updated_at()` already exists (`202607110001_create_helper_set_updated_at.sql`)
— reused, not redefined.

## Security invariants
- `auth.uid()` is the only source of truth for `listing_partners.id` on
  INSERT/UPDATE — never accepted from a caller-supplied field (ADR-005
  precedent, applied here for the first time to a non-`land_records`-rooted
  table).
- `listing_partners.status` can only ever move to `'approved'`/`'rejected'`/
  `'suspended'` through the admin-only trigger path — two independent layers
  (RLS `USING`/`WITH CHECK` restricting the row, and the trigger restricting
  the column value), mirroring `prevent_profile_role_escalation()`. A test
  must prove a non-admin's attempt to self-approve is rejected even if they
  bypass the RLS UPDATE policy's row match (i.e. the trigger is the backstop,
  not merely the RLS policy).
- `property_listings_select_public` must never expose a row whose parent
  `listing_partners.status` is not `'approved'`, even transiently (e.g. a
  partner suspended after their listings went active must lose public
  visibility on their very next read, not just on their next write).
- No policy anywhere in this migration exposes `listing_partners.phone`/
  `email`/`ren_number` to `anon` or another authenticated user, regardless of
  `public_contact_consent` — this migration does **not** implement the
  "copy consented fields into the public listing" mechanism described in
  ADR-026 point 4 (flagged as an owner-decision item below, out of scope for
  this schema-only sprint).
- RLS is the authorization boundary; no raw Postgres error may be assumed
  safe to surface to a client unmodified (matches the existing convention in
  every other coordinator, even though this sprint writes no coordinator).

## Owner decisions required (surfaced, not resolved, by this sprint)
1. **How does `public_contact_consent` actually get a partner's phone/email
   in front of a public visitor?** This migration does not implement a
   mechanism (e.g. a column on `property_listings` copying consented
   contact fields at listing-creation time, vs. a `SECURITY DEFINER` RPC
   that reveals contact info only for `active`+`approved` listings). Needs
   a decision before the backend sprint that will actually call these
   tables from TypeScript.
2. **`ren_number` requirement.** Currently nullable/optional. Confirm
   whether an unlicensed individual (not a REN-registered agent) is a
   legitimate "listing partner" for this product, or whether `ren_number`
   should become required + format-validated.
3. **Listing photos.** Deferred entirely from this sprint. A future sprint
   would need a `listing-photos` Storage bucket (public, unlike
   `land-documents`' signed-URL privacy model) plus either a `photo_urls`
   array column or a separate `property_listing_photos` table.
4. **Admin provisioning.** Same open item as `sprint-01b1-migration-plan.md`
   item 1 — nothing in this repo grants anyone `profiles.role = 'admin'`
   yet. This sprint's admin-only policies are inert (no admin exists to use
   them) until that separate, standing owner decision is made.
5. **Listing expiry/lifecycle.** No TTL or automatic transition to
   `'expired'` exists in this schema — `status` changes are entirely
   manual. Acceptable for a first sprint; flag for a future decision if
   stale listings become an issue.

## Acceptance criteria
- All 3 enums, both tables, all indexes, all 9 policies, both triggers, and
  the one new function apply cleanly to `sabahlot-dev` with no errors.
- A partner can INSERT their own `listing_partners` row with `status =
  'pending'`; an INSERT attempting any other status is rejected by the RLS
  `with check`.
- A non-admin authenticated user attempting `UPDATE ... SET status =
  'approved'` on their own `listing_partners` row is rejected by the
  trigger (`prevent_listing_partner_self_approval`), even when the RLS
  UPDATE-own policy would otherwise let the row-level UPDATE through.
- A user with `profiles.role = 'admin'` can update any `listing_partners`
  row's `status`.
- An `anon` (unauthenticated) `SELECT` against `property_listings` returns
  only rows where `status = 'active'` and the parent partner's `status =
  'approved'` — confirmed both for a matching row (returned) and for an
  `active` listing under a `pending`/`suspended` partner (not returned).
- A partner with `listing_partners.status != 'approved'` cannot INSERT,
  UPDATE, or DELETE any `property_listings` row, even one that would
  otherwise belong to them.
- `get_advisors` (security) run against `sabahlot-dev` after applying,
  reviewed for any new ERROR/WARN introduced by this migration specifically
  (pre-existing findings on unrelated tables are out of scope to fix here).

## Tests
- **Executed**, via `supabase/tests/` SQL-level policy tests (mirroring
  `supabase/tests/sprint-01b1-data-isolation-tests.sql`'s pattern) for every
  Acceptance Criteria bullet above that describes an RLS/trigger behavior.
- **Static assertion**: confirm via `list_tables`/schema inspection that no
  new table was created without `rls_enabled = true`.
- **Documented-only**: end-to-end behavior through a real Supabase Auth
  session (vs. SQL-level `set role`/impersonation testing) — no test-user
  session exists in this environment, same limitation already stated in
  ADR-025's Consequences.

## Static verification
No `src/` files change in this sprint, so `npx tsc --noEmit`/`npx eslint .`/
`npm run build` are not expected to be affected — still run all three per
`docs/ai/RELEASE_CHECKLIST.md` and report actual output, to positively
confirm this schema-only change did not somehow break the client build
(e.g. via a generated-types file, if one is regenerated as part of this
sprint).

## Stop conditions
- If `sabahlot-dev`'s current schema already has a `listing_partners`,
  `property_listings`, or any of the 3 new enum type names (collision) —
  halt and report, do not `DROP`/rename anything to make room.
- If `public.profiles.role` does not exist or does not include `'admin'` in
  its enum values at execution time (i.e. the schema has drifted from what
  this brief assumes) — halt and report per `CLAUDE.md`'s standing
  instruction, do not invent a workaround.
- If `public.set_updated_at()` does not exist — halt (this sprint assumes
  and reuses it, does not redefine it).

## Required report
Structure per `docs/ai/SPRINT_TEMPLATE.md`: Repository state → Files →
Cloud operations → Security → Tests/Verification → Findings → Decision
(PASS / CHANGES REQUIRED / BLOCKED).

## Commit/push/PR restrictions
- **Commit:** not authorized by this brief alone. This brief documents the
  design; a separate, explicit "start this sprint" / "commit" instruction
  from the owner is required before any migration file is written or
  applied, per `CLAUDE.md`'s standing rule that prior approval of a design
  does not carry forward to the next git/database action.
- **Push:** not authorized by this brief.
- **Merge to `main`:** always requires explicit owner approval regardless of
  anything in this brief, per standing repo policy.
