# SabahLot — Project State

_Last updated: 2026-07-12 (Sprint AI-F0). Update this file at the end of every merged sprint — it is the single source of truth for "what is actually true right now," not the sprint reports themselves._

## Vision

SabahLot is a preliminary land-record and field-survey assistance tool for Sabah land matters. It helps public users, surveyors, and land officers capture, organize, and (increasingly) cloud-sync GPS points, drawn geometry, and case metadata for land applications, inheritance land, and customary land (NCR) cases. Every output is explicitly **preliminary** — not a legal survey plan, not proof of boundary, not an official approval by JTU, Land Office, or any authority.

## Status summary

| Dimension | Status |
|---|---|
| Cloud writes | `land_records` only (create + update). Geometry/points/parties writes are implemented on an unmerged branch (see below) but not yet merged to `main`. |
| Production UI cloud activation | **Disabled.** No cloud read/write path is wired into `src/app/page.tsx` or any user-facing screen. |
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
- **Land Record cloud create/update** — `src/lib/land-records/write-coordinator.ts`. Merged to `main` (PR #14). Dev-gated, no UI.
- **Geometry cloud create/update** — implemented, QA-passed, **not yet merged** (see Branches below).

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
| `main` | Everything through PR #14 (land_records cloud read + create/update) | Merged, deployed to Dev via CLI (not via UI) |
| `sprint-02d1a-geometry-cloud-write` | Geometry cloud create/update (child-types, geometry-repository, geometry-validation, geometry-write-coordinator, geometry-cache, QA) | **Uncommitted working tree**, PASS on independent review, not yet committed/pushed/PR'd — do not touch from any other worktree |
| `sprint-ai-f0-development-foundation` | This governance/tooling foundation | In progress |

## Latest merged sprint

**Sprint 02C-1 (+ Patch 1)** — safe cloud create/update for `land_records`, merged via PR #14 → `main@37e717f74fd54f65f0312a289f7de87345f76527`.

## Current approved next sprint

**Sprint 02D-1A (Geometry)** is designed, implemented, and independently reviewed (PASS) but **awaiting commit/push/PR approval** — it exists only as an uncommitted working tree on `sprint-02d1a-geometry-cloud-write` in the original workspace. The next action on that branch is an explicit owner instruction to commit it.

Sprint 02D-0A also approved (GO) the design for **Points (create-only)** and **Parties (create+update)** — implementation for those has not started.

## Standing prohibitions

- Never touch `sabahlot` / `hakncr` Supabase projects, or Beta/Production, without a separate explicit approval for that specific action.
- Never write to `land_record_geometries` / `land_points` / `land_parties` / `documents` outside an explicitly-scoped, approved sprint for that table.
- Never activate any cloud read/write path in the Production UI.
- Never migrate legacy local data to cloud automatically.
- Never add a database migration inside a non-migration sprint.
- See `docs/ai/SAFETY_RULES.md` for the full, authoritative list.
