# SabahLot Changelog

## Sprint 07A — Public Beta Readiness

**Status:** Merged · Deployed · QA Passed

**Branch:** sprint-07a-public-beta-readiness → sprint-06d-ar-geo-anchored-target

**PRs:**
- PR #3 — feat: add public beta readiness tools (Beta Notice modal, Preliminary Field Assist label, Feedback Beta form, Report Issue button, Feedback CSV export, Manual Beta page, BM manual + field test checklist docs)
- PR #4 — chore: refine public beta notice wording (expanded "JTU Sabah" and "PBT" abbreviations in the disclaimer text)

**Verified features:**
- Beta Notice modal displays on first visit with updated disclaimer wording
- Checkbox consent gating — continue button stays disabled until checkbox is checked
- localStorage accept behavior — acceptance persists (`sabahlot_beta_notice_accepted`), modal does not reappear on reload
- Preliminary Field Assist label — visible, does not overlap map/GPS controls
- Feedback Beta — form opens and saves entries to localStorage (`sabahlot_beta_feedback`)
- Report Issue — auto-fills timestamp, URL, user agent, screen size, GPS accuracy, and active target
- Export Feedback CSV — downloads stored feedback entries as CSV
- Manual Pengguna Beta — link opens the manual page from within the Handheld GPS panel
- /manual-beta route — confirmed HTTP 200, static route in production build

**Follow-up backlog (not in 07A scope):**
- Feedback and bug reports are currently device-local only (localStorage) — no central collection point
- No admin/team dashboard yet to aggregate feedback across testers
