# Sprint Brief — `sprint-feedback-cloud-sync`

Follows the structure required by `docs/ai/SPRINT_TEMPLATE.md`. Backlog Tier 1
item (post-launch action list, 2026-08-18) — turned out to need a migration,
not just UI wiring, once investigated; reclassified accordingly.

**This brief is a proposal.** Writing this file does not start the sprint —
a separate, explicit "mula sprint" instruction is required, same convention
as every prior sprint in this repo.

---

## Sprint ID
`sprint-feedback-cloud-sync`

## Objective
Sync `FeedbackModal.tsx` submissions to the existing (unused) `public.feedback`
table, in addition to — never instead of — the current localStorage save.
Adds one new RLS policy so the data is actually admin-readable once synced.
Explicitly does **not** add an edit/withdraw path, a retry-queue for failed
syncs, or an Admin Dashboard view of feedback (all out of scope, see below).

## Backend gap found, and what this sprint does about it
`public.feedback` (migration `202607110009_create_feedback.sql`) has only
`feedback_select_own` (authenticated caller reads their own `user_id`-tagged
rows) and no admin-broad-read policy. Its own header comment already flags
this: anonymous submissions (`user_id is null`) become **permanently
unreadable by anyone** once written, since there is no owner to match and no
admin-read policy exists. Since the app never requires login to submit
feedback today, syncing without fixing this would make most real submissions
invisible to the team. This sprint adds one new RLS policy,
`feedback_select_admin`, mirroring `listing_partners_select_admin` /
`profiles_select_admin` exactly.

## Design decisions (owner-confirmed 2026-08-18)
1. **Admin-read policy: yes, add it.** Without it, cloud sync has little
   practical value — confirmed above.
2. **Anonymous submission: stays allowed.** No change to
   `feedback_insert_anon`/`feedback_insert_authenticated` — matches current
   app behavior (no login required to submit feedback).
3. **Immutable, no edit/withdraw path.** No UPDATE/DELETE policy added —
   matches the migration's own default posture and every other write path in
   this app. `feedback_select_own`, `feedback_insert_anon`,
   `feedback_insert_authenticated` (all pre-existing) are otherwise
   untouched.
4. **Fire-and-forget, not retry-queued.** Unlike the five `land_records`
   child modules, a feedback submission is a one-shot modal action, not part
   of a repeated save flow with a natural retry point. A failed cloud sync
   does **not** block or fail the local save (which is what the current
   "Terima kasih" success message already reflects) — it is attempted once,
   silently, alongside it. No local retry-queue is built this sprint; a
   failed sync is simply not retried. This is a deliberate scope cut, not an
   oversight — flag it in the report.
5. **Dev-gated only, same base gate as every other module.** Reuses the
   existing `isCloudWriteEnabled()` (Dev-only, fails closed off
   `sabahlot-dev`) — no new per-module Production write gate
   (`isCloudWriteEnabledForFeedbackInProduction()` etc., the ADR-020–024
   pattern) is added this sprint, since Production write activation is not
   in progress for any module right now (owner decision, 2026-08-18 —
   `sabahlot-dev` stays the launch database). Add that gate later, in its
   own ADR, if/when Production write activation ever resumes and reaches
   this module — do not speculatively build it now.

## Base branch/commit
Verify `git rev-parse origin/main` immediately before starting.

## Allowed files
- `src/lib/feedback/feedback-cloud-sync.ts` (new — types, mapper,
  validation, and the single `syncFeedbackToCloud` function; kept as one
  file, not split into repository/coordinator/cache like the land-records
  modules, since there is no parent/child relationship, no update path, and
  no idempotency/conflict logic needed for a one-shot INSERT)
- `src/components/feedback/FeedbackModal.tsx` (existing — additive: call
  `syncFeedbackToCloud` in `handleSubmit`, alongside the existing
  `saveFeedbackEntry`; the success message may note sync outcome but must
  never block on it)
- `supabase/migrations/<next>_feedback_admin_read.sql` (new — one
  `CREATE POLICY feedback_select_admin`, no other schema change)
- `docs/ai/ARCHITECTURE_DECISIONS.md` — a new ADR entry recording the new
  policy, once implemented
- `docs/ai/PROJECT_STATE.md`, `docs/ai/MODULE_STATUS.md` — status update
  only, at the end

## Forbidden files
- `src/lib/feedback/feedbackStorage.ts` — the existing localStorage path is
  untouched, still the primary save
- `src/components/feedback/FeedbackExportButton.tsx`,
  `src/lib/feedback/exportFeedbackCsv.ts` — local CSV export is unrelated,
  not touched
- Any `land_records`/`listing-partners`/`admin` module file — unrelated
- `.env*`, `package.json`, `package-lock.json`, Vercel config

## Database operations
One new RLS policy against `sabahlot-dev` only, applied via `apply_migration`:
```sql
create policy "feedback_select_admin"
  on public.feedback
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
A second, independent permissive SELECT policy alongside the existing
`feedback_select_own` — Postgres combines multiple permissive policies with
`OR`, so this only ever **adds** visibility; it cannot narrow what
`feedback_select_own` already allows a caller to see of their own
submissions. One new INSERT from the app: `public.feedback`, via the
already-existing `feedback_insert_anon`/`feedback_insert_authenticated`
policies (unchanged).

## Security invariants
- `user_id` is always derived from `supabase.auth.getUser()` server/client
  session state, never accepted as a field from the form (ADR-005 pattern) —
  `CreateFeedbackInput` (the new module's writable-input type) must have no
  `userId`/`user_id` field for a caller to set.
- The new RLS policy grants **read only** — no UPDATE/DELETE policy is added
  for any role, matching Design decision 3.
- No raw Postgres/Supabase error reaches the UI — cloud sync failures map to
  a safe, generic outcome (matches the write-coordinator pattern's error
  handling used throughout `src/lib/land-records/`), and never block the
  local save regardless of what they map to.

## Acceptance criteria
- Submitting the feedback form while signed out (anonymous): local save
  succeeds as today; a `feedback` row is inserted with `user_id: null` when
  `sabahlot-dev` is targeted and cloud write is enabled; the modal still
  shows its existing local-save success message.
- Submitting while signed in: same, but `user_id` is the caller's own id.
- Cloud sync failing for any reason (network, validation) never prevents or
  delays the local save from completing, and never surfaces a raw error to
  the user.
- A caller with `profiles.role = 'admin'` can read every row in
  `public.feedback` (own and others', including anonymous rows) after the
  new migration is applied; a non-admin caller still sees only their own
  `user_id`-tagged rows, same as before this sprint.
- No UPDATE or DELETE of any `feedback` row is possible from the app after
  this sprint (unchanged from before).

## Tests
`feedback-cloud-sync.qa.ts` (new, fake-Supabase-client pattern matching
`points-ui-sync.qa.ts`/`documents-ui-sync.qa.ts`): anonymous submit succeeds
with `user_id: null`; signed-in submit succeeds with the session's own
`user_id`; `user_id` is structurally never accepted from the input type
(mirrors the `id_number`/ADR-014 regression-test pattern); a thrown/network
error maps to a safe failure result, never throws past the function
boundary; gate closed (`isCloudWriteEnabled()` false or wrong project)
results in a local-only outcome with zero network calls. Existing
`.qa.ts` suites re-run unchanged as a regression check. No live interactive
browser test of the actual submit flow is planned as a hard requirement —
static/QA coverage plus a manual dev-server smoke test (form still submits,
console clean) is enough for a fire-and-forget, non-blocking sync path; call
out explicitly in the report which kind of verification was actually done.

## Static verification
`npx tsc --noEmit`, `npx eslint .`, `npm run build`, plus
`feedback-cloud-sync.qa.ts` and a full re-run of all pre-existing
`.qa.ts`/`.qa.tsx` suites.

## Stop conditions
- If `profiles_select_own` (or equivalent) does not let a caller read their
  own `role` — halt; the admin-check design depends on this, re-verify
  against the live schema rather than assuming ADR-026/031's text still
  matches.
- If `public.feedback`'s actual live column names differ from what
  `202607110009_create_feedback.sql` states — halt and report, do not guess
  a mapping.

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
Feedback data becomes genuinely reviewable by the team (via SQL Editor,
until/unless a future Admin Dashboard sprint adds a UI view for it — not
scoped here). A retry-queue for failed syncs, and any edit/withdraw
capability, remain explicit, not-yet-scoped future decisions if ever
prioritized.
