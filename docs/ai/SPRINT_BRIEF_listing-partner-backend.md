# Sprint Brief — `sprint-listing-partner-backend`

Follows the structure required by `docs/ai/SPRINT_TEMPLATE.md`. This is the
**second** sprint of the Listing Partner module — TypeScript backend for
`listing_partners` only. `sprint-listing-partner-schema` (ADR-026, merged
2026-08-04) already applied the DB schema/RLS to `sabahlot-dev`; this sprint
writes the repository/validation/write-coordinator layer that actually calls
it. `property_listings` (the second table) and all UI are explicitly **out
of scope** — separate, later sprints.

**This brief is a proposal.** Writing this file does not start the sprint —
a separate, explicit "mula sprint" instruction is required, same convention
as `sprint-listing-partner-schema`.

---

## Sprint ID
`sprint-listing-partner-backend`

## Objective
Build `src/lib/listing-partners/` — a **new, standalone module directory**,
not nested under `src/lib/land-records/` — containing the TypeScript layer
for three operations against `public.listing_partners`: self-registration
(create), self-profile-update (non-status fields), and admin status
transition (approve/reject/suspend). No UI calls any of this yet; no
`property_listings` code is written. `src/lib/land-records/**` is not
imported from or modified, except for one narrow, explicitly-justified reuse
(see "Design decisions" below).

## Design decisions (read before implementing — do not re-derive)

1. **New module, not a `land-records` child.** `listing_partners` has no
   relationship to `land_records` at all (ADR-026 point 3) — it is a
   root-level identity tied directly to `auth.users`, structurally closer to
   `profiles` than to `land_parties`/`land_points`. `src/lib/land-records/`'s
   `child-types.ts` (`ChildSyncState`/`ChildWriteResult`) is deliberately
   **not** reused — its own header comment states it exists specifically for
   rows with "a parent-ownership dimension" through `land_records`, which
   `listing_partners` does not have. This module defines its own, smaller
   result-type shape instead (see below).
2. **One narrow, justified reuse:** `isTargetingSabahlotDevProject()` from
   `src/lib/land-records/feature-gate.ts` is imported and reused as-is (not
   copied) — it is a pure environment-string check with no land-records
   business logic in it, and re-implementing the same `NEXT_PUBLIC_SUPABASE_URL`
   parsing a second time would risk the two copies drifting. Nothing else
   from `feature-gate.ts` is imported. `isCloudWriteEnabled()` itself is
   **not** reused — its `CLOUD_WRITE_ENABLED_CONSTANT` gates all five
   land-records write-coordinators as one group (ADR-020's own text); wiring
   Listing Partner to that same constant would incorrectly couple an
   unrelated module's activation to land-records' rollout. Instead:
3. **Own gate, own constant.** `src/lib/listing-partners/feature-gate.ts`
   (new file) defines `isListingPartnerCloudWriteEnabled()`, gated by its
   own `LISTING_PARTNER_CLOUD_WRITE_ENABLED_CONSTANT` (ships `true` for Dev,
   mirroring how `CLOUD_WRITE_ENABLED_CONSTANT` already ships `true` for
   land-records — Dev-only writes have never been the thing gated `false` by
   default in this repo; Production is what stays closed) `&&
   process.env.NODE_ENV !== "production" && isTargetingSabahlotDevProject()`.
   This gives Listing Partner the same "Dev-only until an explicit future
   ADR" posture every other module started with (ADR-019 series), from day
   one, without waiting for a retrofit.
4. **Admin status-transition is not authorization-checked in application
   code.** Per ADR-006 ("Authorization boundary is RLS, not application
   code"), `updateListingPartnerStatus()` does not pre-check the caller's
   `profiles.role` before attempting the UPDATE — it relies entirely on the
   `listing_partners_update_admin` RLS policy and the
   `prevent_listing_partner_self_approval` trigger already proven in
   `sprint-listing-partner-schema`. A denied attempt surfaces as an
   affected-row-count of 0 (RLS) or a raised exception (trigger), both
   mapped to a single `not_authorized_or_not_found` result code — never a
   distinct "you're not admin" vs. "that partner doesn't exist" (same
   non-disclosure reasoning as ADR-004, applied here to authorization state
   rather than row existence).
5. **`status`, `approved_by`, `approved_at` are structurally absent from the
   update-own-profile input type**, not merely filtered out at runtime — the
   same "spread last / never on the writable-fields type" discipline ADR-005
   established for `owner_id`/`captured_by`, applied here to prevent a
   future accidental self-approval code path from ever compiling.

## Base branch/commit
- Base branch: `main`
- Verify current `main` SHA with `git rev-parse origin/main` immediately
  before starting (this repo's convention throughout: never assume a base
  commit from a prior brief). Note: per the CCR harness instructions active
  in this session, actual development happens directly on the designated
  branch (`claude/adr-018-production-docs-q722el`), not a fresh
  sprint-named branch — confirm which convention applies before creating
  any new branch.

## Allowed files
- `src/lib/listing-partners/types.ts` (new) — `ListingPartnerStatus`,
  `ListingPartnerRow` (snake_case, matches the migration exactly),
  `ListingPartner` (camelCase domain shape), `CreateListingPartnerInput`,
  `UpdateListingPartnerProfileInput` (explicitly excludes
  `status`/`approvedBy`/`approvedAt`), `WriteErrorCode`, `WriteSyncState`,
  `WriteResult<T>` (this module's own result shape, not `ChildWriteResult`)
- `src/lib/listing-partners/mapper.ts` (new) — `mapListingPartnerRow`
- `src/lib/listing-partners/feature-gate.ts` (new) — see Design decision 3
- `src/lib/listing-partners/listing-partners-validation.ts` (new)
- `src/lib/listing-partners/listing-partners-repository.ts` (new)
- `src/lib/listing-partners/listing-partners-write-coordinator.ts` (new)
- `src/lib/listing-partners/index.ts` (new) — barrel export, this module's
  own (not touching `src/lib/land-records/index.ts`)
- `src/lib/listing-partners/listing-partners-write.qa.ts` +
  `listing-partners-write.qa.tsconfig.json` (new)
- `docs/ai/PROJECT_STATE.md`, `docs/ai/MODULE_STATUS.md` — status update
  only, at the end

## Forbidden files
- Everything under `src/lib/land-records/**` except the one named import in
  Design decision 2 — **no edits** to any file in that directory
- `src/app/page.tsx` or any other UI file — no UI in this sprint
- `supabase/migrations/**` — schema is already applied; no new migration
- `.env*`, `package.json`, `package-lock.json`, Vercel config
- Any file outside "Allowed files" above

## Database operations
- **Environment:** `sabahlot-dev` only, enforced in code by
  `isListingPartnerCloudWriteEnabled()` (Design decision 3) — same standing
  restriction as every other sprint.
- **Tables touched:** `public.listing_partners` only (INSERT, UPDATE). No
  `SELECT ... FOR ALL`/admin-listing query is in scope — `getListingPartnerById`
  is the only read function, used internally by the write-coordinator for
  duplicate-retry resolution (ADR-002 pattern), not exposed as a general
  "list all partners" query (that belongs to a future Admin Dashboard
  sprint).
- **No DDL.** No `ALTER`/`CREATE` against the schema — that already
  happened in `sprint-listing-partner-schema`.

## Security invariants
- `listing_partners.id` is always the session's own `auth.uid()` on
  INSERT — never accepted as a caller-supplied field on
  `CreateListingPartnerInput` (mirrors ADR-005, `id` derived server-side,
  spread last).
- `CreateListingPartnerInput` always inserts with an implicit `status`
  omitted from the payload (DB default `'pending'` applies) — the
  coordinator never sends a caller-supplied `status` value on create, even
  though the RLS `with_check` would also block anything but `'pending'`.
  This is defense-in-depth, not reliance on RLS alone.
- `UpdateListingPartnerProfileInput`'s TypeScript type has no `status`
  field at all — see Design decision 5.
- A create retry with the same id (`23505`) is resolved via the existing-row
  comparison pattern (ADR-002): identical content → verified idempotent
  success; different content → `duplicate_conflict`. Since `id = auth.uid()`
  is always the caller's own id, this realistically only fires on a genuine
  double-submit, but the same-content-vs-different-content check must still
  be implemented, not skipped as "can't happen."
- `updateListingPartnerStatus()` never accepts `approvedBy` from a caller —
  it always sets it to the *calling* admin's own `auth.uid()` server-side
  (same ADR-005 pattern), never a caller-supplied admin id.

## Acceptance criteria
- `createListingPartner()` succeeds for a fresh, authenticated caller with
  valid input; the inserted row's `id` always equals the caller's
  `auth.uid()`, never a caller-supplied value even if one is present on the
  input object (test with a malicious `id` field present, mirroring
  `documents-write.qa.ts`'s Test 4 `uploaded_by`-injection pattern).
- `createListingPartner()` rejects an unauthenticated caller
  (`unauthenticated`), before any Supabase call is attempted.
- `createListingPartner()` rejects input failing `listing-partners-validation.ts`'s
  checks (blank `displayName`/`phone`/`email`) — validated client-side
  before the round-trip, mirroring the DB's own CHECK constraints exactly.
- A same-id, same-content retry (`23505`) resolves to verified success; a
  same-id, different-content retry resolves to `duplicate_conflict`, row
  untouched.
- `updateListingPartnerProfile()` never sends `status` in its UPDATE
  payload — assert this structurally (the input type has no such field) and
  via a runtime check on the actual outbound payload object, mirroring
  `parties-write.qa.ts`'s `id_number`-omission regression test.
- `updateListingPartnerStatus()` attempted by a non-admin caller against
  their own row surfaces as `not_authorized_or_not_found`, not a silent
  success and not a raw Postgres exception message leaking to the caller.
- `isListingPartnerCloudWriteEnabled()` returns `false` when
  `NEXT_PUBLIC_SUPABASE_URL` does not resolve to `sabahlot-dev`, mirroring
  `feature-gate.qa.ts`'s existing test shape for
  `isTargetingSabahlotDevProject()`.
- No function in this module ever writes to `property_listings`.

## Tests
- **Executed**, via a fake Supabase client (no network), mirroring
  `parties-write.qa.ts`/`documents-write.qa.ts`'s established harness shape
  (`FakeSupabaseClient` with `insertQueue`/`selectByIdQueue`, `calls`
  tracking) — reused as a pattern, reimplemented locally in this new
  module's own QA file (not imported from `land-records`, keeping the
  module dependency-free of `land-records` test infrastructure too).
- **Static assertion**: `UpdateListingPartnerProfileInput` structurally has
  no `status`/`approvedBy`/`approvedAt` keys (same `AssertNoMimeOrSize`-style
  compile-time check `documents-write.qa.ts` Test 0b uses).
- **Documented-only**: real RLS enforcement end-to-end (vs. this sprint's
  fake-client unit tests, which do not exercise real Postgres RLS at all) —
  same limitation already stated for `sprint-listing-partner-schema`'s own
  test plan; the two are complementary, neither alone is a full proof.

## Static verification
`npx tsc --noEmit`, `npx eslint .`, `npm run build`, plus this sprint's new
`listing-partners-write.qa.ts` and every pre-existing `.qa.ts` suite
(regression). Report actual output, not assumed.

## Stop conditions
- If `sabahlot-dev`'s `listing_partners` table or any of its RLS policies
  do not match what `sprint-listing-partner-schema`/ADR-026 recorded
  (re-verify with `list_tables`/`pg_policies` before writing code that
  assumes a specific shape) — halt and report the discrepancy, do not
  silently adapt to what's actually there without flagging it.
- If `isTargetingSabahlotDevProject()`'s signature or behavior has changed
  since this brief was written — halt, do not fork/reimplement it instead.

## Required report
Structure per `docs/ai/SPRINT_TEMPLATE.md`: Repository state → Files →
Cloud operations → Security → Tests/Verification → Findings → Decision
(PASS / CHANGES REQUIRED / BLOCKED).

## Commit/push/PR restrictions
- **Commit:** not authorized by this brief alone — requires a separate,
  explicit "start"/"commit" instruction, same standing rule applied to
  `sprint-listing-partner-schema`.
- **Push:** not authorized by this brief.
- **Merge to `main`:** always requires explicit owner approval regardless.

## Explicitly out of scope (do not implement, even if convenient)
- `property_listings` repository/validation/write-coordinator — own future
  sprint, depends on this one existing first (an approved `listing_partners`
  row is a precondition for any listing write, per the schema's RLS).
- Any UI — registration form, profile edit form, admin approval screen.
- A "list all pending partners for admin review" query — belongs with the
  eventual Admin Dashboard sprint, not this backend sprint.
- Local `localStorage` cache/offline-first draft support for a
  partner's own profile — this sprint assumes direct online calls to the
  coordinator, not the land-records domain's offline-first,
  cache-then-sync pattern (partner registration is assumed to happen
  online, unlike field survey data entry). Flagged as an assumption, not a
  settled product decision — revisit if this turns out to be wrong.
