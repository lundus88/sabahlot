# SabahLot — Module Status

_Last updated: 2026-07-20 (post-merge documentation sync for PR #18 and PR #19). Update this table at the end of every merged sprint. "Environment" reflects where the module is actually usable today, not where it's theoretically deployed._

| Module | Status | Environment | Cloud write | UI status | Next action |
|---|---|---|---|---|---|
| Map / local lots | Done | Alpha/Beta (localStorage) | No (legacy `lots` dual-write only, insert-only, out of scope for current work) | Active | None planned in current sprint series |
| Handheld GPS | Done | Alpha/Beta | No | Active | None planned |
| AR Find Point | Done | Alpha/Beta | No | Active | None planned |
| Beta Notice | Done | Beta | No | Active | None |
| Feedback | Done (localStorage only) | Alpha/Beta | No (cloud `feedback` table exists, unused) | Active | Owner decision needed on cloud sync |
| Manual Beta (onboarding) | Done | Beta | No | Active | None |
| Authentication | Done | Dev/Beta (Supabase Auth) | N/A | Active | None |
| Land Record cloud read | Merged (`main`) | Dev only | Read-only | **Disabled** (no UI wiring) | Owner decision on UI integration point |
| Land Record cloud create/update | Merged (`main`, PR #18; backend from PR #14) | Dev only (`sabahlot-dev`) | `land_records` | **Active in local-first save flow, Dev gate only** | Independently verify real-browser UX; keep Production disabled |
| Geometry | Backend merged (`main`, PR #16) | Dev only | `land_record_geometries` | **Disabled** | Geometry UI wiring sprint after prerequisite follow-ups |
| Points | Implemented on separate branch, not merged | Dev-only branch work | `land_points` persistence on `sprint-02d1b-points-cloud-write` | **Disabled on main** | Independent review and release decision; not started, advanced, or completed by PR #18/#19 post-merge work; do not mix with that cleanup |
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
- No Production/Beta Supabase project, migration, remote SQL, or deployment was touched by PR #18, PR #19, or this documentation update.
- Sprint 02D-1B (Points, `sprint-02d1b-points-cloud-write`) is untouched, unstarted for review, and not completed by any of the PR #18/#19 post-merge work above — it remains a separate, independently-scoped action.
