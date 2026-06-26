# SabahLot Controlled Alpha Readiness

Build scope: Controlled Alpha v0.1 for 10 users.

## Release Gate

- Status: Ready for controlled alpha only after manual QAQC is completed on the release device.
- Audience: invited alpha users only.
- Data posture: private-by-default; users should avoid entering highly sensitive personal information during alpha testing.
- Output posture: preliminary reference only; no official survey, boundary, ownership, approval, subdivision, or land title status claim.

## Required Disclaimer

SabahLot output is for preliminary reference only. It is not an official survey plan, not a certified boundary plan, and must not be used as legal proof of boundary, ownership, approval, subdivision or land title status. All coordinates, boundaries and areas must be verified by the relevant authority, licensed surveyor or professional adviser before official use.

## Build Regression Checklist

### Build 1: Map and Polygon

- Map opens at Sabah default view.
- Manual polygon drawing works.
- Clear/reset works.
- Vertex count appears.
- Area appears in sqm, ha, and acre.
- Perimeter appears in m and km.
- Mobile toolbar leaves enough visible map area.

### Build 2: Local Records

- Lot form accepts record information.
- Save record works.
- Refresh does not remove saved record.
- Saved record loads back into the map and form.
- Delete removes the saved record.
- Deleted record does not reappear after refresh.

### Build 3: Import

- KML polygon import previews geometry.
- GeoJSON polygon import previews geometry.
- CSV coordinate import previews geometry.
- Invalid file shows an error and does not crash.
- Imported polygon can be saved as a record.

### Build 4: Export

- GeoJSON export downloads current polygon.
- KML export downloads current polygon.
- CSV export downloads current polygon.
- Print / Preliminary PDF opens browser print output.
- Export without polygon shows a clear error and does not crash.
- Exported outputs include preliminary disclaimer.

## Alpha UX Checklist

- Alpha/preliminary labels are visible before users rely on output.
- No UI text claims official boundary, ownership, approval, subdivision, title, or cadastral status.
- Import and export controls are compact and do not cover the map on mobile.
- Error messages are short, clear, and professional.
- Buttons that require a polygon are disabled until a polygon exists.
- Any deferred capability remains clearly deferred or unavailable.

## Open Controlled Alpha Risks

- Manual browser QA must be completed on desktop and mobile viewports.
- Legal/professional wording should be reviewed before any broader public beta.
- PDF and coordinate calculations remain preliminary and not agency-certified.
- Existing lint warnings in baseline map/service-worker files should be cleaned in a separate maintenance build.
