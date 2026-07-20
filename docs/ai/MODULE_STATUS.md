# SabahLot — Module Status

_Last updated: 2026-07-20 (post-merge documentation sync for PR #23 and PR #24). Update this table at the end of every merged sprint. "Environment" reflects where the module is actually usable today, not where it's theoretically deployed._

| Module | Status | Environment | Cloud write | UI status | Next action |
|---|---|---|---|---|---|
| Map / local lots | Done | Alpha/Beta (localStorage) | No (legacy `lots` dual-write only, insert-only, out of scope for current work) | Active | None planned in current sprint series |
| Handheld GPS | Done | Alpha/Beta | No | Active | None planned |
| AR Find Point | Done | Alpha/Beta | No | Active | None planned |
| Beta Notice | Done | Beta | No | Active | None |
| Feedback | Done (localStorage only) | Alpha/Beta | No (cloud `feedback` table exists, unused) | Active | Owner decision needed on cloud sync |
| Manual Beta (onboarding) | Done | Beta | No | Active | None |
| Authentication | Done | Dev/Beta (Supabase Auth) | N/A | Active | None |
| Land Record cloud read | Merged (`main`); read-gate hardened (`isCloudReadEnabled()` now project-scoped, matching the write gate) in PR #23 | Dev only | Read-only | **Disabled** (no UI wiring) | Owner decision on UI integration point |
| Land Record cloud create/update | Merged (`main`, PR #18; backend from PR #14) | Dev only (`sabahlot-dev`) | `land_records` | **Active in local-first save flow, Dev gate only.** PR #24 also fixed a bug here: parent updates were silently discarding cached child (geometry/points/parties) concurrency data — now preserved | Independently verify real-browser UX; keep Production disabled |
| Geometry | Backend merged (`main`, PR #16); UI wiring merged in PR #24 (`child-ui-sync.ts`, syncs the `drawing_objects` entry categorized `parent_lot`, using that entry's own id) | Dev only | `land_record_geometries` | **Active in local-first save flow, Dev gate only** | Independently verify real-browser UX; consider recording the geometry-id mapping as a formal ADR (none exists yet) |
| Points | Backend merged (`main`, PR #21; create-only) | Dev only | `land_points` INSERT + retry verification | **Disabled** | Scope a separate UI-wiring sprint; update/delete remain deferred pending a concurrency-safe schema design |
| Parties | Designed (GO), not implemented | — | Not implemented | **Disabled** | Implementation sprint (PDPA-minimal payload, per ADR-014) |
| Documents | Not started | — | Not implemented | **Disabled** | Separate sprint (per ADR-012), not yet scheduled |
| Service Request | UI stub only | Alpha/Beta | No | Stub (redirects to feedback) | Owner decision on real backend need |
| Admin Dashboard | Not started | — | N/A | Not built | Not scheduled |
| Quotation | Not started | — | N/A | Not built | Not scheduled |
| Payment | Not started | — | N/A | Not built | Not scheduled |
| Listing Partner | Not started | — | N/A | Not built | Not scheduled |
| RMR/SPNB | Not started | — | N/A | Not built | Not scheduled |

## Notes

- **PR #19** (`main@aeb6324`) fixed `land-records-write.qa.ts` and `geometry-write.qa.ts`, which had been silently short-circuiting to a false PASS ("gate disabled") since PR #18 tightened the cloud-write feature gate. Both scripts now set `NODE_ENV=development` and `NEXT_PUBLIC_SUPABASE_URL` to the approved `sabahlot-dev` project (`xsflrehitrmobiyfbfhk`) for the QA process only, so they again genuinely exercise the gated fake-Supabase cloud-write path. Exactly 2 files changed; no application code, other documentation, migration, or configuration was touched.
- **PR #21** (`main@d071d73`) merged authenticated, create-only `land_points` persistence with validation, explicit payload allowlisting, retry/conflict handling, user-scoped cache updates, and fake-client QA. Point update/delete and UI wiring remain out of scope.
- **PR #23** (`main@a88316d`) hardened `isCloudReadEnabled()` to also require `isTargetingSabahlotDevProject()`, closing the same non-`sabahlot-dev`-project gap already fixed on the write gate. No UI wires to cloud read yet, so this had no user-facing behavior change at merge time.
- **PR #24** (`main@91e64c0`) wired boundary geometry sync into the save flow via a new `child-ui-sync.ts` module, and fixed a real bug in `parent-ui-sync.ts`: a parent update previously replaced the whole cached record — including already-synced child `geometries`/`points`/`parties` arrays — with empty arrays, discarding the `updated_at` values those child rows' own optimistic-concurrency checks depend on. Now covered by `parent-ui-sync.qa.ts` Test 13.
- **2026-07-20 verification (this documentation pass):** all 9 `.qa.ts` scripts re-run fresh against current `main` — 152/152 individual assertions PASS across `land-records.qa.ts` (10), `land-records-write.qa.ts` (21), `geometry-write.qa.ts` (47), `parent-ui-sync.qa.ts` (15), `parent-ui-sync-integration.qa.ts` (7), `points-write.qa.ts` (34), `child-ui-sync.qa.ts` (8), `feature-gate.qa.ts` (9), `local-lots.qa.ts` (1). `npx tsc --noEmit` clean, `npx eslint .` 0 errors (31 pre-existing warnings, all in `Map.tsx`/`page.tsx`(2)/`FieldGpsLite.tsx`), `npm run build` succeeds.
- **`sprint-02d1b-points-cloud-write` investigated and confirmed superseded** — its points work is byte-identical to PR #21, its read-gate fix is functionally identical to PR #23, and its geometry wiring (a different id-mapping design) is superseded by PR #24's more complete implementation. Nothing on that branch is missing from `main`; it is retained unpushed, unmerged, and unmodified for audit/reference only.
- No Production/Beta Supabase project, migration, remote SQL, real cloud operation, or manual/Production deployment was touched by PR #18, PR #19, PR #21, PR #23, PR #24, or this documentation update. GitHub-triggered Vercel preview checks ran normally and passed.
