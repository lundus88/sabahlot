# Sprint Brief — `sprint-listing-partner-public-directory-ui`

Follows the structure required by `docs/ai/SPRINT_TEMPLATE.md`. This is the
**third UI sprint** of the Listing Partner module — the public-facing side:
a directory of active listings, and an individual listing detail page with
contact reveal. The admin approval screen remains out of scope, a future
sprint.

**This brief is a proposal.** Writing this file does not start the sprint —
a separate, explicit "mula sprint" instruction is required, same convention
as every prior sprint in this arc.

---

## Sprint ID
`sprint-listing-partner-public-directory-ui`

## Objective
Two new routes, both fully public (no session required, no sign-in prompt
anywhere on either page):
- `src/app/listings/page.tsx` — a directory of every currently-public
  listing (per `property_listings_select_public`'s exact RLS conditions:
  `status = 'active'`, `updated_at` within 90 days, parent partner
  `approved`).
- `src/app/listings/[id]/page.tsx` — one listing's full detail, with an
  explicit, click-to-reveal contact action calling the existing
  `get_active_listing_contact` RPC.

Deliberately **not** under `/listing-partners/**` — that path segment now
reads as "partner portal" (registration, profile, own-listing management,
all session-gated); the public-facing pages get their own top-level
`/listings` segment to signal "this is for visitors," not partners.

## Backend gap found, and what this sprint does about it
No function exists to list **public** listings at all —
`listOwnPropertyListingsRow` (from `sprint-listing-partner-my-listings-ui`)
is scoped to one partner's own rows, `getPropertyListingById` fetches one
row by id. This sprint adds `listActivePropertyListingsRow(supabase)` — a
plain, no-argument SELECT that relies entirely on
`property_listings_select_public`'s RLS to do the filtering (no
`.eq("status", "active")` filter needed in the query itself — RLS already
guarantees only eligible rows are ever returned to an `anon` caller). No
migration, no new RLS.

## Decided: a public listing DOES show who posted it (option 1)
**Resolved by the owner, 2026-08-04, before implementation started.**
Today, `listing_partners` has zero `anon` read access on any column
(ADR-026), and `get_active_listing_contact` returns only `phone`/`email` —
**no `display_name`/`company_name`**. This means, as the schema stands
today, a public listing page can show the listing's own fields (title,
price, description, location) but has **no way to show which partner
posted it**, even after contact reveal — a visitor who clicks "reveal
contact" gets a bare phone number and email with no name attached. The
owner chose **option 1**: extend `get_active_listing_contact` to also
return `display_name`/`company_name`, gated by the exact same three
conditions as `phone`/`email` (active + approved + consented) — this
sprint therefore DOES include the small migration described below, not
just UI.

Two ways to close this gap:
1. **Extend `get_active_listing_contact`'s return columns** to also include
   `display_name` and `company_name` (small migration: `CREATE OR REPLACE
   FUNCTION`, same three-condition gate, no RLS change) — contact reveal
   then shows "Ah Chong Land Services — +6012xxxxxxx — a@example.com"
   together, consistent with the existing consent model (all shown only
   once, all under the same `public_contact_consent` gate).
2. **Leave it as-is for this sprint** — listings appear attributed only to
   "SabahLot Listing Partner" (generic), with phone/email revealed on
   request but no name ever shown anywhere. Simpler, ships today, no
   migration.
**Recommendation: option 1** — a visitor deciding whether to call a number
reasonably wants to know who they're calling, and it's a small, consistent
extension of a mechanism that already exists and is already scoped by the
same consent flag. But this is presented as a decision, not assumed.

## Design decisions (read before implementing)

1. **No pagination in v1.** Directory shows every eligible row from
   `listActivePropertyListingsRow`, most-recently-updated first, no
   `LIMIT`/offset/infinite-scroll. Acceptable given the module has no real
   partners/listings yet (nothing has shipped past `sabahlot-dev`); revisit
   once real listing volume exists.
2. **No filters/search in v1** (by region, listing type, price range) —
   same reasoning as pagination; a small, empty-or-near-empty directory
   doesn't need them yet.
3. **Contact reveal is explicit, never automatic.** The detail page never
   calls `get_active_listing_contact` on load — only when the visitor
   clicks a "Papar maklumat hubungan" button. Reduces unnecessary RPC
   calls and avoids passively exposing contact data to scrapers that just
   render the page.
4. **A directly-guessed/bookmarked listing id that is no longer public**
   (partner suspended, listing set to `draft`/`removed`, or gone stale past
   90 days) must render the same "not found" state as a genuinely
   non-existent id — RLS already guarantees `getPropertyListingById`
   returns nothing for such a row to an `anon` caller; the page must not
   layer on any additional logic that could accidentally leak more (e.g.
   never fall back to a cached/previous render of the same id).
5. **Empty directory is an expected near-term state, not a bug.** With
   zero real approved partners today (admin provisioning is still manual,
   ADR-027 item 4), the directory will likely render "Tiada listing aktif
   buat masa ini" for a while after this ships — call this out in the
   report, don't treat it as a defect to chase.

## Base branch/commit
Verify `git rev-parse origin/main` immediately before starting. Development
happens on the session's designated branch per the active CCR harness
instructions.

## Allowed files
- `src/app/listings/page.tsx` (new)
- `src/app/listings/[id]/page.tsx` (new)
- `src/app/listings/listings.module.css` (new, shared by both pages in
  this segment)
- `src/lib/listing-partners/property-listings-repository.ts` (existing —
  additive: one new function, `listActivePropertyListingsRow`)
- `src/lib/listing-partners/types.ts` (existing — additive:
  `PropertyListingContact` gains `displayName`/`companyName` fields,
  matching the migration below)
- `supabase/migrations/<next>_listing_contact_partner_name.sql` (new —
  `CREATE OR REPLACE FUNCTION public.get_active_listing_contact`, adding
  `display_name`/`company_name` to the `RETURNS TABLE` clause, same
  `SECURITY DEFINER`/three-condition body otherwise unchanged)
- `src/lib/listing-partners/index.ts` (no change expected — already barrel
  exports `property-listings-repository.ts`)
- `docs/ai/ARCHITECTURE_DECISIONS.md` — a short new ADR entry recording
  this decision (extending `get_active_listing_contact`'s return columns),
  once implemented
- `docs/ai/PROJECT_STATE.md`, `docs/ai/MODULE_STATUS.md` — status update
  only, at the end

## Forbidden files
- `src/app/listing-partners/**` — the partner-portal pages are unaffected
- `src/lib/listing-partners/listing-partners-*.ts`,
  `property-listings-write-coordinator.ts`, `property-listings-validation.ts`
  — no write path changes; this sprint is read-only
- `.env*`, `package.json`, `package-lock.json`, Vercel config

## Database operations
- `listActivePropertyListingsRow`: no migration — a plain SELECT against
  existing RLS.
- `get_active_listing_contact` extension: one `CREATE OR REPLACE FUNCTION`
  against `sabahlot-dev` only, applied via `apply_migration`, verified via
  `information_schema.routines`/a direct test call, same rigor as
  `sprint-listing-partner-decisions-migration`.

## Security invariants
- `listActivePropertyListingsRow` and `getPropertyListingById` (reused,
  unmodified) are never called with any credential/session assumption —
  both must work correctly for a genuinely anonymous `supabase` client (no
  `auth.getUser()` check gating access to either page, unlike every other
  route in this module so far).
- Contact reveal never fires without an explicit click; the button's
  disabled/loading state must make a double-submit (double RPC call) hard
  to trigger by accident, though not a security issue by itself (the RPC
  is idempotent and side-effect-free — a read).
- `display_name`/`company_name` remain gated by the exact same three
  conditions as `phone`/`email` (active + approved + consented) — never
  split into a separately-less-gated path.

## Acceptance criteria
- `/listings` renders every `active`+`approved`+fresh(<90 days) listing,
  most-recently-updated first, with title/type/price/location visible
  without any click.
- `/listings` renders "Tiada listing aktif buat masa ini" when the query
  returns zero rows — not a blank page, not a loading spinner stuck
  forever.
- Each directory card links to `/listings/[id]` for that listing.
- `/listings/[id]` for a real, currently-public listing shows its full
  detail; the "Papar maklumat hubungan" button is present and, before
  being clicked, no phone/email/name is visible anywhere in the rendered
  page or its initial network responses.
- Clicking "Papar maklumat hubungan" reveals phone/email/name together,
  without a page reload.
- `/listings/[id]` for a non-existent, draft, removed, or stale-past-90-day
  id renders the same "not found" state — verified with at least one real
  case beyond a literally-random UUID (e.g. a listing seeded as `draft`).
- Neither page ever shows a sign-in prompt or checks for a session.

## Tests
No `.qa.ts` script — UI sprint, same convention as the prior two UI
sprints. Verification:
- **Interactive**, via a live `next dev` server, reusing
  `sprint-listing-partner-my-listings-ui`'s now-working approach:
  `context.addCookies()` is not even needed here (these pages are
  anonymous), so verification should be simpler than the prior two UI
  sprints — mock `**/rest/v1/property_listings*` responses directly, no
  session/cookie setup required. Remember `serviceWorkers: 'block'` on the
  browser context (root-caused in the prior sprint) or requests will
  silently 503 from the app's own PWA service worker, not from anything
  Supabase-related.
- Existing `.qa.ts` suites re-run unchanged as a regression check.

## Static verification
`npx tsc --noEmit`, `npx eslint .`, `npm run build`, plus the interactive
pass above.

## Stop conditions
- If `property_listings_select_public`'s RLS `USING` clause does not match
  what ADR-026/ADR-027 recorded (re-verify via `pg_policies`) — halt,
  report the discrepancy, do not assume the 90-day condition is still
  there.
- If `get_active_listing_contact` has already been modified since this
  brief was written (e.g. its current `RETURNS TABLE` shape differs from
  what ADR-027/`sprint-listing-partner-decisions-migration` recorded) —
  halt, re-verify via `information_schema.routines`, do not assume.

## Required report
Structure per `docs/ai/SPRINT_TEMPLATE.md`: Repository state → Files →
Cloud operations → Security → Tests/Verification → Findings → Decision
(PASS / CHANGES REQUIRED / BLOCKED).

## Commit/push/PR restrictions
- **Commit:** not authorized by this brief alone — requires a separate,
  explicit "start"/"commit" instruction.
- **Push:** not authorized by this brief.
- **Merge to `main`:** always requires explicit owner approval regardless.

## Explicitly out of scope (future sprint)
- Admin approval screen (approve/reject/suspend pending partners).
- Any filter/search/pagination on the directory (Design decisions 1-2).
- Listing photos (no schema/Storage support exists yet).
