# SabahLot Plan Standards Workflow

This folder contains the QA/QC control documents for SabahLot plan standards.

## Files

| File | Purpose |
|---|---|
| `PLAN_STANDARDS_REGISTER.md` | Register of official documents, internal proposed standards, project assumptions, and requirements awaiting verification. |
| `COMPLIANCE_GAP_MATRIX.md` | Matrix comparing current SabahLot behavior against required plan elements and official-verification status. |
| `README.md` | Workflow for obtaining, verifying, approving, implementing, and releasing standards. |

## Official Workflow

Official documents obtained  
-> entered into the Plan Standards Register  
-> version and status checked  
-> requirements extracted  
-> Compliance Gap Matrix updated  
-> professional review  
-> internal approval  
-> implementation in SabahLot  
-> QA/QC verification  
-> release

## Verification Rules

- Never invent circular numbers, manual numbers, dates, or regulation names.
- Never claim compliance with JTU, JUPEM, JKR, PBT, or any other authority without a registered official source.
- If a document is not available, mark it as:
  - `DOCUMENT NOT AVAILABLE`
  - `REQUIRES OFFICIAL VERIFICATION`
- Keep clear separation between:
  - verified requirement
  - project assumption
  - proposed SabahLot standard
  - requirement awaiting verification

## Minimum Review Sequence

1. Obtain official source document from the relevant agency or official channel.
2. Record the source in `PLAN_STANDARDS_REGISTER.md`.
3. Check document title, reference number, year/version, effective date, and whether it is current or superseded.
4. Extract only requirements relevant to SabahLot plan outputs.
5. Update `COMPLIANCE_GAP_MATRIX.md` with the requirement and evidence.
6. Assign severity and required action.
7. Send to professional/technical reviewer.
8. Record internal approval before implementation.
9. Implement only approved standards in application code.
10. Run QA/QC checks on PDF, KML, DXF, map display, stored geometry, and metadata.
11. Release only after review evidence is recorded.

## Current Compliance Position

SabahLot Alpha is treated as a preliminary planning tool. The current documentation does not claim compliance with JTU, JUPEM, JKR, PBT, cadastral submission standards, or formal road/planning submission standards.

Known high-risk areas:

- CRS and datum are not fully controlled as registered metadata.
- DXF must not be treated as meter-based CAD output until official CRS transformation is implemented and verified.
- Official line type, line weight, font, symbol, legend, and title block standards are not available.
- Professional review and official document verification are required before compliance claims.

## Release Gate

No template implementation, CRS transformation, official PDF template, or CAD/GIS compliance claim should proceed until:

- relevant official documents are obtained;
- register entries are updated;
- requirements are extracted;
- matrix gaps are reviewed;
- professional verification is complete;
- internal approval is recorded.
