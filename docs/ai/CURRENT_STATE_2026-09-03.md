# SabahLot — Current State (2026-09-03)

This file is a concise current-state checkpoint. It does not replace the historical narrative in `PROJECT_STATE.md` or `MODULE_STATUS.md`; it exists to prevent those long-form files from being mistaken for the latest operational state while they are being reconciled.

## Release posture

- Product status: **Controlled Alpha**.
- Broad public launch: **not yet approved**.
- Vercel Production hosting is in use for `alpha.sabahlot.com`, but that does **not** mean the product has passed the public-launch gate.
- Controlled Alpha cloud writes remain scoped to `sabahlot-dev` under the previously-approved exact-host guard.
- `sabahlot-production` write authority remains closed / fail-closed.

## Main branch checkpoint

Current main checkpoint after the 2026-09-03 security hardening:

- PR #58 — allow Controlled Alpha Vercel Production build to write only to `sabahlot-dev` under the exact approved host guard; production DB write constants remain closed.
- PR #59 — isolate device-local lot/GPS/navigation data by account and quarantine unowned legacy local data.
- PR #60 — refine the mobile map interface.
- PR #61 — recover cleanly from stale/revoked Supabase refresh-token cookies in middleware instead of repeatedly surfacing `Invalid Refresh Token` as a runtime exception.
- PR #62 — harden `public.get_active_listing_contact(uuid)` and record the migration in source control.

Current `main` after PR #62: `52cb774d071c87214658f55b6291ade3bce26105`.

## PR #61 — auth hardening evidence

- Preview deployment reached READY.
- `next build` compiled successfully; TypeScript completed successfully.
- `/auth` smoke request returned HTTP 200 on preview.
- PR #61 squash-merged to `main` as `0145ca0f74a2cf2e02a96a87b1fcabfcba06dd2b`.
- Production deployment for that commit reached READY.
- Post-deploy Vercel runtime-error scan returned no runtime errors in the checked one-hour window.
- Historical Supabase auth logs confirm successful password login/logout flows for both test accounts before the fix. A post-PR-#61 real-device two-account regression is still required before the public-launch gate can be marked complete.

## PR #62 — Listing Partner contact RPC hardening

The public listing contact RPC remains intentionally callable by `anon` and `authenticated` because the product includes an explicit public click-to-reveal contact flow. The function remains `SECURITY DEFINER` so it can expose only the approved subset of Listing Partner data while direct `listing_partners` public reads remain blocked.

Hardening applied and verified on `sabahlot-dev` before merge:

1. Added the same 90-day freshness condition already used by public listing visibility:
   `pl.updated_at > (now() - interval '90 days')`.
2. Kept all underlying table references schema-qualified.
3. Locked the function `search_path` to `pg_catalog`.
4. Revoked `EXECUTE` from `PUBLIC`.
5. Explicitly retained `EXECUTE` for `anon` and `authenticated` only.
6. Existing three-condition reveal gate remains:
   - listing status is `active`;
   - partner status is `approved`;
   - `public_contact_consent = true`.

Supabase Security Advisor still reports the two SECURITY DEFINER warnings for `anon` and `authenticated`. They are now known/intentional findings tied to this product contract, not an unidentified exposure. The separate INFO finding remains: `public.activity_logs` has RLS enabled with no policies.

PR #62 preview reached READY; Vercel build completed successfully. Owner explicitly approved merge. PR #62 was squash-merged as `52cb774d071c87214658f55b6291ade3bce26105`. The resulting Vercel Production deployment reached READY and the post-merge one-hour runtime-error scan returned no runtime errors.

No `sabahlot-production` database mutation was performed as part of this hardening pass.

## Current release-gate matrix

| Gate | Current evidence | Status |
| --- | --- | --- |
| Main/Vercel deployment | Latest main production deployment READY | PASS |
| Build / TypeScript | PR #61 and PR #62 deployment builds completed successfully | PASS |
| Refresh-token middleware hardening | PR #61 merged and deployed; no runtime error detected in post-deploy scan | PASS for deployment; stale-token real-device reproduction not re-triggered |
| Account isolation | PR #59 merged | PASS at code/deployment level |
| Account A/B historical auth | Supabase logs show successful password login/logout for both accounts | PASS historical |
| Account A/B post-PR-#61 real-device regression | Requires explicit same-device logout/login/refresh cycle after the fix | OPEN |
| GPS / Save / reload / cloud-sync post-latest-changes | Needs final end-to-end real-device confirmation | OPEN |
| Public contact RPC | Dev hardened; source migration merged via PR #62; intended anon/authenticated warnings documented | PASS for Controlled Alpha design |
| `sabahlot-production` write authority | Remains closed | PASS / fail-closed |
| Public mass launch | Final real-device regression and final launch review still outstanding | HOLD |

## Known technical debt / non-blocking items

- Previously-uploaded document display is not yet fully wired into the UI; current-session selected files are the reliable path.
- Per-file `isSensitive` control remains incomplete/hardcoded in the existing implementation.
- Dashed-line and polygon-boundary label collision tracking still use separate `occupied` arrays; architectural unification remains open.
- Near-duplicate mobile `.sl-field-gps-stack` media-query rules around 760/768px remain a CSS cleanup risk.
- Vercel builds continue to report `npm allow-scripts` warnings for `core-js` and `unrs-resolver`; these are warnings, not current build failures, and should be reviewed separately rather than silently approved.

## Next required actions before Public Launch Gate

1. Run the final real-device two-account sequence on one phone: Account A -> save/use app -> logout -> Account B -> verify no Account A local data appears -> refresh -> logout -> Account A -> verify expected Account A data remains isolated.
2. Confirm GPS, Save, reload, and Controlled Alpha cloud-sync behavior during that sequence.
3. Inspect Supabase/Vercel logs immediately after the real-device run for auth, refresh-token, API, or runtime errors.
4. Reconcile the long-form `PROJECT_STATE.md` and `MODULE_STATUS.md` against this checkpoint without deleting their historical audit trail.
5. Run the explicit Public Launch Gate. Do not equate Vercel Production READY with public-release approval.
