# SabahLot — Project State

_Last updated: 2026-07-17 (post Sprint 02C-2 QA regression fix). Update this file at the end of every merged sprint — it is the single source of truth for "what is actually true right now," not the sprint reports themselves._

## Vision

SabahLot is a preliminary land-record and field-survey assistance tool for Sabah land matters. It helps public users, surveyors, and land officers capture, organize, and (increasingly) cloud-sync GPS points, drawn geometry, and case metadata for land applications, inheritance land, and customary land (NCR) cases. Every output is explicitly **preliminary** — not a legal survey plan, not proof of boundary, not an official approval by JTU, Land Office, or any authority.

## Status summary

| Dimension | Status |
|---|---|
| Cloud writes | `land_records` (create + update) and `land_record_geometries` (create + update) are both merged to `main`. Parent `land_records` UI wiring (`syncParentLandRecordToCloud`, `src/app/page.tsx` save flow) exists on unmerged branch `sprint-02c2-parent-cloud-ui-wiring` — see Branches below. Points/parties/documents writes not started. |
| Production UI cloud activation | **Disabled.** On `main`, no cloud read/write path is wired into `src/app/page.tsx` or any user-facing screen. On the unmerged `sprint-02c2-parent-cloud-ui-wiring` branch, the parent `land_records` save flow is wired to the UI but stays fail-closed outside Dev (`isCloudWriteEnabled()` requires both `NODE_ENV !== "production"` and the configured Supabase URL to resolve to the `sabahlot-dev` project). |
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
- **Land Record cloud create/update** — `src/lib/land-records/write-coordinator.ts`. Merged to `main` (PR #14). Dev-gated. UI wiring (`src/lib/land-records/parent-ui-sync.ts`, `src/app/page.tsx`) exists on unmerged branch `sprint-02c2-parent-cloud-ui-wiring` — not yet on `main`.
- **Geometry cloud create/update** — `src/lib/land-records/geometry-write-coordinator.ts`. Merged to `main` (PR #16). Dev-gated, no UI.

### Not started
- Points cloud write (create-only, scoped Sprint 02D — see Architecture Decisions)
- Parties cloud write (create + update, PDPA-minimal payload)
- Documents / Supabase Storage (deliberately deferred to its own sprint)
- Service Request backend (UI is currently a stub)
- Admin dashboard, Quotation, Payment, Listing Partner, RMR/SPNB — no work has begun; not scheduled

See `docs/ai/MODULE_STATUS.md` for the full per-module table.

## Branches of record

| Branch | Contents | State |
|---|---|---|
| `main` | Everything through PR #17 (land_records cloud read + create/update, geometry cloud create/update, FieldGpsLite Advanced-mode gating fix) | Merged, deployed to Dev via CLI (not via UI) |
| `sprint-02c2-parent-cloud-ui-wiring` | Parent `land_records` UI wiring (`parent-ui-sync.ts`, `src/app/page.tsx` save-flow wiring, fail-closed dev-project gate, QA) plus a 2026-07-17 fix to two pre-existing QA scripts (`land-records-write.qa.ts`, `geometry-write.qa.ts`) that had regressed against the new gate | Committed and pushed to `origin`, **not yet merged to `main`** — awaiting independent review and owner merge approval |
| `sprint-ai-f0-development-foundation` | This governance/tooling foundation | In progress |

## Latest merged sprint

**PR #17** — restored Advanced-mode gating for `FieldGpsLite` (`778b3b8`), merged to `main` 2026-07-16. Preceded by **PR #16** — safe cloud create/update for `land_record_geometries` (`b6d0a25`), merged to `main` 2026-07-15.

## Current approved next sprint

**Sprint 02C-2 (Parent land_records UI wiring)** is implemented and its own QA (30 executed test cases across `feature-gate.qa.ts`, `parent-ui-sync.qa.ts`, `parent-ui-sync-integration.qa.ts`) passes. On 2026-07-17 two **pre-existing** regression QA scripts (`land-records-write.qa.ts` from Sprint 02C, `geometry-write.qa.ts` from the geometry sprint) were found failing against the sprint's new fail-closed gate and were fixed (see `docs/ai/RELEASE_CHECKLIST.md`); all QA, `npx tsc --noEmit`, `npx eslint .`, and `npm run build` now pass on this branch. It exists on `sprint-02c2-parent-cloud-ui-wiring`, committed and pushed, but **awaiting independent review and explicit owner approval to merge to `main`.**

Sprint 02D-0A also approved (GO) the design for **Points (create-only)** and **Parties (create+update)** — implementation for those has not started.

## Standing prohibitions

- Never touch `sabahlot` / `hakncr` Supabase projects, or Beta/Production, without a separate explicit approval for that specific action.
- Never write to `land_record_geometries` / `land_points` / `land_parties` / `documents` outside an explicitly-scoped, approved sprint for that table.
- Never activate any cloud read/write path in the Production UI.
- Never migrate legacy local data to cloud automatically.
- Never add a database migration inside a non-migration sprint.
- See `docs/ai/SAFETY_RULES.md` for the full, authoritative list.
