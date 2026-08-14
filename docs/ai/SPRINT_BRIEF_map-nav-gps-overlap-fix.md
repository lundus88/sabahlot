# Sprint Brief — `sprint-map-nav-gps-overlap-fix`

## Sprint ID
`sprint-map-nav-gps-overlap-fix`

## Objective
Fix a confirmed, measured visual overlap on the main map view at desktop
viewport widths (≥769px, no `max-width` media query active): the "Handheld
GPS" toggle button (positioned by `.sl-field-gps-stack`) sits directly on
top of the topmost button (Zoom In) of the 4-button map-navigation stack
(`.sl-map-navigation`), both horizontally and vertically. This was reported
by the owner ("kawasan zoom/GPS di kanan bawah" — the zoom/GPS area,
bottom-right) and independently confirmed via `getBoundingClientRect()`
arithmetic (see Findings below), not just visual impression.

This sprint explicitly does **not** cover: any weather/clock display (it
was confirmed during investigation that no such element exists anywhere in
this codebase — the "33°C" the owner saw in a screenshot is the device's
own OS status bar, not app UI, and needs no fix); the "Objects (N)" counter
(`.sl-object-list-tab`), which sits in the top-right cluster and does not
participate in this overlap; any GPS/AR functional logic; any map
drawing/rendering logic. It also does not fix the separate, already-latent
mobile (`≤768px`) cascade issue described under "Owner decision" below
unless the owner explicitly opts in.

## Base branch/commit
- Base branch: `main`
- Base commit: `fad38cfab57285dc1bb3b4f35c263d3e35be9fa7`

## Allowed files
- `src/app/globals.css` — **only** the following rule blocks (desktop/base,
  no-media-query rules that are actually active at ≥769px, per the
  investigation's cascade analysis):
  - `.sl-map-navigation` base rule, line ~1344-1348 (`position/right/bottom/z-index`)
  - `.sl-map-navigation` non-media override, line ~4724-4730 (`right/bottom`)
  - `.sl-map-navigation` non-media override, line ~5270-5276 (`right/bottom`) — **this is the currently-winning desktop rule**
  - `.sl-field-gps-stack` base rule, line ~169-179 (`position/right/bottom/z-index`)
- No other file needs to change to fix the desktop overlap itself. `Map.tsx`
  (nav button JSX, ~line 10720-10783) and `FieldGpsLite.tsx` (GPS toggle
  JSX, ~line 3004-3046) may be **read** for reference (DOM order, exact
  rendered size) but should not need edits — this is a pure CSS
  repositioning fix.

## Forbidden files
- `.env*`, `package.json`, `package-lock.json`, `supabase/migrations/**`,
  any Vercel config
- Any `.sl-map-navigation` / `.sl-field-gps-stack` / `.sl-field-gps-panel` /
  `.sl-field-gps-toggle` rule block **inside an `@media` query** (mobile,
  `display-mode`, etc.) — these are out of scope for this pass; see "Owner
  decision" below before touching any of them
- `.sl-object-list-tab` and any rule for the "Objects (N)" counter —
  unrelated to this overlap, do not touch
- `src/components/FieldGpsLite.tsx`, `src/app/components/Map.tsx` — GPS/AR
  and map-rendering code; per `docs/ai/SAFETY_RULES.md` these may only be
  touched under an explicitly-scoped sprint, and this brief does not scope
  in JSX/logic changes to either file, only CSS in `globals.css`. If
  implementation finds the CSS-only fix is genuinely impossible without
  touching one of these, that is a **stop condition** (see below), not a
  reason to proceed anyway.

## Database operations
None. This is a CSS-only, client-rendered layout fix — no cloud read or
write of any kind.

## Security invariants
None apply (no auth, data, or write-coordinator code touched). The only
invariant worth stating explicitly: the fix must not reduce the clickable/
visible area of any of the 4 nav buttons or the GPS toggle below their
current (pre-overlap) size — this is a layout-repair, not a feature
removal.

## Acceptance criteria
1. At desktop viewport widths of 1280px and 1920px (both to be checked,
   since the two live at different points on a monotonic but scattered
   cascade), `.sl-map-navigation`'s bounding box and `.sl-field-gps-stack`'s
   bounding box, measured via `getBoundingClientRect()`, must **not**
   intersect (zero overlap on both axes simultaneously).
2. All 4 buttons in `.sl-map-navigation` (Zoom In, Zoom Out, Fit Polygon,
   Reset to Sabah) remain fully visible and clickable — verify via
   `getBoundingClientRect()` for each button showing full width/height
   (no clipping) at both widths above.
3. The Handheld GPS toggle button, and its expandable card when opened
   (click to expand), remain fully visible and unobstructed by the nav
   stack at both widths above.
4. Mobile layout (`≤768px`) is **pixel-identical** to current behavior —
   verified by confirming no line inside any `@media` block for either
   selector was touched (a `git diff` scoped to `@media` blocks should be
   empty for `.sl-map-navigation` / `.sl-field-gps-stack` unless the owner
   opted into the mobile cleanup below).

## Tests
- **Executed**: browser-based `getBoundingClientRect()` overlap check
  (same method used in this brief's own investigation) run against the
  live/preview build at 1280px and 1920px viewport widths, before and
  after the fix, output pasted into the sprint report.
- **Executed**: `npx tsc --noEmit`, `npx eslint .`, `npm run build` — CSS
  change should not affect TS/lint, but must still be run and reported per
  `docs/ai/RELEASE_CHECKLIST.md`.
- **Documented-only, with reason**: full interactive confirmation of the
  Handheld GPS toggle's real end-to-end behavior (tap to open, see live
  GPS reading) cannot be executed in the sandboxed browser tool used this
  session — it has no device GPS permission, so the toggle/panel never
  renders in that sandbox at all. This must be verified by the owner on a
  real device/browser after deploy, same posture as this project's other
  GPS-adjacent sprints (see `docs/ai/SAFETY_RULES.md`'s mobile/visual
  verification note).

## Static verification
`npx tsc --noEmit`, `npx eslint .`, `npm run build` — all must run and
their actual output reported, not assumed.

## Stop conditions
- If the desktop-only fix cannot be achieved by adjusting only the 4
  allowed rule blocks above (e.g. if some other, not-yet-found rule turns
  out to also apply at desktop widths and was missed by the investigation),
  stop and report rather than expanding scope into `@media` blocks or JSX
  without a fresh owner decision.
- If fixing the overlap would require shrinking either control below a
  comfortably tappable size (~32px), stop and present the tradeoff instead
  of silently making one control smaller.

## Owner decision (not yet resolved — answer before/at sprint start)
The investigation surfaced a **separate, real** issue that this brief
deliberately does not include by default: `.sl-map-navigation`'s position
under `@media (max-width: 768px)` is redeclared **6 times** across the
file (lines ~5423, 5870, 6085, 6272, 6428, 7876) with genuinely conflicting
`bottom`/`right` values, and a comment at line ~6428 claims to document
"the final-winning mobile offset" — this claim is **false**: the actual
winning rule is the later block at line ~7876 (`top: 50%; bottom: auto`,
a vertically-centered layout), not the one the comment describes. Mobile
behavior today is whatever line 7876 produces, which may or may not be
what anyone intended — nobody currently knows without checking, since the
one comment that claims to document it is wrong.

Options:
1. **Leave mobile untouched this sprint** (default/recommended for this
   brief) — the owner never reported a mobile-specific complaint, and
   `≤768px` is a materially different, larger-blast-radius cleanup (6
   conflicting blocks vs. this sprint's 4). Fix desktop only now; file the
   mobile cleanup as its own future sprint.
2. **Expand this sprint to also consolidate the mobile blocks** and correct
   or remove the stale comment — larger, riskier (touches 6 breakpoint
   blocks instead of dozens of lines), but closes the whole class of bug
   in one pass rather than leaving known-stale documentation in place.

This brief is written for option 1. If the owner prefers option 2, the
"Allowed files" section above needs to be expanded before implementation
starts, and acceptance criterion 4 would need to change from "pixel-
identical" to "matches an explicitly agreed new mobile layout."

## Required report
Structure per `docs/ai/SPRINT_TEMPLATE.md`: Repository state → Files →
Cloud operations (N/A) → Security (N/A) → Tests/Verification → Findings →
Decision (PASS / CHANGES REQUIRED / BLOCKED).

## Commit/push/PR restrictions
Matching this session's established pattern for small, live, owner-
supervised fixes: implementation may proceed directly on `main`.
**Commit and push each require separate, explicit owner authorization**,
exactly as with every prior change this session — no authorization is
implied by approval of this brief or of the design. No PR is required
unless the owner asks for one.
