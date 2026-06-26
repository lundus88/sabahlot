# SabahLot Controlled Alpha v0.1 Release Gate

Sprint: 04j Alpha Release Gate & User Onboarding

Scope: release readiness for 10 invited Controlled Alpha users only.

## 1. Release Gate Summary

SabahLot may proceed to Controlled Alpha only when all required checks below are completed manually on the target release device/browser set.

Go / No-Go status:

- Decision: `PENDING MANUAL QAQC`
- Date:
- Release reviewer:
- Approved user count: maximum 10 invited users
- Notes:

## 2. Non-Negotiable Alpha Rules

- SabahLot is preliminary/indicative only.
- SabahLot is not an official JTU Sabah system.
- SabahLot is not a licensed survey plan generator.
- SabahLot does not confirm legal boundaries.
- SabahLot does not confirm land title or ownership.
- SabahLot does not decide NCR / tanah adat.
- SabahLot does not approve subdivision, planning, or authority matters.
- User data is private-by-default.
- Any boundary/NCR/waris/dispute/import uncertainty must show clear risk or manual review guidance.

## 3. Required Disclaimer Check

Confirm this disclaimer appears in output/onboarding/release material:

> Output ini adalah preliminary/indikatif sahaja dan bukan pelan ukur rasmi, bukan pengesahan sempadan, bukan carian hakmilik rasmi, dan bukan jaminan kelulusan mana-mana pihak berkuasa. Semakan rasmi hendaklah dibuat melalui JTU Sabah, PBT, juruukur berlesen, peguam atau pihak berkaitan.

Checklist:

- Disclaimer visible before export.
- Export requires acknowledgement.
- Output includes preliminary label.
- Output includes price.
- Output does not imply official approval.

## 4. Build 1 Regression: Map + Polygon + Area/Perimeter

- Map opens at Sabah default view.
- User can draw polygon.
- User can undo/complete/delete polygon.
- Vertex count is visible.
- Estimated area appears.
- Perimeter appears.
- Area/perimeter are worded as estimated/preliminary.
- Map controls are usable on mobile.
- No map overlay blocks core drawing workflow.

Result:

- Status: `PENDING`
- Tester:
- Notes:

## 5. Build 2 Regression: Save / Load / Delete Record

- Record name is required.
- District is required.
- Polygon/imported geometry is required before save.
- Save record works.
- Load saved record works.
- Delete saved record works.
- Refresh does not remove saved local record.
- Privacy-by-default wording is visible.
- Sensitive document metadata defaults private/high sensitivity where applicable.

Result:

- Status: `PENDING`
- Tester:
- Notes:

## 6. Build 3 Regression: Import KML / GeoJSON / CSV

- KML polygon import previews correctly.
- GeoJSON polygon import previews correctly.
- CSV coordinate import previews correctly.
- Invalid file shows safe error.
- DXF remains deferred/placeholder if encountered.
- Imported geometry is labelled preliminary.
- Imported geometry warning explains source/CRS uncertainty.
- Imported polygon can be used as a preliminary record.

Result:

- Status: `PENDING`
- Tester:
- Notes:

## 7. Build 4 Regression: Export Preliminary Output

- Export is disabled until polygon exists.
- Export is blocked until disclaimer/pricing acknowledgement.
- PDF / print output includes preliminary label.
- Exported KML/GeoJSON/CSV includes preliminary metadata/disclaimer.
- Output has a price from registry.
- Output does not claim official survey, boundary, title, NCR, subdivision, or approval status.
- Risk flags appear in output metadata where applicable.

Result:

- Status: `PENDING`
- Tester:
- Notes:

## 8. Input Registry / Risk Rules Check

- Central input registry exists.
- Pricing registry exists.
- Risk rules exist.
- Minimum paid output price is not below RM59.
- NCR/tanah adat triggers high/manual review risk.
- Boundary dispute triggers professional/manual review risk.
- Waris/pusaka triggers high/manual review risk.
- Missing title/lot/CRS uncertainty triggers preliminary risk warning.
- Official-use intent triggers professional review required.

Result:

- Status: `PENDING`
- Tester:
- Notes:

## 9. Mobile Check

Test on at least one mobile viewport/device.

- Drawer opens and closes.
- Form sections are readable.
- Buttons do not overlap text.
- Map remains usable.
- Import/export controls fit screen.
- Disclaimer/risk warning can be read without layout break.

Result:

- Status: `PENDING`
- Device:
- Browser:
- Notes:

## 10. Privacy Check

- Onboarding explains private-by-default.
- App wording warns against sensitive data during Alpha.
- Document metadata defaults private.
- No public listing is enabled by default.
- No share link is generated without explicit future review.
- No official/government sensitive data integration exists.

Result:

- Status: `PENDING`
- Tester:
- Notes:

## 11. Manual Review Flag Check

Create or simulate records with these scenarios:

- Boundary dispute.
- NCR / tanah adat.
- Waris / pusaka.
- Lot bertindih.
- Dokumen tidak lengkap.
- No. lot/title number tidak pasti.
- Sistem koordinat tidak pasti.
- Imported geometry from uncertain source.
- User wants official-use output.

Expected result:

- Risk warning is visible.
- Manual/professional review is recommended where required.
- No legal/official decision is displayed.

Result:

- Status: `PENDING`
- Tester:
- Notes:

## 12. Feedback Flow Check

- Alpha user receives onboarding document.
- Alpha user receives feedback template.
- Reviewer knows where to collect feedback.
- Feedback captures technical issue, UI confusion, trust in output, willingness to pay, and professional help needs.

Result:

- Status: `PENDING`
- Tester:
- Notes:

## 13. Technical QAQC

Required commands:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Results:

- Lint:
- TypeScript:
- Build:
- Notes:

## 14. Go / No-Go Decision

Decision options:

- `GO`: All critical checks passed. Release to up to 10 invited Alpha users.
- `NO-GO`: A critical issue can mislead users, expose private data, break map/save/import/export, or imply official status.
- `CONDITIONAL GO`: Only non-critical issues remain and users are warned clearly.

Final decision:

- Decision:
- Approved by:
- Date:
- Conditions:
- Next allowed action: collect Alpha feedback only. Do not start Sprint 04k from this gate.
