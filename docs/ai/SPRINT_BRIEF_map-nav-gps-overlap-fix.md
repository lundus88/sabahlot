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
1. Leave mobile untouched this sprint — deferred, superseded below.
2. **Expand this sprint to also consolidate the mobile blocks** and correct
   or remove the stale comment.

**Decision (owner, this session): option 2.** Desktop fix (above) already
shipped as `7b6ccf5`. This is a follow-up pass, same sprint ID, scope now
expanded per below.

### Expanded scope: mobile (`≤768px`) cleanup

Investigation (Explore agent catalog, see this session's transcript)
established that `.sl-map-navigation`'s real, currently-winning mobile rule
is the block at line ~7876 (`@media (max-width: 768px)`, comment: "MOBILE
LAYOUT CONTRACT ... Keep this block last so older sprint overrides cannot
win the cascade") — `top: 50% !important; right: var(--sl-mobile-edge)
!important; bottom: auto !important; transform: translateY(-50%)
!important; z-index: 1092 !important;`. This block's own `!important` +
last-source-position deliberately and successfully overrides five earlier
blocks (lines ~5423, ~5870, ~6085, ~6272, ~6428), all of which are dead
code — the comment at ~6428 claiming to be "the final-winning mobile
offset" is false and actively misleading.

**Expanded Allowed files** (adds to the desktop list above, same file):
- `.sl-map-navigation` dead blocks to remove/simplify: lines ~5423-5426,
  ~5870-5873, ~6085-6087, ~6272-6276, ~6428-6438 (including its stale
  comment) — all superseded by ~7876-7882, which stays as the single
  source of truth
- `.sl-field-gps-stack` mobile rules, for a **newly found second overlap**
  in the 641-768px width band: base mobile rule ~640-651 (`position:
  fixed; top: calc(env(safe-area-inset-top)+58px); right/left: 8px;
  bottom: calc(env(safe-area-inset-bottom)+86px)` — spans nearly full
  viewport height/width) and its near-duplicate at ~2837-2847 (`@media
  (max-width: 760px)`, byte-identical body) — the near-duplicate should be
  removed as redundant, not fixed twice. In this 641-768px band, this
  full-height band can overlap `.sl-map-navigation`'s vertically-centered,
  right-edge position from ~7876, since field-gps-stack's `right: 8px`
  reaches the same right edge nav occupies. The ≤640px case already
  neutralizes this via `.sl-mobile-top-control-stack .sl-field-gps-stack {
  position: static !important; ... }` at ~6506-6519, confirmed unaffected.

**Expanded acceptance criteria** (in addition to the desktop ones already
met):
7. At mobile widths 768px, 700px, and 641px (the newly-identified risk
   band), `.sl-map-navigation` and `.sl-field-gps-stack` bounding boxes do
   not intersect.
8. At ≤640px, behavior is unchanged (the `position: static` override at
   ~6506 already prevents overlap there and is not touched).
9. The stale "final-winning" comment at ~6428 is removed along with the
   dead rule block it described.
10. `.sl-map-navigation`'s rendered position at 768px/700px/641px after
    cleanup is pixel-identical to before cleanup (proving the dead-block
    removal was truly dead, not a silent behavior change) — verify via
    before/after `getBoundingClientRect()` comparison, not just "build
    succeeds."

## Implementation findings (mobile pass, same session)
Live browser testing (with `.sl-field-gps-stack` actually mounted, by
switching to Advanced/Surveyor mode) found the 641-768px overlap was not
just visual: `document.elementFromPoint()` at the topmost zoom button's
coordinates returned `.sl-field-gps-stack`, not the button — a real
click-swallowing bug, caused by `.sl-field-gps-stack`'s computed
`pointer-events` being `auto` (not the base rule's `none`) at that width.
Root cause: a rule at (then) lines 7838-7842,
`.sl-mobile-top-control-stack .sl-field-gps-stack, ... { pointer-events:
auto !important; }`, sat inside the `@media (max-width: 768px)` "MOBILE
LAYOUT CONTRACT" block but was only ever needed for the `≤640px` case
(where `.sl-mobile-top-control-stack` becomes a real flex container) — in
the 641-768px gap it force-enabled pointer events on the GPS stack's full
near-viewport-height invisible box, intercepting clicks meant for
`.sl-map-navigation` underneath. Confirmed via a live before/after test
(CSS override injected, then removed) that removing this block fixes the
click-through at 768/700/641px and does not affect the toggle button's
own clickability (it has its own independent `pointer-events: auto` at
line ~202) at any width including ≤640px. Removed that block instead of
narrowing its media query, since it was fully redundant once confirmed.

Also removed, per the "Expanded scope" section above: the 6 dead
`.sl-map-navigation` position blocks (~5423, ~5870, ~6085, ~6272, the
`@media (max-width:768px) and (max-height:640px)` duplicate at ~6292, and
~6428 with its false "final-winning" comment) — all provably superseded
by the ~7876 block via later source order + `!important`. Verified via
live `getBoundingClientRect()` before/after at 768/700/641px: identical
pixel values, confirming these were genuinely dead, not a silent
behavior change. Net diff: 41 lines removed, 0 added, in
`src/app/globals.css` only.

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
