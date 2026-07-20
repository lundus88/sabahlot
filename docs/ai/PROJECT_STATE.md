# SabahLot — Project State

_Last updated: 2026-07-20 (post-merge verification for PR #21). Update this file at the end of every merged sprint — it is the single source of truth for "what is actually true right now," not the sprint reports themselves._

## Vision

SabahLot is a preliminary land-record and field-survey assistance tool for Sabah land matters. It helps public users, surveyors, and land officers capture, organize, and (increasingly) cloud-sync GPS points, drawn geometry, and case metadata for land applications, inheritance land, and customary land (NCR) cases. Every output is explicitly **preliminary** — not a legal survey plan, not proof of boundary, not an official approval by JTU, Land Office, or any authority.

## Status summary

| Dimension | Status |
|---|---|
| Cloud writes | `land_records` parent create/update is merged and wired to the local-first save flow in Dev. Geometry create/update and Points create-only persistence are merged but not wired to the UI. Parties remain unimplemented. |
| Production UI cloud activation | **Disabled.** Parent `land_records` sync is wired only behind the non-production, exact-`sabahlot-dev` write gate. Geometry/points/parties remain unwired. |
| QA integrity (cloud-write gate) | PR #19 (`main@aeb6324`) fixed a regression where tightening the write gate in PR #18 caused `land-records-write.qa.ts` and `geometry-write.qa.ts` to silently short-circuit to "gate disabled" and report a false PASS without ever exercising the fake Supabase cloud-write path. Both scripts now explicitly set `NODE_ENV=development` and `NEXT_PUBLIC_SUPABASE_URL` to the approved `sabahlot-dev` project (`xsflrehitrmobiyfbfhk`) for the QA process only, so they genuinely exercise the gated code path again. No `.env` file, production code path, migration, remote SQL, or Beta/Production project was touched by this fix. |
| Legacy local workflow | Fully preserved. `src/lib/local-lots.ts` (`sabahlot_local_lots_v1`) remains the primary, unmodified local save/load/delete path. |
| Point conflict control | Not possible without a migration — `land_points` has no `updated_at` column. Point cloud writes are scoped to **create-only**. |

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
- **Land Record cloud read** — `src/lib/land-records/index.ts` (`loadCloudLandRecords`). Merged to `main`. Dev-gated, no UI.
- **Land Record cloud create/update** — backend merged in PR #14; local-first Dev UI wiring merged in PR #18 (`main@aa23531`). The parent sync uses stable UUIDs and server `updated_at`, and fails closed unless the configured Supabase hostname is exactly `xsflrehitrmobiyfbfhk.supabase.co` in a non-production build.
- **Geometry cloud create/update** — merged in PR #16 (`main@b6d0a25`), QA-passed, not wired to the UI.
- **Points cloud create-only** — merged in PR #21 (`main@d071d73`), QA-passed, not wired to the UI. Update/delete remain deliberately deferred because `land_points` has no `updated_at` concurrency token.

### Not started
- Parties cloud write (create + update, PDPA-minimal payload)
- Documents / Supabase Storage (deliberately deferred to its own sprint)
- Service Request backend (UI is currently a stub)
- Admin dashboard, Quotation, Payment, Listing Partner, RMR/SPNB — no work has begun; not scheduled

See `docs/ai/MODULE_STATUS.md` for the full per-module table.

## Branches of record

| Branch | Contents | State |
|---|---|---|
| `main` | Everything through PR #21: geometry backend, FieldGpsLite Advanced-mode gating regression fix, Dev-only parent `land_records` UI wiring, the cloud-write QA gate regression fix, and Points create-only cloud persistence | Merged at `d071d73`; Production cloud activation remains disabled |
| `sprint-02c2-parent-cloud-ui-wiring` | Source branch for PR #18. Its follow-up commit `b26ba8f` bundled two things: (1) the `geometry-write.qa.ts` / `land-records-write.qa.ts` QA gate fix — **now merged separately via PR #19** (`aeb6324`), isolated through a dedicated branch/worktree rather than cherry-picked whole; and (2) `b26ba8f`'s own `docs/ai/PROJECT_STATE.md` / `MODULE_STATUS.md` / `RELEASE_CHECKLIST.md` edits — **still not merged to `main`**, superseded by this documentation pass instead | Retain; only the doc-edit portion of `b26ba8f` remains unmerged/unhandled |
| `sprint-02d1b-points-cloud-write` | Original source branch for Points cloud persistence | Superseded by the rebased review branch and merged through PR #21 (`d071d73`); retain until separately approved branch cleanup |
| `sprint-ai-f0-development-foundation` | This governance/tooling foundation | In progress |

## Latest merged sprint

**PR #21** — authenticated create-only Points cloud persistence, merged to `main` 2026-07-20 → `main@d071d730baec4ed25ea4215e1a06121650870cbd`. The merge contains exactly the 8 reviewed `src/lib/land-records/**` files (1,718 insertions), with all 8 QA suites passing (143/143), TypeScript/build passing, and ESLint at 0 errors. No UI wiring, migration, remote SQL, real cloud operation, or Production/Beta activation was included.

## Current approved next sprint

No sprint is currently approved to start. Recommended next actions, each requiring its own explicit scope and approval:

1. Decide whether to merge the remaining, still-unmerged **doc-edit portion** of `b26ba8f` on `sprint-02c2-parent-cloud-ui-wiring` (its QA-fix portion is already merged via PR #19); do not delete that branch until this is intentionally handled.
2. Decide and scope Points UI wiring separately; PR #21 provides create-only backend persistence but intentionally does not connect it to the application UI.
3. Harden `isCloudReadEnabled()` with the same exact `sabahlot-dev` project check already applied to cloud writes.
4. Start Geometry UI wiring only after the preceding work is settled; keep migrations, TOCTOU changes, parties, and documents out of that sprint.

No Production/Beta project, migration, remote SQL, real cloud operation, or manual/Production deployment was touched by PR #18, PR #19, PR #21, or this documentation pass. GitHub-triggered Vercel preview checks ran normally and passed.

## Standing prohibitions

- Never touch `sabahlot` / `hakncr` Supabase projects, or Beta/Production, without a separate explicit approval for that specific action.
- Never write to `land_record_geometries` / `land_points` / `land_parties` / `documents` outside an explicitly-scoped, approved sprint for that table.
- Never activate any cloud read/write path in the Production UI.
- Never migrate legacy local data to cloud automatically.
- Never add a database migration inside a non-migration sprint.
- See `docs/ai/SAFETY_RULES.md` for the full, authoritative list.
