# Sprint Brief — `sprint-listing-partner-profile-ui`

Follows the structure required by `docs/ai/SPRINT_TEMPLATE.md`. This is the
**first UI sprint** of the Listing Partner module — partner
self-registration and profile management only. Listing CRUD (partner's own
"my listings" screen), the public directory/listing-detail pages, and the
admin approval screen are **explicitly out of scope**, each its own future
sprint, in the order the owner chose.

**This brief is a proposal.** Writing this file does not start the sprint —
a separate, explicit "mula sprint" instruction is required, same convention
as every prior sprint in this arc.

---

## Sprint ID
`sprint-listing-partner-profile-ui`

## Objective
A new standalone route, `src/app/listing-partners/page.tsx` (+ its own CSS
module, matching the existing `manual-beta`/`auth` route convention — own
page, own styles, not woven into `src/app/page.tsx`), that lets an
authenticated user (a) register as a listing partner if they have no
`listing_partners` row yet, or (b) view their current status and edit their
own profile fields if they do. Calls directly into the already-built,
already-tested `src/lib/listing-partners/` coordinator functions
(`createListingPartner`, `updateListingPartnerProfile`,
`getListingPartnerById`) — no new backend logic, no new migration.

## Design decisions (read before implementing)

1. **One route, two states, not two routes.** `/listing-partners` renders a
   registration form when the signed-in user has no `listing_partners` row,
   or a status view + edit form when they do — mirrors how `/auth` already
   handles login vs. signup as one page with conditional UI, rather than
   splitting into `/listing-partners/register` +
   `/listing-partners/profile`. Simpler for this first sprint; can be split
   later if it grows unwieldy.
2. **Client component, matching every existing route in this app.**
   `"use client"`, `createClient()` from `@/lib/supabase/client`,
   `useEffect` + `supabase.auth.getUser()` on mount to resolve the session
   — same pattern `src/app/auth/page.tsx` already uses. No server component
   data-fetching is introduced (would be a new pattern for this codebase;
   out of scope to introduce here).
3. **Unauthenticated visitor:** a plain message + a `Link` to `/auth`
   (existing route) — no registration form rendered at all, since
   `createListingPartner` requires a session regardless (the coordinator
   itself rejects `unauthenticated`, this is just not showing a form that
   would only fail).
4. **Status messaging, not just a raw status string.** `pending` /
   `approved` / `suspended` / `rejected` each get distinct, plain-language
   copy (e.g. `pending`: "Pendaftaran anda sedang disemak" — no listing
   management link shown yet, since `property_listings` writes require
   `approved` anyway, per the schema/RLS from `sprint-listing-partner-schema`).
   No "Manage my listings" link/button appears on this page in this sprint
   regardless of status — that UI doesn't exist yet (next sprint).
5. **`status`/`approvedBy`/`approvedAt` are never rendered as editable
   fields** — the profile edit form only ever touches
   `UpdateListingPartnerProfileInput`'s fields (`displayName`, `phone`,
   `email`, `companyName`, `renNumber`, `bio`,
   `publicContactConsent`), which structurally cannot include them (see
   `types.ts`). The status view is read-only display, not part of the edit
   form.
6. **`publicContactConsent` gets its own explicit checkbox with plain
   PDPA-style copy** (e.g. "Saya bersetuju nombor telefon dan emel saya
   dipaparkan secara terbuka dalam senarai hartanah saya") — defaults
   unchecked, matching the DB column's own `default false`; never
   pre-checked by this form.

## Base branch/commit
Verify `git rev-parse origin/main` immediately before starting. Development
happens on the session's designated branch per the active CCR harness
instructions.

## Allowed files
- `src/app/listing-partners/page.tsx` (new)
- `src/app/listing-partners/listing-partners.module.css` (new)
- `docs/ai/PROJECT_STATE.md`, `docs/ai/MODULE_STATUS.md` — status update
  only, at the end

## Forbidden files
- `src/app/page.tsx` — not touched; this is a standalone route
- Any file under `src/lib/listing-partners/**` or `src/lib/land-records/**`
  — this sprint calls existing exports only, adds no new backend logic
- `supabase/migrations/**`
- `.env*`, `package.json`, `package-lock.json`, Vercel config

## Database operations
None directly — this sprint only calls existing TypeScript coordinator
functions, which themselves call Supabase. No new table/RLS/migration.

## Security invariants
- The registration form never lets a caller set `status` — there is no
  such field in the form at all (matches the structural exclusion already
  enforced by `CreateListingPartnerInput`'s type).
- `publicContactConsent` is the only sensitive-disclosure-adjacent toggle
  on this page; its copy must make clear what it does (public phone/email
  exposure) before a user can meaningfully consent — vague copy like a
  generic "I agree to terms" checkbox is not acceptable for this field.
- No raw Supabase/Postgres error text is ever rendered directly to the
  user — every `WriteResult` failure (`unauthenticated`,
  `validation_failed`, `duplicate_conflict`, `not_found_or_forbidden`,
  `database_error`) gets its own plain-language message, mirroring how
  `coordinator.message` is never treated as user-facing copy elsewhere in
  this codebase either.

## Acceptance criteria
- Signed-out visitor sees a sign-in prompt, no form, no Supabase write
  call attempted.
- Signed-in visitor with no `listing_partners` row sees the registration
  form; submitting valid input calls `createListingPartner` and, on
  success, the page re-renders showing the new `pending` status.
- Signed-in visitor who is already `pending`/`approved`/`suspended`/
  `rejected` sees status-appropriate copy, never a registration form.
- Editing an existing profile's fields and submitting calls
  `updateListingPartnerProfile`; the page reflects the updated values
  without requiring a manual page reload.
- Blank `displayName`/`phone`/`email` are caught client-side before any
  coordinator call is attempted (mirrors `listing-partners-validation.ts`'s
  own rules, so the user isn't sent a round-trip just to get a
  `validation_failed` result for something checkable locally).
- `publicContactConsent` checkbox state accurately reflects the current
  DB value on load, and only changes what the user explicitly toggles.

## Tests
No `.qa.ts` script — this is a UI sprint, and this codebase's established
convention (per `docs/ai/RELEASE_CHECKLIST.md` and every prior UI-wiring
sprint, e.g. PR #38's documents file-picker) is interactive verification in
a real browser, not an automated UI test suite. Verification for this
sprint:
- **Interactive**, via a live `next dev` server: sign in, register, observe
  `pending` status, edit a profile field, observe the update — screenshot
  or description of what was actually observed, not assumed.
- Existing `.qa.ts` suites (`listing-partners-write.qa.ts`,
  `property-listings-write.qa.ts`, and the other 14) re-run unchanged as a
  regression check, since this sprint's TypeScript changes are additive-only
  (one new route file) and shouldn't affect them, but "shouldn't" must be
  confirmed, not assumed.

## Static verification
`npx tsc --noEmit`, `npx eslint .`, `npm run build`, plus a real
`next dev` interactive pass (see Tests above) — building alone does not
prove the page renders or the flow works.

## Stop conditions
- If no admin exists yet to approve a test registration (per ADR-027 item
  4, admin provisioning is still manual/unresolved) — the `pending` state
  is fully testable, but the `approved` state's downstream UI (once it
  exists in a future sprint) cannot be exercised end-to-end without the
  owner manually approving a test account first. Not a blocker for this
  sprint (which only needs to render the `approved` state's copy
  correctly, given a row in that state — can be verified by seeding a
  test row directly, not by using the real approval flow), but flag this
  limitation in the report rather than silently skip it.

## Required report
Structure per `docs/ai/SPRINT_TEMPLATE.md`: Repository state → Files →
Cloud operations → Security → Tests/Verification → Findings → Decision
(PASS / CHANGES REQUIRED / BLOCKED).

## Commit/push/PR restrictions
- **Commit:** not authorized by this brief alone — requires a separate,
  explicit "start"/"commit" instruction.
- **Push:** not authorized by this brief.
- **Merge to `main`:** always requires explicit owner approval regardless.

## Explicitly out of scope (future sprints, in the order to be decided)
- Partner's own listing management ("my listings" — create/edit/delete/
  change status of their own `property_listings` rows).
- Public directory (browse active listings) + individual listing detail
  page (using `getActiveListingContact` for contact reveal).
- Admin approval screen (approve/reject/suspend pending partners) — of
  limited value while admin provisioning itself remains manual (ADR-027
  item 4); may end up being the lowest-priority of the four.
