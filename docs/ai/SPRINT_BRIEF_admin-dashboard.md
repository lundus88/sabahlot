# Sprint Brief — `sprint-admin-dashboard`

Follows the structure required by `docs/ai/SPRINT_TEMPLATE.md`. This is the
**first scoped slice** of the previously-"Not started" Admin Dashboard
module (`docs/ai/MODULE_STATUS.md`) — an operational monitoring view for
admins: member growth, listing-partner status breakdown, active-listing
counts. **Read-only monitoring, not a management console** — no
user-role-editing UI, no write path of any kind.

**This brief is a proposal.** Writing this file does not start the sprint —
a separate, explicit "mula sprint" instruction is required, same convention
as every prior sprint in this arc.

---

## Sprint ID
`sprint-admin-dashboard`

## Objective
A new route, `src/app/admin/page.tsx` (+ its own CSS module), where a
signed-in user with `profiles.role = 'admin'` sees operational stats about
the app: total registered members with a growth chart (last 30 days),
listing-partner counts by status, and active property-listing counts with
a region breakdown. Explicitly **excludes** `land_records` (the app's most
sensitive table — private land-case data) and any write/management
capability (approving partners, editing roles, etc. all stay on their
existing dedicated screens/processes).

## Backend gap found, and what this sprint does about it
**There is currently no way for an admin to read `profiles` beyond their
own row.** Confirmed via `pg_policies` (2026-08-04): `profiles`' only
SELECT policy is `profiles_select_own`. `listing_partners` and
`property_listings` already have an admin/public read path
(`listing_partners_select_admin` from ADR-029, `property_listings_select_public`
from ADR-026) — those need no new policy. This sprint adds exactly one new
RLS policy, `profiles_select_admin`, structured identically to
`listing_partners_select_admin` (ADR-029) — any row readable when the
caller has `profiles.role = 'admin'`, additive/permissive alongside the
existing own-row policy.

## Design decisions (read before implementing)

1. **Route: `/admin`, not nested under `/listing-partners/**`.** This is
   the first screen for the general Admin Dashboard module that
   `docs/ai/MODULE_STATUS.md` has tracked as "Not started" since the
   Listing Partner admin screen was deliberately routed to
   `/listing-partners/admin` specifically to leave `/admin` free for this.
2. **Promote the admin-role check to a shared helper.** The Listing
   Partner admin sprint brief explicitly flagged its page-local
   `profiles.role` check as "a deliberate call... in case a second admin
   screen later wants to reuse this check (at that point, promoting it to
   a shared helper would be the right move)." That moment is now. This
   sprint adds `src/lib/admin/use-admin-guard.ts` (or equivalent — exact
   shape decided during implementation) — a small, narrow hook/function
   that resolves `{ sessionChecked, currentUserId, roleChecked, isAdmin }`
   — and refactors `src/app/listing-partners/admin/page.tsx` to use it too,
   deleting its now-duplicated inline version. This is the one sprint-scope
   touch to a file outside this sprint's own new files, and it's additive
   in effect (same behavior, no functional change to the Listing Partner
   admin screen) — still, re-verify that screen's existing acceptance
   criteria still hold after the refactor, not just this sprint's new page.
3. **No new npm dependency for charts.** This repo has never added a
   charting library (`package.json` is a standing forbidden file outside
   an explicitly-scoped dependency sprint). The growth-over-time chart and
   status/region breakdowns are hand-built with plain SVG/CSS — a simple
   bar or sparkline shape is enough; this is a monitoring view, not a data
   product.
4. **Time-series granularity: daily counts, last 30 days, hardcoded.** No
   date-range picker, no configurability — a fixed 30-day window computed
   from `profiles.created_at`. Flagged as a default choice, not an
   owner-mandated one; easy to extend later if wanted.
5. **`region` can be null.** `profiles.region` has no `not null` constraint
   — a member who never set a region must appear in its own "Tidak
   dinyatakan" bucket in the region breakdown, not be silently dropped or
   crash the chart.
6. **Listing-partner/property-listing stats reuse existing repository
   functions where possible** (`listAllListingPartnersRow`,
   `listActivePropertyListingsRow` from `src/lib/listing-partners/`) rather
   than duplicating queries — this sprint's own repository file only needs
   to add the new `profiles`-based stats. Note `listActivePropertyListingsRow`
   only returns publicly *active* listings (via `property_listings_select_public`'s
   RLS) — this sprint's "active listing count" stat is scoped to that same
   definition, not a true admin-wide count of every status; a full
   all-status property-listing count is out of scope (would need its own
   new RLS policy, not requested here).

## Base branch/commit
Verify `git rev-parse origin/main` immediately before starting.

## Allowed files
- `src/app/admin/page.tsx` (new)
- `src/app/admin/admin-dashboard.module.css` (new)
- `src/lib/admin/use-admin-guard.ts` (new — shared admin-check helper)
- `src/lib/admin/dashboard-stats-repository.ts` (new — `profiles`-based
  stats queries only; reuses existing listing-partner/property-listing
  repository functions by import, does not duplicate them)
- `src/lib/admin/dashboard-stats.qa.ts` (new, if a query-shape/mapper is
  complex enough to warrant one — decide during implementation)
- `src/app/listing-partners/admin/page.tsx` (existing — refactor only, to
  use the new shared `use-admin-guard.ts`; no behavior change)
- `supabase/migrations/<next>_profiles_admin_read.sql` (new — one
  `CREATE POLICY profiles_select_admin`, no other schema change)
- `docs/ai/ARCHITECTURE_DECISIONS.md` — a new ADR entry recording the new
  policy, once implemented
- `docs/ai/PROJECT_STATE.md`, `docs/ai/MODULE_STATUS.md` — status update
  only, at the end

## Forbidden files
- `package.json`, `package-lock.json` — no charting library, no new
  dependency of any kind
- `supabase/migrations/**land_records**` or any policy touching
  `land_records` — this sprint does not touch that table at all
- `src/lib/listing-partners/**` write-coordinator/validation files — reused
  read-only via existing exports, never modified
- Any file implementing role editing, partner-status changes, or any other
  write path — this sprint is read-only, full stop
- `.env*`, Vercel config

## Database operations
One new RLS policy against `sabahlot-dev` only, applied via
`apply_migration`:
```sql
create policy "profiles_select_admin"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );
```
Same second-independent-permissive-policy shape as ADR-029 — Postgres
combines multiple permissive policies with `OR`, so this only ever **adds**
visibility for an admin caller; it can never narrow what
`profiles_select_own` already allows a non-admin user to see of their own
row. No INSERT/UPDATE/DELETE policy is touched — `profiles_insert_own`,
`profiles_update_own`, and the `prevent_profile_role_escalation` trigger
are all unchanged.

## Security invariants
- The new policy grants **read only** — no write capability is added
  anywhere in this sprint.
- `profiles_select_admin` never exposes anything beyond what's already in
  the `profiles` table (`full_name`, `phone`, `role`, `region`,
  `created_at`/`updated_at`) — the dashboard's own queries should select
  only the columns actually needed for stats (e.g. `created_at`, `region`)
  rather than pulling `phone`/`full_name` for every row unnecessarily,
  even though RLS would permit it.
- `use-admin-guard.ts` (the shared helper) is explicitly UX-only, same
  posture as the original Listing Partner admin brief — RLS is the real
  boundary; a non-admin visiting `/admin` sees a clear message, never a
  silently-empty or broken dashboard.
- `land_records` is not queried, referenced, or aggregated anywhere in
  this sprint's code.

## Acceptance criteria
- Signed-out visitor sees a sign-in prompt at `/admin`; no `profiles`
  aggregate query attempted.
- Signed-in, non-admin visitor sees a clear "access requires admin"
  message (Malay); no stats rendered.
- Signed-in admin sees: total member count, a 30-day daily growth chart,
  listing-partner counts broken down by status (pending/approved/
  suspended/rejected), active property-listing count, and a member region
  breakdown (including a "Tidak dinyatakan" bucket for null `region`).
- A member with `region = null` appears in the "Tidak dinyatakan" bucket,
  not omitted and not crashing the chart.
- `src/app/listing-partners/admin/page.tsx` still passes all of its own
  original acceptance criteria (from `SPRINT_BRIEF_listing-partner-admin-approval-ui.md`)
  after being refactored to use the shared guard — re-verify, not assumed.
- A genuinely non-admin authenticated session querying the new
  `profiles`-stats repository function returns zero/empty rows
  (RLS-enforced) — the client-side gate is a UX convenience on top of
  this, not a substitute for it.

## Tests
No `.qa.ts` script strictly required for the page itself (UI sprint,
same convention as every prior admin/UI sprint in this arc) — but *do* add
one for `dashboard-stats-repository.ts` if its date-bucketing/aggregation
logic is non-trivial enough to be worth a regression test (judgment call
during implementation). Verification:
- **Interactive**, via a live `next dev` server: mocked `@supabase/ssr`
  session cookie, mocked `profiles`/`listing_partners`/`property_listings`
  REST responses, `serviceWorkers: 'block'` (the now-proven approach from
  every prior admin/UI sprint). Test signed-out, signed-in non-admin, and
  signed-in admin (verify the growth chart, status breakdown, and region
  breakdown all render correctly from mocked data, including a null-region
  row landing in "Tidak dinyatakan").
- Re-verify `/listing-partners/admin`'s existing interactive test scenarios
  still pass after the shared-guard refactor.
- Existing `.qa.ts` suites re-run unchanged as a regression check.

## Static verification
`npx tsc --noEmit`, `npx eslint .`, `npm run build`, plus the interactive
pass above.

## Stop conditions
- If `profiles_select_own`'s current RLS text does not match what
  `create_profiles.sql` originally defined (re-verify via `pg_policies`)
  — halt, report the discrepancy, do not assume.
- If refactoring `/listing-partners/admin/page.tsx` to use the shared
  guard would require changing its rendered states/copy in any way beyond
  the internal check mechanism — halt and report; this sprint's refactor
  must be behavior-preserving only.

## Required report
Structure per `docs/ai/SPRINT_TEMPLATE.md`: Repository state → Files →
Cloud operations → Security → Tests/Verification → Findings → Decision
(PASS / CHANGES REQUIRED / BLOCKED).

## Commit/push/PR restrictions
- **Commit:** not authorized by this brief alone — requires a separate,
  explicit "start"/"commit" instruction.
- **Push:** not authorized by this brief.
- **Merge to `main`:** always requires explicit owner approval regardless.

## After this sprint
The Admin Dashboard module moves from "Not started" to "first slice
shipped" — a read-only operational view. Genuine future expansion
(user-role management UI, activity-log viewer once `activity_logs` gets an
admin-read policy, land-record oversight if ever decided) all stay as
separate, explicitly-scoped future sprints — this sprint does not assume
or half-build toward any of them.
