# Sprint Brief — `sprint-listing-partner-admin-approval-ui`

Follows the structure required by `docs/ai/SPRINT_TEMPLATE.md`. This is the
**fourth and final UI sprint** of the Listing Partner module — an admin
screen to review and act on `listing_partners` registrations
(approve/reject/suspend). After this ships, all 4 planned UI pieces exist.

**This brief is a proposal.** Writing this file does not start the sprint —
a separate, explicit "mula sprint" instruction is required, same convention
as every prior sprint in this arc.

---

## Sprint ID
`sprint-listing-partner-admin-approval-ui`

## Objective
A new route, `src/app/listing-partners/admin/page.tsx` (+ its own CSS
module), where a signed-in user with `profiles.role = 'admin'` can see
every `listing_partners` registration (any status) and change a given
partner's status (approve/reject/suspend/re-approve) via the
already-built, unmodified `updateListingPartnerStatus` coordinator.

## Backend gap found, and what this sprint does about it
**There is currently no way for an admin to browse `listing_partners` at
all.** `listing_partners`' only SELECT policy is `listing_partners_select_own`
(a partner sees their own row). `listing_partners_update_admin` lets an
admin **update** any row's status, but nothing lets them **discover** which
rows exist or which are `pending` — as the schema stands today, the only
way an admin could approve anyone is to already know the exact partner
`id` (e.g. read directly via SQL Editor, the interim workflow ADR-027 item
4 describes). This sprint adds one new RLS policy,
`listing_partners_select_admin` (any row, when the caller has
`profiles.role = 'admin'`), and one new repository function,
`listAllListingPartnersRow(supabase)` — the first genuinely
admin-broad-read policy in this schema.

## Design decisions (read before implementing)

1. **Route: `/listing-partners/admin`, not `/admin`.** `docs/ai/MODULE_STATUS.md`
   already tracks a separate, much larger, **Not started** "Admin Dashboard"
   module (general site-wide admin). This screen is narrowly scoped to
   Listing Partner registrations only — nesting it under
   `/listing-partners/**` (the existing partner-portal segment) signals
   that scope and avoids colliding with whatever route the future, general
   Admin Dashboard eventually claims.
2. **Access gate: session AND `profiles.role === 'admin'`, checked
   client-side before rendering anything sensitive.** RLS is still the
   real enforcement boundary (a non-admin's query would return nothing
   useful regardless, per ADR-006) — this client-side check exists purely
   so a non-admin visiting the URL sees a clear "bukan admin" message
   instead of a confusingly-empty admin table. Implemented as a small,
   **page-local** helper (a direct `supabase.from("profiles").select("role")...`
   call inside `admin/page.tsx` itself) rather than a new shared
   `src/lib/profiles/` module — `profiles` is Foundation-owned shared data,
   and this is one narrow read used by exactly one screen; introducing a
   new module for it would be over-scoped for what's needed. Flagged here
   as a deliberate call, not an oversight, in case a second admin screen
   later wants to reuse this check (at that point, promoting it to a
   shared helper would be the right move).
3. **All statuses shown, not just `pending`.** An admin needs to suspend an
   already-approved partner too, or re-approve a previously-rejected one —
   scoping this screen to `pending`-only would make it useless for
   anything past first review. Client-side, `pending` rows sort first
   (need action), then the rest by `created_at` descending — no new DB
   query complexity for this; `listAllListingPartnersRow` itself is a
   plain `ORDER BY created_at DESC`, and the pending-first grouping is
   done in the UI after fetch.
4. **Action set per row depends on current status:**
   - `pending` → "Luluskan" / "Tolak"
   - `approved` → "Gantung"
   - `suspended` → "Luluskan semula"
   - `rejected` → "Luluskan"
   Every action calls the same, already-built, unmodified
   `updateListingPartnerStatus(supabase, partnerId, newStatus)` — this
   sprint adds no new write path, only a new read path (the RLS policy +
   repository function above) and the UI to drive the existing writes.
5. **No self-service admin bootstrap.** This screen never offers a way to
   grant `admin` to anyone — that stays exactly as manual as ADR-027 item 4
   already decided (Supabase Dashboard/SQL Editor, owner-only). This sprint
   is genuinely unusable by anyone until the owner manually grants
   `profiles.role = 'admin'` to at least one account — call this out in the
   report as an expected condition, not a defect, same posture as the
   empty-directory note from the prior sprint.

## Base branch/commit
Verify `git rev-parse origin/main` immediately before starting. Development
happens on the session's designated branch per the active CCR harness
instructions.

## Allowed files
- `src/app/listing-partners/admin/page.tsx` (new)
- `src/app/listing-partners/admin/listing-partners-admin.module.css` (new)
- `src/lib/listing-partners/listing-partners-repository.ts` (existing —
  additive: one new function, `listAllListingPartnersRow`)
- `supabase/migrations/<next>_listing_partners_admin_read.sql` (new — one
  `CREATE POLICY listing_partners_select_admin`, no other schema change)
- `docs/ai/ARCHITECTURE_DECISIONS.md` — a new ADR entry recording the new
  admin-read policy, once implemented
- `docs/ai/PROJECT_STATE.md`, `docs/ai/MODULE_STATUS.md` — status update
  only, at the end

## Forbidden files
- `src/lib/listing-partners/listing-partners-write-coordinator.ts` — no
  changes; `updateListingPartnerStatus` is reused exactly as-is
- `src/lib/listing-partners/property-listings-*.ts` — untouched, this
  sprint is about `listing_partners` review only
- `src/app/listings/**`, `src/app/listing-partners/page.tsx`,
  `src/app/listing-partners/listings/**` — the other 3 UI pieces are
  unaffected
- `.env*`, `package.json`, `package-lock.json`, Vercel config

## Database operations
One new RLS policy against `sabahlot-dev` only, applied via
`apply_migration`:
```sql
create policy "listing_partners_select_admin"
  on public.listing_partners
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
This is a second, independent permissive SELECT policy alongside the
existing `listing_partners_select_own` — Postgres combines multiple
permissive policies with `OR`, so this only ever **adds** visibility
(an admin sees their own row via either policy, and every other row via
this new one); it can never narrow what `listing_partners_select_own`
already allows a non-admin partner to see of their own data.

## Security invariants
- The new RLS policy grants **read only** — it does not touch
  `listing_partners_update_admin`/`listing_partners_update_own`/the
  `prevent_listing_partner_self_approval` trigger, all unchanged from
  ADR-026. An admin's ability to browse all rows is not new write power.
- `listAllListingPartnersRow` never accepts or checks a role/permission
  argument itself (ADR-006) — RLS is what actually restricts a non-admin
  caller to seeing nothing useful; this function only issues the query.
- The client-side "am I admin" check (Design decision 2) is UX only, never
  the security boundary — must be phrased in the report and in code
  comments as such, not as if it were the real access control.
- Every status-change action still goes through
  `updateListingPartnerStatus`'s existing non-disclosing failure mapping
  (`not_authorized_or_not_found`, never distinguishing "not admin" from
  "partner doesn't exist") — this sprint must not add a more detailed
  error path that would leak which case occurred.

## Acceptance criteria
- Signed-out visitor sees the sign-in prompt; no `listing_partners` query
  attempted.
- Signed-in, non-admin visitor sees a clear "access requires admin" message
  (in Malay); no partner table rendered, no status-change actions offered.
- Signed-in admin sees every `listing_partners` row, `pending` ones sorted
  first, each showing at minimum `displayName`, `phone`, `email`,
  `renNumber`, `status`, and `createdAt`.
- Clicking an action button (per Design decision 4's per-status set) calls
  `updateListingPartnerStatus` and the row's displayed status updates
  without a manual page reload.
- A failed status-change action (e.g. a stale row whose status already
  changed elsewhere) surfaces a plain-language error, never a raw
  Supabase/Postgres message.
- `listAllListingPartnersRow` called by a genuinely non-admin authenticated
  session returns zero rows (RLS-enforced) — the client-side gate from
  Design decision 2 is a UX convenience on top of this, not a substitute
  for it; both must be true.

## Tests
No `.qa.ts` script — UI sprint, same convention as the prior three UI
sprints. Verification:
- **Interactive**, via a live `next dev` server, reusing the now-proven
  approach from the prior two UI sprints: `context.addCookies()` with
  `@supabase/ssr`'s real cookie format for an authenticated session, mocked
  REST responses for `listing_partners` (including a mocked `profiles`
  response for the admin-role check), and `serviceWorkers: 'block'` on the
  browser context (root-caused two sprints ago) to avoid the PWA service
  worker silently 503-ing every mocked request.
- Test both the non-admin-rejected path and the admin-sees-everything path
  — a mocked session alone isn't enough; the mocked `profiles` response's
  `role` value is what actually distinguishes the two states in this test
  harness (real RLS enforcement itself remains unverified end-to-end here,
  same documented-only limitation as every other sprint's RLS testing).
- Existing `.qa.ts` suites re-run unchanged as a regression check.

## Static verification
`npx tsc --noEmit`, `npx eslint .`, `npm run build`, plus the interactive
pass above.

## Stop conditions
- If `listing_partners_select_own`'s or `listing_partners_update_admin`'s
  current RLS text does not match what ADR-026 recorded (re-verify via
  `pg_policies`) — halt, report the discrepancy, do not assume.
- If `profiles.role` is not readable via `profiles_select_own` for the
  querying user's own row (re-verify against `create_profiles.sql`'s
  actual, current policy) — halt; the admin-check design depends on this.

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
All 4 planned UI pieces for the Listing Partner module will exist. Genuine
end-to-end usability still depends on 2 things outside any sprint's
control: (1) the owner manually granting `profiles.role = 'admin'` to a
real account (ADR-027 item 4, still entirely manual by design), and (2) at
least one real partner actually registering, getting approved, and
publishing a listing. Neither is a code gap — both are expected,
owner-driven next steps once this ships.
