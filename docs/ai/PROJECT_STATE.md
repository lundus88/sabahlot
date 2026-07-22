# SabahLot — Project State

_Last updated: 2026-07-20 (post-merge verification for PR #23 and PR #24). Update this file at the end of every merged sprint — it is the single source of truth for "what is actually true right now," not the sprint reports themselves._

## Vision

SabahLot is a preliminary land-record and field-survey assistance tool for Sabah land matters. It helps public users, surveyors, and land officers capture, organize, and (increasingly) cloud-sync GPS points, drawn geometry, and case metadata for land applications, inheritance land, and customary land (NCR) cases. Every output is explicitly **preliminary** — not a legal survey plan, not proof of boundary, not an official approval by JTU, Land Office, or any authority.

## Status summary

| Dimension | Status |
|---|---|
| Cloud writes | `land_records` parent create/update and the boundary **geometry** sync are merged and wired to the local-first save flow in Dev (PR #24). Points create-only persistence is merged but not wired to the UI. Parties remain unimplemented. |
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
- **Points cloud create-only** — merged in PR #21 (`main@d071d73`), QA-passed, not wired to the UI. Update/delete remain deliberately deferred because `land_points` has no `updated_at` concurrency token.

### Active in Dev (wired to UI, non-production gate only)
- **Geometry cloud create/update** — backend merged in PR #16 (`main@b6d0a25`); UI wiring merged in PR #24 (`main@91e64c0`) via `src/lib/land-records/child-ui-sync.ts` (`syncParentGeometryToCloud`), called from `src/app/page.tsx`'s save flow immediately after the parent sync settles. Syncs only the one `drawingObjects` entry with `geometryType === "polygon"` and `category === "parent_lot"` — that entry's own id is reused as the geometry's cloud id (not the parent land record's id). If zero or more than one such object exists, the sync stays local-only / is rejected rather than guessing. Other drawn objects (proposed lots, lines, etc.) are not cloud-synced. Dev-gated only, same as parent sync; disabled in Production.

### Not started
- Parties cloud write (create + update, PDPA-minimal payload)
- Documents / Supabase Storage (deliberately deferred to its own sprint)
- Service Request backend (UI is currently a stub)
- Admin dashboard, Quotation, Payment, Listing Partner, RMR/SPNB — no work has begun; not scheduled

See `docs/ai/MODULE_STATUS.md` for the full per-module table.

## Branches of record

| Branch | Contents | State |
|---|---|---|
| `main` | Everything through PR #24: geometry backend, FieldGpsLite Advanced-mode gating regression fix, Dev-only parent `land_records` UI wiring, the cloud-write QA gate regression fix, Points create-only cloud persistence, the hardened cloud read gate, and Dev-gated boundary geometry UI wiring | Merged at `91e64c0`; Production cloud activation remains disabled |
| `sprint-02c2-parent-cloud-ui-wiring` | Source branch for PR #18. Its follow-up commit `b26ba8f` bundled two things: (1) the `geometry-write.qa.ts` / `land-records-write.qa.ts` QA gate fix — **now merged separately via PR #19** (`aeb6324`), isolated through a dedicated branch/worktree rather than cherry-picked whole; and (2) `b26ba8f`'s own `docs/ai/PROJECT_STATE.md` / `MODULE_STATUS.md` / `RELEASE_CHECKLIST.md` edits — **still not merged to `main`**, superseded by this documentation pass instead | Retain; only the doc-edit portion of `b26ba8f` remains unmerged/unhandled |
| `sprint-02d1b-points-cloud-write` | Original source branch for Points cloud persistence. Independently, and without visibility into PR #23/#24 landing on `main` in parallel, this branch was also used to build its own read-gate hardening and geometry UI wiring (different id-mapping design: reused the parent land record's own id, rather than an existing `drawing_objects` entry's id). A 2026-07-20 investigation confirmed: its points work is byte-identical to PR #21; its read-gate fix is functionally identical to PR #23; its geometry wiring is superseded by PR #24's different (and more complete — PR #24 also carries the child-cache concurrency fix noted above) implementation. Nothing on this branch is missing from `main` | **Superseded — preserved unchanged for audit/reference only. Do not push, merge, or delete.** |
| `sprint-ai-f0-development-foundation` | This governance/tooling foundation | In progress |
| `claude/sabahlot-hooks-wizard-wlb6mj` | 2026-07-22 "Bug Fix + Form Redesign" spec handover. Audited the described `FieldGpsLite.tsx` Rules-of-Hooks crash and found it already fixed on this branch's base (PR #17, `778b3b8`, 2026-07-16) -- re-verified via its existing regression QA, no code change made. Redesigned the Lot Information form (`src/app/page.tsx` + new `src/app/components/LotFormWizard.tsx`) into an 8-step wizard for Public mode with conditional step-skip and full EN/BM/中文 i18n; Advanced mode keeps the original single-page "expert view" unchanged. No cloud-write, `local-lots.ts`, or `land-records/**` code touched. See `docs/ai/MODULE_STATUS.md` Notes for the full report, including a pre-existing, unrelated appMode/language `localStorage` persistence bug found and flagged (not fixed) during verification. | Not yet merged; awaiting owner review |

## Latest merged sprint

**PR #24** — Dev-gated boundary geometry cloud sync wired into the save flow (`main@91e64c056596d8002769feb205ae69acd0d3b562`), preceded by **PR #23** — hardened `isCloudReadEnabled()` to require the exact `sabahlot-dev` project, matching the write gate (`main@a88316deb981b79b6a1f3a52a43760f699596ce8`). Verified 2026-07-20 against current `main`: all 9 `.qa.ts` suites pass (152/152 individual assertions — `land-records.qa.ts` 10, `land-records-write.qa.ts` 21, `geometry-write.qa.ts` 47, `parent-ui-sync.qa.ts` 15, `parent-ui-sync-integration.qa.ts` 7, `points-write.qa.ts` 34, `child-ui-sync.qa.ts` 8, `feature-gate.qa.ts` 9, `local-lots.qa.ts` 1), `npx tsc --noEmit` clean, `npx eslint .` 0 errors (31 pre-existing warnings), `npm run build` succeeds.

## Current approved next sprint

No sprint is currently approved to start. Recommended next actions, each requiring its own explicit scope and approval:

1. Decide whether to merge the remaining, still-unmerged **doc-edit portion** of `b26ba8f` on `sprint-02c2-parent-cloud-ui-wiring` (its QA-fix portion is already merged via PR #19); do not delete that branch until this is intentionally handled.
2. Decide and scope Points UI wiring separately; PR #21 provides create-only backend persistence but intentionally does not connect it to the application UI.
3. ~~Harden `isCloudReadEnabled()`~~ — done, PR #23.
4. ~~Geometry UI wiring~~ — done, PR #24.
5. Consider formally recording PR #24's geometry-id mapping (an existing `drawing_objects` entry's own id, filtered to `category === "parent_lot"`) as its own ADR — `docs/ai/ARCHITECTURE_DECISIONS.md` currently stops at ADR-015 and does not document this choice, even though it's already shipped. Not done as part of this documentation pass (out of the approved scope — PROJECT_STATE.md/MODULE_STATUS.md only); flagged here as a suggested follow-up.
6. Independently review and, if approved, clean up (retain-only vs. eventually delete) the now-superseded `sprint-02d1b-points-cloud-write` branch — no urgency, since it's confirmed to contain nothing `main` lacks.

No Production/Beta project, migration, remote SQL, real cloud operation, or manual/Production deployment was touched by PR #18, PR #19, PR #21, PR #23, PR #24, or this documentation pass. GitHub-triggered Vercel preview checks ran normally and passed.

## Standing prohibitions

- Never touch `sabahlot` / `hakncr` Supabase projects, or Beta/Production, without a separate explicit approval for that specific action.
- Never write to `land_record_geometries` / `land_points` / `land_parties` / `documents` outside an explicitly-scoped, approved sprint for that table.
- Never activate any cloud read/write path in the Production UI.
- Never migrate legacy local data to cloud automatically.
- Never add a database migration inside a non-migration sprint.
- See `docs/ai/SAFETY_RULES.md` for the full, authoritative list.
