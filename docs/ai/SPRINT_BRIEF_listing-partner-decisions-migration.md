# Sprint Brief — `sprint-listing-partner-decisions-migration`

Follows the structure required by `docs/ai/SPRINT_TEMPLATE.md`. Implements the
two items from ADR-027 that actually require a schema/RLS change: the
public contact-reveal function, and the 90-day virtual-expiry RLS update.
Items 2-4 from ADR-027 (ren_number optional, photos deferred, admin
provisioning manual) require **no code in this sprint** — they are
decisions to keep the existing default.

**This brief is a proposal.** Writing this file does not start the sprint —
a separate, explicit "mula sprint" instruction is required, same convention
as every prior sprint in this arc.

---

## Sprint ID
`sprint-listing-partner-decisions-migration`

## Objective
Add one `SECURITY DEFINER` function (`get_active_listing_contact`) and
replace one existing RLS policy (`property_listings_select_public`) on
`sabahlot-dev`. No new table, no new enum, no TypeScript, no UI.

## Base branch/commit
Verify `git rev-parse origin/main` immediately before starting, same
standing convention. Development happens on the session's designated
branch per the active CCR harness instructions, not a fresh sprint branch.

## Allowed files
- `supabase/migrations/20260804142918_listing_partner_contact_and_expiry.sql` (new)
- `docs/ai/ARCHITECTURE_DECISIONS.md` — flip ADR-027's Status line once
  applied and verified
- `docs/ai/PROJECT_STATE.md`, `docs/ai/MODULE_STATUS.md` — status update
  only, at the end
- Optionally: `src/lib/listing-partners/property-listings-repository.ts`
  gains one new function, `getActiveListingContact(supabase, listingId)`,
  calling `.rpc("get_active_listing_contact", { listing_id: listingId })`
  — small enough to fold into this sprint rather than opening a fourth
  backend sprint; **only** if the migration itself is confirmed working
  first (do not write this before the function exists and is verified in
  `sabahlot-dev`)

## Forbidden files
- Any existing migration file (append-only; `20260804133614_create_listing_partner.sql`
  is not edited, only superseded additively by the new file)
- Any UI file
- `.env*`, `package.json`, `package-lock.json`, Vercel config

## Database operations
- **Environment:** `sabahlot-dev` only.
- **DDL:** `CREATE FUNCTION` (new), `DROP POLICY` + `CREATE POLICY` (replaces
  `property_listings_select_public` with an updated `USING` clause — same
  policy name, same table, additive intent, not a new authorization
  surface). No `ALTER TABLE`, no new column, no new enum.
- **No DML.**

## Exact SQL (implement precisely, do not redesign)

```sql
create or replace function public.get_active_listing_contact(listing_id uuid)
returns table(phone text, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select lp.phone, lp.email
    from public.property_listings pl
    join public.listing_partners lp on lp.id = pl.partner_id
    where pl.id = listing_id
      and pl.status = 'active'
      and lp.status = 'approved'
      and lp.public_contact_consent = true;
end;
$$;

grant execute on function public.get_active_listing_contact(uuid) to anon, authenticated;

drop policy if exists "property_listings_select_public" on public.property_listings;
create policy "property_listings_select_public"
  on public.property_listings
  for select
  to anon, authenticated
  using (
    status = 'active'
    and updated_at > (now() - interval '90 days')
    and exists (
      select 1
      from public.listing_partners lp
      where lp.id = property_listings.partner_id
        and lp.status = 'approved'
    )
  );
```

## Security invariants
- `get_active_listing_contact` returns **zero rows** (not an error, not a
  null-filled row) for a listing that is not `active`, whose partner is not
  `approved`, or whose partner has not consented — a caller cannot
  distinguish "listing doesn't exist" from "conditions not met" from this
  function alone (same non-disclosure posture as ADR-004, applied to
  contact-reveal eligibility).
- The function never accepts or returns anything about `listing_partners`
  beyond `phone`/`email` for the one matched row — no `id`, no `ren_number`,
  no `bio`, nothing that could be used to enumerate partners.
- `listing_partners`' own RLS is **unchanged** — this function is the only
  new path by which `phone`/`email` become reachable by `anon`, and only
  under the three-condition gate above, re-evaluated on every call (never a
  cached/materialized value).
- The `property_listings_select_public` replacement is a **strict
  narrowing** — every row it returns today must still satisfy the original
  two conditions (`status='active'` + parent `approved`) plus the new
  `updated_at` freshness check. It must never become broader.

## Acceptance criteria
- `get_active_listing_contact` returns exactly one row (the correct
  phone/email) for a listing that is active, whose partner is approved and
  consented.
- Returns zero rows when: the listing is not `active`; the partner is not
  `approved`; the partner has `public_contact_consent = false`; or
  `listing_id` does not exist at all — all four cases indistinguishable
  from the caller's perspective.
- Callable by an `anon` role (not just `authenticated`) — confirmed via
  `grant`.
- A previously-visible `property_listings_select_public` row whose
  `updated_at` is more than 90 days old is no longer returned by that
  policy; a row updated within 90 days still is (all else unchanged from
  ADR-026's original two conditions).
- `get_advisors` (security) re-run after applying; any new finding
  specifically about the new `SECURITY DEFINER` function is expected and
  reviewed (not silently dismissed), not treated as a regression on its own
  — compared against what `handle_new_user()` already triggers, if
  anything, for a sense of baseline.

## Tests
- **Executed** (if `sabahlot-dev` state allows, i.e. real `auth.users`
  identities become available — otherwise **documented-only**, same
  limitation already accepted for `sprint-listing-partner-schema`'s own
  RLS test plan): direct `execute_sql` calls to
  `select * from get_active_listing_contact('<id>')` against seeded rows
  covering all four zero-row cases plus the one success case.
- **Static assertion**: `list_migrations`/`get_advisors` confirm the
  migration applied and no new ERROR-level finding appeared.

## Static verification
`npx tsc --noEmit`, `npx eslint .`, `npm run build` — expected unaffected
unless the optional `getActiveListingContact` TypeScript function (see
Allowed files) is also added this sprint, in which case
`property-listings-write.qa.ts` gains a corresponding test.

## Stop conditions
- If `property_listings_select_public` does not exist, or its current
  `USING` clause text does not match what ADR-026/`sprint-listing-partner-schema`
  recorded — halt, re-verify via `pg_policies` before proceeding, do not
  assume.
- If `get_active_listing_contact` (or any function with that name) already
  exists with a different signature — halt and report, do not silently
  overwrite.

## Required report
Structure per `docs/ai/SPRINT_TEMPLATE.md`: Repository state → Files →
Cloud operations → Security → Tests/Verification → Findings → Decision
(PASS / CHANGES REQUIRED / BLOCKED).

## Commit/push/PR restrictions
- **Commit:** not authorized by this brief alone — requires a separate,
  explicit "start"/"commit" instruction.
- **Push:** not authorized by this brief.
- **Merge to `main`:** always requires explicit owner approval regardless.
