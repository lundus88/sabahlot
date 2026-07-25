# SabahLot — Project State

_Last updated: 2026-07-25 (post-merge reconciliation for PR #31, backfilling PR #25–#30 which this file had missed). Update this file at the end of every merged sprint — it is the single source of truth for "what is actually true right now," not the sprint reports themselves._

## Vision

SabahLot is a preliminary land-record and field-survey assistance tool for Sabah land matters. It helps public users, surveyors, and land officers capture, organize, and (increasingly) cloud-sync GPS points, drawn geometry, and case metadata for land applications, inheritance land, and customary land (NCR) cases. Every output is explicitly **preliminary** — not a legal survey plan, not proof of boundary, not an official approval by JTU, Land Office, or any authority.

## Status summary

| Dimension | Status |
|---|---|
| Cloud writes | `land_records` parent create/update and the boundary **geometry** sync are merged and wired to the local-first save flow in Dev (PR #24). Points create-only persistence is merged (PR #21) but **still not wired to the UI** — PR #26 completed the separate local point-management UI (list, rename, delete, import bridge) but does not call `points-write-coordinator.ts`; this is a real, still-open gap, not resolved by PR #26 (see "Current approved next sprint"). **Parties** backend create+update (minus `id_number`, ADR-014) and **create-only UI wiring** (four `PdfIdentityFields` entries, via `parties-ui-sync.ts`) are merged via **PR #31** (`main@f98445c8493f1764188ab6de8cf5f905274b0f51`). |
| Production UI cloud activation | **Disabled.** Parent `land_records` sync and boundary geometry sync are wired only behind the non-production, exact-`sabahlot-dev` gate. Points/parties remain unwired. |
| QA integrity (cloud-write gate) | PR #19 (`main@aeb6324`) fixed a regression where tightening the write gate in PR #18 caused `land-records-write.qa.ts` and `geometry-write.qa.ts` to silently short-circuit to "gate disabled" and report a false PASS without ever exercising the fake Supabase cloud-write path. Both scripts now explicitly set `NODE_ENV=development` and `NEXT_PUBLIC_SUPABASE_URL` to the approved `sabahlot-dev` project (`xsflrehitrmobiyfbfhk`) for the QA process only, so they genuinely exercise the gated code path again. No `.env` file, production code path, migration, remote SQL, or Beta/Production project was touched by this fix. |
| Cloud read gate | PR #23 (`main@a88316d`) closed the same gap on the read side: `isCloudReadEnabled()` now also requires `isTargetingSabahlotDevProject()`, matching `isCloudWriteEnabled()` exactly — a non-production build pointed at a non-`sabahlot-dev` Supabase URL can no longer read cloud data either. `land-records.qa.ts` and `feature-gate.qa.ts` extended accordingly; no UI is wired to cloud read yet, so this had no user-facing effect at merge time. |
| Legacy local workflow | Fully preserved. `src/lib/local-lots.ts` (`sabahlot_local_lots_v1`) remains the primary, unmodified local save/load/delete path. |
| Point conflict control | Not possible without a migration — `land_points` has no `updated_at` column. Point cloud writes are scoped to **create-only**. |
| Child-cache concurrency | PR #24 also fixed a pre-existing bug in `parent-ui-sync.ts`: a parent `land_records` update previously replaced the user's whole cached record — including its already-synced `geometries`/`points`/`parties` arrays — with empty arrays, silently discarding the `updated_at` values those child rows' own optimistic-concurrency checks depend on. The parent sync now re-merges the previously-cached child arrays back in after a successful parent write. Covered by `parent-ui-sync.qa.ts` Test 13 ("parent update preserves cached child rows"). |

## Environments

| Environment | Supabase project | Status | Notes |
|---|---|---|---|
| Dev | `sabahlot-dev` (ref `xsflrehitrmobiyfbfhk`, region ap-southeast-1) | Active, migrations 001–012 applied | The **only** environment cloud write code may target. |
| Beta | (existing `sabahlot`/`hakncr` Supabase projects, alpha.sabahlot.com / beta.sabahlot.com) | Untouched by cloud-write work | Do not link, migrate, or write to these from any AI sprint without explicit separate approval. |
| Production | — | Not yet defined for cloud write | No cloud write path may ever reach a real user without an explicit, separately-approved release sprint. |

## Modules

### Done (shipped, stable, not part of active cloud-write work)
- Map / local lots (draw, save, load, PDF/KML/DXF export) — `src/app/page.tsx`, `src/app/components/Map.tsx`, `src/lib/local-lots.ts`
- Handheld GPS field assist — `src/components/FieldGpsLite.tsx`
- AR Find Point navigation
- Beta notice, feedback (localStorage), manual-beta onboarding
- Authentication (Supabase email/password + Google OAuth) — `src/app/auth/`, `src/lib/supabase/`

### Partial (backend exists, not wired to Production UI)
- **Land Record cloud read** — `src/lib/land-records/index.ts` (`loadCloudLandRecords`). Merged to `main`; read-gate hardened in PR #23. Dev-gated, no UI.
- **Land Record cloud create/update** — backend merged in PR #14; local-first Dev UI wiring merged in PR #18 (`main@aa23531`). The parent sync uses stable UUIDs and server `updated_at`, and fails closed unless the configured Supabase hostname is exactly `xsflrehitrmobiyfbfhk.supabase.co` in a non-production build.
- **Points cloud create-only** — merged in PR #21 (`main@d071d73`), QA-passed, **still not wired to the UI**. PR #26 ("complete points UI wiring") is a real, separate deliverable — it wires FieldGpsLite's local point list, delete confirmation, rename, and a single-point CSV/GeoJSON import bridge — but touches none of `src/lib/land-records/points-*.ts` and never calls `createCloudPoint`. Do not read PR #26 as having closed this item; it hasn't. Update/delete also remain deliberately deferred because `land_points` has no `updated_at` concurrency token.

### Active in Dev (wired to UI, non-production gate only)
- **Geometry cloud create/update** — backend merged in PR #16 (`main@b6d0a25`); UI wiring merged in PR #24 (`main@91e64c0`) via `src/lib/land-records/child-ui-sync.ts` (`syncParentGeometryToCloud`), called from `src/app/page.tsx`'s save flow immediately after the parent sync settles. Syncs only the one `drawingObjects` entry with `geometryType === "polygon"` and `category === "parent_lot"` — that entry's own id is reused as the geometry's cloud id (not the parent land record's id). If zero or more than one such object exists, the sync stays local-only / is rejected rather than guessing. Other drawn objects (proposed lots, lines, etc.) are not cloud-synced. Dev-gated only, same as parent sync; disabled in Production.
- **Parties cloud create+update (backend) + create-only UI wiring** — merged via **PR #31** (`main@f98445c8493f1764188ab6de8cf5f905274b0f51`). Backend: `parties-repository.ts` / `parties-write-coordinator.ts` / `parties-validation.ts` / `parties-cache.ts` — full create+update, minus `id_number` (ADR-014; structurally absent from the writable-input type, explicitly regression-tested). UI: new `parties-ui-sync.ts` (`syncPdfIdentitiesToCloud`), called from `src/app/page.tsx`'s save flow right after the geometry sync settles, syncing each filled-in `PdfIdentityFields` entry (surveyor/witness/villageHead/applicant -> `surveyor`/`witness`/`village_head`/`original_applicant`; no "owner" slot in this form). UI wiring is **create-only**: `CloudLandParty` has no `updatedAt`, so there is no safe token for `updateCloudParty`'s concurrency filter from the UI layer; a previously-synced identity is re-CREATEd with its persisted id every save instead, relying on the backend's already-verified 23505-retry/duplicate-content check (never a silent overwrite) — the backend's UPDATE path exists but is not called from the UI yet. A client-generated UUID is assigned on first sync and persisted back via `PdfIdentityPerson.id`, round-tripped through the existing `STORAGE_KEY` auto-save effect. No UI/layout was changed; sync results are tracked in a `partiesCloudSync` React state, deliberately not rendered. `index.ts` was not updated to barrel-export the new parties module (both parties sprints scoped it out). Dev-gated only, same as parent/geometry sync; disabled in Production.

### Not started
- Documents / Supabase Storage (deliberately deferred to its own sprint)
- Service Request backend (UI is currently a stub)
- Admin dashboard, Quotation, Payment, Listing Partner, RMR/SPNB — no work has begun; not scheduled

See `docs/ai/MODULE_STATUS.md` for the full per-module table.

## Branches of record

| Branch | Contents | State |
|---|---|---|
| `main` | Everything through PR #31: geometry backend, FieldGpsLite Advanced-mode gating regression fix, Dev-only parent `land_records` UI wiring, the cloud-write QA gate regression fix, Points create-only cloud persistence, the hardened cloud read gate, Dev-gated boundary geometry UI wiring (PR #24), a documentation sync (PR #25), local points-management UI completion — list/rename/delete/import bridge, **not** cloud-write wiring (PR #26), three mobile/UI layout hardening fixes (PR #27, #28, #29), and Parties cloud create+update backend + create-only UI wiring (PR #31) | Merged at `f98445c8493f1764188ab6de8cf5f905274b0f51`; Production cloud activation remains disabled |
| `sprint-02c2-parent-cloud-ui-wiring` | Source branch for PR #18. Its follow-up commit `b26ba8f` bundled two things: (1) the `geometry-write.qa.ts` / `land-records-write.qa.ts` QA gate fix — **now merged separately via PR #19** (`aeb6324`), isolated through a dedicated branch/worktree rather than cherry-picked whole; and (2) `b26ba8f`'s own `docs/ai/PROJECT_STATE.md` / `MODULE_STATUS.md` / `RELEASE_CHECKLIST.md` edits — **still not merged to `main`**, superseded by this documentation pass instead | Retain; only the doc-edit portion of `b26ba8f` remains unmerged/unhandled |
| `sprint-02d1b-points-cloud-write` | Original source branch for Points cloud persistence. Independently, and without visibility into PR #23/#24 landing on `main` in parallel, this branch was also used to build its own read-gate hardening and geometry UI wiring (different id-mapping design: reused the parent land record's own id, rather than an existing `drawing_objects` entry's id). A 2026-07-20 investigation confirmed: its points work is byte-identical to PR #21; its read-gate fix is functionally identical to PR #23; its geometry wiring is superseded by PR #24's different (and more complete — PR #24 also carries the child-cache concurrency fix noted above) implementation. Nothing on this branch is missing from `main` | **Superseded — preserved unchanged for audit/reference only. Do not push, merge, or delete.** |
| `sprint-ai-f0-development-foundation` | This governance/tooling foundation | In progress |
| `sprint-parties-cloud-write` | `land_parties` cloud create+update backend (`parties-repository.ts`, `parties-write-coordinator.ts`, `parties-validation.ts`, `parties-cache.ts`, `parties-write.qa.ts`) plus create-only UI wiring into `src/app/page.tsx`'s save flow (`parties-ui-sync.ts`, `parties-ui-sync.qa.ts`), based on `main@9abe090`. QA-passed (backend 30/30, UI-sync 11/11); zero regressions across all 10 pre-existing `.qa.ts` suites (182/182) | **Merged via PR #31 (squash) at `main@f98445c`, 2026-07-25.** Remote branch retained (not deleted) — safe to delete once the owner confirms; not deleted automatically. |

## Latest merged sprint

**PR #31** — `land_parties` cloud create+update backend, plus create-only UI wiring of the four `PdfIdentityFields` entries into `src/app/page.tsx`'s save flow (`main@f98445c8493f1764188ab6de8cf5f905274b0f51`), squash-merged 2026-07-25 from `sprint-parties-cloud-write` (base `main@9abe090`). Pre-merge verification (re-run fresh against the merge base, not assumed): all 11 `.qa.ts` suites pass (193/193 individual assertions — the 9 from the 2026-07-20 baseline plus `parties-write.qa.ts` 30 and `parties-ui-sync.qa.ts` 11), `npx tsc --noEmit` clean, `npx eslint .` 0 errors (31 pre-existing warnings), `npm run build` succeeds. `id_number` (ADR-014) confirmed structurally unreachable in any outbound Supabase payload (`parties-write.qa.ts` Tests 11–13). Diff vs. `main@9abe090`: 13 files, +2,435/−4, matching the reviewed pre-PR figures exactly.

Between PR #24 and PR #31, five other PRs merged that this file had not previously recorded — backfilled here 2026-07-25:
- **PR #25** (`80d7f6b`) — documentation sync after PR #23/#24 (the pass this file itself is a continuation of).
- **PR #26** (`1b82317`) — completed local point-management UI (FieldGpsLite point list, delete confirmation, inline rename, single-point CSV/GeoJSON import bridge). **Does not** touch `src/lib/land-records/points-*.ts` or wire `createCloudPoint` — the cloud-write UI-wiring gap for points remains open (see "Current approved next sprint" — Points cloud-write UI wiring).
- **PR #27** (`1a0ecdb`) — mobile layout hardening: CategoryDrawer/Lot Information drawer kept within viewport.
- **PR #28** (`3a6344b`) — mobile layout: CategoryDrawer edge handle no longer overlaps the Lot Information drawer.
- **PR #29** (`9abe090`) — mobile map layout and lot information UX improvements.

None of PR #25–#29 touch any cloud-write path, Supabase migration, or `docs/ai/SAFETY_RULES.md`-governed area.

## Current approved next sprint

No sprint is currently approved to start. Reviewed item-by-item against `main@37f4065` on 2026-07-25; exactly two substantive items are actually open (verified from fact, not forced to a round number):

1. **Points cloud-write UI wiring.** PR #21 (`main@d071d73`) provides create-only `land_points` backend persistence; nothing calls `createCloudPoint` from any UI save flow yet. **PR #26 is not this** — PR #26 ("complete points UI wiring") only completed local point-list management UX (FieldGpsLite point list, delete confirmation, inline rename, single-point CSV/GeoJSON import bridge). It touches `page.tsx`/`FieldGpsLite.tsx`/`globals.css`/`import-geometries.ts` only — none of `src/lib/land-records/points-*.ts` — and never calls the cloud-write coordinator. Confirmed by inspecting PR #26's actual diff, not by its title; do not let this be re-closed by assumption again. Needs its own explicit scope and approval before anyone starts it — no such sprint is approved as of this writing.
2. **Documents / Supabase Storage (ADR-012).** Not started. Full module-tracking entry lives in `docs/ai/MODULE_STATUS.md` (row "Documents") and this file's Modules section ("Not started" list) — this entry is the cross-reference into "next sprint," not a duplicate, so the item is never again missing from this list. Current status: the `land-documents` Supabase Storage bucket (private, 10MB file-size limit, `image/*` + `application/pdf`) is being created manually by the owner directly via the Supabase Dashboard/CLI, separately from any Claude Code session — **not yet confirmed complete**. No cloud-write code, `storage.objects` RLS policy, or application code exists yet; remains its own, separately-scoped future sprint per ADR-012.

### Housekeeping (rendah keutamaan)

Small, scoped, non-blocking items — none of these are sprints in their own right:

- Decide whether to merge the remaining, still-unmerged doc-edit portion of `b26ba8f` on `sprint-02c2-parent-cloud-ui-wiring` (its QA-fix portion already merged separately via PR #19). Branch still exists on remote as of 2026-07-25; do not delete until this is intentionally handled.
- Formally record PR #24's geometry-id mapping (an existing `drawing_objects` entry's own id, filtered to `category === "parent_lot"`) as its own ADR — `docs/ai/ARCHITECTURE_DECISIONS.md` currently stops at ADR-015 and does not document this choice, even though it shipped in PR #24.
- Clean up the now-superseded `sprint-02d1b-points-cloud-write` branch (confirmed to contain nothing `main` lacks) — still exists on remote as of 2026-07-25; no urgency.
- Decide whether/when to add `updatedAt`/`createdAt` to `CloudLandParty` (`types.ts`/`mapper.ts`, both shared/Foundation-owned) so a real `updateCloudParty` UI path can eventually replace parties' current re-CREATE-on-every-save behavior.
- Decide whether to surface parties sync status in the UI (a `partiesCloudSync` state from PR #31 exists, tracked but deliberately unrendered) — mirroring geometry's status message, or left as-is.
- Barrel-export the parties modules via `index.ts` (`parties-repository.ts`/`parties-validation.ts`/`parties-cache.ts`/`parties-write-coordinator.ts`/`parties-ui-sync.ts`) — additive only, out of scope for both parties sprints that shipped them.
- Delete the `sprint-parties-cloud-write` branch on the remote — merged via PR #31, confirmed safe, but **still exists** as of 2026-07-25: a `git push --delete` from a Claude Code session was blocked by that session's proxy egress policy (403), and no GitHub API tool for branch deletion was available either. Needs manual deletion via the GitHub UI.

### Selesai (rekod sejarah, tidak lagi aktif)

- ~~Harden `isCloudReadEnabled()`~~ — done, PR #23 (`main@a88316d`).
- ~~Geometry UI wiring~~ — done, PR #24 (`main@91e64c0`).
- ~~Parties cloud create+update backend + create-only UI wiring~~ — done, PR #31 (`main@f98445c8493f1764188ab6de8cf5f905274b0f51`).

No Production/Beta project, migration, remote SQL, real cloud operation, or manual/Production deployment was touched by PR #18, PR #19, PR #21, PR #23–#29, PR #31, or this documentation pass. GitHub-triggered Vercel preview checks ran normally and passed on PR #31 (both `sabahlot` and `sabahlot-handheld` projects, `Ready`).

## Standing prohibitions

- Never touch `sabahlot` / `hakncr` Supabase projects, or Beta/Production, without a separate explicit approval for that specific action.
- Never write to `land_record_geometries` / `land_points` / `land_parties` / `documents` outside an explicitly-scoped, approved sprint for that table.
- Never activate any cloud read/write path in the Production UI.
- Never migrate legacy local data to cloud automatically.
- Never add a database migration inside a non-migration sprint.
- See `docs/ai/SAFETY_RULES.md` for the full, authoritative list.
