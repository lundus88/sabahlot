# SabahLot — Project State

_Last updated: 2026-07-20 (post-merge verification for PR #18 and PR #19). Update this file at the end of every merged sprint — it is the single source of truth for "what is actually true right now," not the sprint reports themselves._

## Vision

SabahLot is a preliminary land-record and field-survey assistance tool for Sabah land matters. It helps public users, surveyors, and land officers capture, organize, and (increasingly) cloud-sync GPS points, drawn geometry, and case metadata for land applications, inheritance land, and customary land (NCR) cases. Every output is explicitly **preliminary** — not a legal survey plan, not proof of boundary, not an official approval by JTU, Land Office, or any authority.

## Status summary

| Dimension | Status |
|---|---|
| Cloud writes | `land_records` parent create/update is merged and wired to the local-first save flow in Dev. Geometry create/update is merged but not wired to the UI. Points work exists on a separate unmerged branch; parties remain unimplemented. |
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

### Not started
- Points cloud write is not merged to `main`; implementation work currently exists on the separate `sprint-02d1b-points-cloud-write` branch and must be reviewed/released independently.
- Parties cloud write (create + update, PDPA-minimal payload)
- Documents / Supabase Storage (deliberately deferred to its own sprint)
- Service Request backend (UI is currently a stub)
- Admin dashboard, Quotation, Payment, Listing Partner, RMR/SPNB — no work has begun; not scheduled

See `docs/ai/MODULE_STATUS.md` for the full per-module table.

## Branches of record

| Branch | Contents | State |
|---|---|---|
| `main` | Everything through PR #19: geometry backend, FieldGpsLite Advanced-mode gating regression fix, Dev-only parent `land_records` UI wiring, and the cloud-write QA gate regression fix | Merged at `aeb6324`; Production cloud activation remains disabled |
| `sprint-02c2-parent-cloud-ui-wiring` | Source branch for PR #18. Its follow-up commit `b26ba8f` bundled two things: (1) the `geometry-write.qa.ts` / `land-records-write.qa.ts` QA gate fix — **now merged separately via PR #19** (`aeb6324`), isolated through a dedicated branch/worktree rather than cherry-picked whole; and (2) `b26ba8f`'s own `docs/ai/PROJECT_STATE.md` / `MODULE_STATUS.md` / `RELEASE_CHECKLIST.md` edits — **still not merged to `main`**, superseded by this documentation pass instead | Retain; only the doc-edit portion of `b26ba8f` remains unmerged/unhandled |
| `sprint-02d1b-points-cloud-write` | Points cloud persistence work | Separate in-progress branch; not merged to `main`; **not started, advanced, or completed by this or the PR #18/#19 post-merge documentation work**; do not modify from here |
| `sprint-ai-f0-development-foundation` | This governance/tooling foundation | In progress |

## Latest merged sprint

**PR #19** — cloud-write QA gate regression fix (`land-records-write.qa.ts`, `geometry-write.qa.ts` only), merged to `main` 2026-07-20 → `main@aeb6324a2a41178000eb44eef5d412b60dc53353`. The merge contains exactly the 2 reviewed QA files, blob-identical to the audited fix. Preceded by **PR #18** — local-first parent `land_records` Dev UI wiring, merged → `main@aa2353178f7e7ffd332faf20fd1ef7761e4d395e` (exactly the 10 reviewed files).

## Current approved next sprint

No sprint is currently approved to start. Recommended next actions, each requiring its own explicit scope and approval:

1. Decide whether to merge the remaining, still-unmerged **doc-edit portion** of `b26ba8f` on `sprint-02c2-parent-cloud-ui-wiring` (its QA-fix portion is already merged via PR #19); do not delete that branch until this is intentionally handled.
2. Review and release the already-existing `sprint-02d1b-points-cloud-write` branch independently; do not mix it with PR #18/#19 post-merge documentation — it remains untouched, unstarted, and unreviewed by all post-merge documentation work to date.
3. Harden `isCloudReadEnabled()` with the same exact `sabahlot-dev` project check already applied to cloud writes.
4. Start Geometry UI wiring only after the preceding work is settled; keep migrations, TOCTOU changes, parties, and documents out of that sprint.

No Production/Beta project, migration, remote SQL, or deployment was touched by PR #18, PR #19, or this documentation pass.

## Standing prohibitions

- Never touch `sabahlot` / `hakncr` Supabase projects, or Beta/Production, without a separate explicit approval for that specific action.
- Never write to `land_record_geometries` / `land_points` / `land_parties` / `documents` outside an explicitly-scoped, approved sprint for that table.
- Never activate any cloud read/write path in the Production UI.
- Never migrate legacy local data to cloud automatically.
- Never add a database migration inside a non-migration sprint.
- See `docs/ai/SAFETY_RULES.md` for the full, authoritative list.
