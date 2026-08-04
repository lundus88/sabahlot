# Sprint Brief — `sprint-listing-partner-my-listings-ui`

Follows the structure required by `docs/ai/SPRINT_TEMPLATE.md`. This is the
**second UI sprint** of the Listing Partner module — an approved partner's
own listing management ("my listings": create/edit/delete/change status of
their own `property_listings` rows). The public directory (what visitors
see) and the admin approval screen remain out of scope, each a future
sprint in an order not yet decided.

**This brief is a proposal.** Writing this file does not start the sprint —
a separate, explicit "mula sprint" instruction is required, same convention
as every prior sprint in this arc.

---

## Sprint ID
`sprint-listing-partner-my-listings-ui`

## Objective
A new route, `src/app/listing-partners/listings/page.tsx` (+ its own CSS
module), where an `approved` listing partner can see, create, edit, and
delete their own `property_listings` rows. Also updates the existing
`src/app/listing-partners/page.tsx` (from `sprint-listing-partner-profile-ui`)
to add the "Manage my listings" link for `approved` partners — that link
was explicitly deferred there ("No 'Manage my listings' link/button appears
on this page in this sprint regardless of status... next sprint").

## Backend gap found, and what this sprint does about it
`sprint-property-listings-backend` built `createPropertyListing`/
`updatePropertyListing`/`deletePropertyListing`, but **no function to list a
partner's own listings** — every existing function operates on one listing
by id. `property_listings_select_own` (the RLS policy) already supports
this query; nothing was ever built to call it. This sprint adds exactly one
small, read-only repository function to close that gap — no coordinator
wrapper (see Design decision 3), no migration, no new RLS.

## Design decisions (read before implementing)

1. **New sub-route, not a tab on `/listing-partners`.** `/listing-partners/listings`
   is its own page under the existing `listing-partners` route segment —
   keeps the profile page's scope to "who am I" and this page's scope to
   "what have I listed," mirroring how the module's own backend already
   separates `listing_partners` concerns from `property_listings` concerns
   into different files.
2. **Access gate: session AND `status === 'approved'`, both required.**
   Unauthenticated -> same sign-in prompt pattern as `/listing-partners`.
   Authenticated but no `listing_partners` row, or one that's
   `pending`/`suspended`/`rejected` -> a message explaining listing
   management requires an approved partner registration, with a link back
   to `/listing-partners` (not a listing form that would only fail — RLS's
   `property_listings_insert_approved_partner`/`update_approved_partner`/
   `delete_approved_partner` all require `approved` anyway).
3. **`listOwnPropertyListingsRow` is a plain repository function, not a
   coordinator.** Matches this codebase's existing convention: reads don't
   get a coordinator wrapper here — `page.tsx` (the profile page) already
   calls `getListingPartnerById(supabase, currentUserId)` directly, deriving
   the session id itself rather than going through a coordinator layer that
   only exists for writes. This sprint's new function follows the same
   shape: `listOwnPropertyListingsRow(supabase, partnerId)`, called directly
   from the new page with `partnerId` derived from `supabase.auth.getUser()`
   in the UI itself.
4. **Status field: a restricted set of options, not the raw 8-value enum.**
   `property_listing_status` has 8 values, but only 6 make sense as
   something a partner would ever deliberately choose: `draft`, `active`,
   `under_offer`, `sold`, `leased`, `removed`. Two are deliberately
   **excluded** from any dropdown/selector in this UI:
   - `pending_review` — not read or written by any existing coordinator/RLS
     logic; reserved/unused today, not part of this sprint's workflow.
   - `expired` — per ADR-027 item 5, expiry in this schema is a **virtual**
     RLS-only effect of `updated_at` staleness; `status` itself is never
     actually mutated to `'expired'` by any code path. Offering it as a
     selectable value would contradict how expiry actually works and could
     mislead a partner into thinking they can "set" a state that the schema
     never writes.
5. **Create form defaults `status` to `draft`** (omitted from the create
   payload entirely, matching the DB column default and
   `createPropertyListing`'s existing behavior) rather than defaulting to
   `active` — a partner should have to deliberately publish, not have a
   half-finished listing go live by omission.
6. **Delete requires confirmation** (a plain `window.confirm`, matching the
   simplest existing pattern in this codebase — no custom modal component
   exists anywhere yet to reuse or introduce here).
7. **No listing photos** — `property_listings` has no photo/image field in
   the schema yet (ADR-026/027's "listing photos remain deferred"). This
   form is text/number/select fields only.

## Base branch/commit
Verify `git rev-parse origin/main` immediately before starting. Development
happens on the session's designated branch per the active CCR harness
instructions.

## Allowed files
- `src/app/listing-partners/listings/page.tsx` (new)
- `src/app/listing-partners/listings/listing-partners-listings.module.css` (new)
- `src/app/listing-partners/page.tsx` (existing — additive only: add the
  "Manage my listings" `Link` for `approved` partners; no other change to
  this file's existing logic)
- `src/lib/listing-partners/property-listings-repository.ts` (existing —
  additive only: one new function, `listOwnPropertyListingsRow`)
- `src/lib/listing-partners/index.ts` (existing — already barrel-exports
  `property-listings-repository.ts` via `export *`; no change needed unless
  the new function's name collides, which it should not)
- `docs/ai/PROJECT_STATE.md`, `docs/ai/MODULE_STATUS.md` — status update
  only, at the end

## Forbidden files
- `src/app/page.tsx`
- `src/lib/listing-partners/property-listings-write-coordinator.ts`,
  `listing-partners-write-coordinator.ts`, any validation/type file — this
  sprint calls existing write functions unchanged; the only backend change
  is the one new read function listed above
- `supabase/migrations/**`
- `.env*`, `package.json`, `package-lock.json`, Vercel config

## Database operations
None directly from this sprint's own code — `listOwnPropertyListingsRow` is
a plain `SELECT ... WHERE partner_id = ... ORDER BY updated_at DESC` against
the already-existing `property_listings_select_own` RLS policy. No new
table/column/policy/migration.

## Security invariants
- `listOwnPropertyListingsRow` is always called with the **caller's own**
  `partnerId` (== `auth.uid()`), derived from `supabase.auth.getUser()` in
  the UI, never a value a caller could redirect to see someone else's
  listings from the client side — RLS (`property_listings_select_own`)
  would reject a mismatched id anyway (defense-in-depth, not the sole
  boundary, per ADR-006).
- The listing form never exposes `partnerId`/`id` (on create) as
  caller-editable fields — `id` is generated client-side via
  `crypto.randomUUID()` at submit time (ADR-001 pattern, matching how
  `CreatePropertyListingInput.id` is already a required, client-generated
  field per `types.ts`) and never surfaced in the form UI itself.
- No raw Supabase/Postgres error text is ever rendered directly — every
  `WriteResult` failure this page can receive
  (`unauthenticated`/`validation_failed`/`duplicate_conflict`/
  `not_found_or_forbidden`/`partner_not_approved`/`database_error`) gets its
  own plain-language Malay message, same posture as
  `sprint-listing-partner-profile-ui`.
- Deleting or editing a listing that no longer belongs to the caller (e.g.
  status changed elsewhere, or a stale local list) surfaces as
  `not_found_or_forbidden` from the existing coordinator, not a crash — the
  UI must handle this by refreshing the list, not by assuming the local
  copy is still accurate.

## Acceptance criteria
- Signed-out visitor sees the sign-in prompt; no listings query attempted.
- Signed-in, non-approved partner (or no registration at all) sees the
  "approval required" message and a link back to `/listing-partners`; no
  listing form or list rendered.
- Signed-in, approved partner sees their own listings (any status,
  including `draft`), ordered most-recently-updated first.
- Creating a listing with valid `title`+`listingType` succeeds and the new
  listing appears in the list without a manual page reload.
- Blank `title` is caught client-side before any coordinator call.
- Editing an existing listing's fields (including `status`, restricted to
  the 6-value set from Design decision 4) succeeds and the list reflects
  the change.
- Deleting a listing (after confirmation) removes it from the list without
  a manual reload.
- The status selector never offers `pending_review` or `expired` as
  options, in either the create or edit form.
- `/listing-partners` (the profile page) shows a "Manage my listings" link
  only when the signed-in user's partner `status === 'approved'` — absent
  for `pending`/`suspended`/`rejected`/no-registration, matching this
  sprint's stated access gate.

## Tests
No `.qa.ts` script — UI sprint, same established convention as
`sprint-listing-partner-profile-ui`. Verification:
- **Interactive**, via a live `next dev` server. Given
  `sprint-listing-partner-profile-ui` already established that direct
  browser-to-Supabase egress is blocked in this sandboxed environment (a
  structural limitation, confirmed against the pre-existing `/auth` page,
  not something this sprint should re-diagnose from scratch), reuse that
  sprint's verified approach: real signed-out state directly; authenticated
  states via `@supabase/ssr`'s actual cookie format + Playwright route
  interception. If session persistence across `page.reload()` proves
  unreliable in the mocked harness again, do not force it — verify what
  renders correctly for real, document by code review what could not be
  exercised interactively, same honest posture as the prior sprint's
  report (do not silently claim untested states work).
- Existing `.qa.ts` suites re-run unchanged as a regression check (this
  sprint's only non-UI change, `listOwnPropertyListingsRow`, is additive
  and untested by any existing suite — acceptable, since it's a single
  plain SELECT wrapper with no business logic to unit-test beyond what
  `property-listings-write.qa.ts`'s existing `FakeSupabaseClient` pattern
  would trivially cover if this were a coordinator; consider adding one
  QA test for it only if it turns out to have any real logic beyond the
  query itself).

## Static verification
`npx tsc --noEmit`, `npx eslint .`, `npm run build`, plus the interactive
pass above.

## Stop conditions
- If `property_listings_select_own`'s RLS policy does not exist or does
  not match what `sprint-listing-partner-schema` recorded — halt, re-verify
  via `pg_policies`, do not assume.
- If direct interactive verification of the authenticated states is fully
  blocked (not just the status-transition edge cases) — do not silently
  ship unverified UI; report the limitation explicitly and ask whether to
  proceed on code-review confidence alone or wait for a different
  verification path.

## Required report
Structure per `docs/ai/SPRINT_TEMPLATE.md`: Repository state → Files →
Cloud operations → Security → Tests/Verification → Findings → Decision
(PASS / CHANGES REQUIRED / BLOCKED).

## Commit/push/PR restrictions
- **Commit:** not authorized by this brief alone — requires a separate,
  explicit "start"/"commit" instruction.
- **Push:** not authorized by this brief.
- **Merge to `main`:** always requires explicit owner approval regardless.

## Explicitly out of scope (future sprints)
- Public directory (browse active listings) + individual listing detail
  page (using `getActiveListingContact` for contact reveal).
- Admin approval screen (approve/reject/suspend pending partners).
- Listing photos (no schema/Storage support exists yet).
