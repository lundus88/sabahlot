# SabahLot — Module Status

_Update this table at the end of every merged sprint. "Environment" reflects where the module is actually usable today, not where it's theoretically deployed._

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
| Land Record cloud create/update | Merged (`main`, PR #14) | Dev only | `land_records` | **Disabled** | Owner decision on UI integration point |
| Geometry | Implemented, reviewed (PASS) | Dev only (uncommitted) | `land_record_geometries` | **Disabled** | Owner approval to commit/push/PR (`sprint-02d1a-geometry-cloud-write`) |
| Points | Designed (GO), not implemented | — | Not implemented | **Disabled** | Implementation sprint (create-only, per ADR-011) |
| Parties | Designed (GO), not implemented | — | Not implemented | **Disabled** | Implementation sprint (PDPA-minimal payload, per ADR-014) |
| Documents | Not started | — | Not implemented | **Disabled** | Separate sprint (per ADR-012), not yet scheduled |
| Service Request | UI stub only | Alpha/Beta | No | Stub (redirects to feedback) | Owner decision on real backend need |
| Admin Dashboard | Not started | — | N/A | Not built | Not scheduled |
| Quotation | Not started | — | N/A | Not built | Not scheduled |
| Payment | Not started | — | N/A | Not built | Not scheduled |
| Listing Partner | Not started | — | N/A | Not built | Not scheduled |
| RMR/SPNB | Not started | — | N/A | Not built | Not scheduled |
