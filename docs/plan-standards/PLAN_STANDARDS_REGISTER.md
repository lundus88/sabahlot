# SabahLot Plan Standards Register

Status: Draft QA/QC control document  
Owner: SabahLot Compliance and QA/QC  
Scope: Register for official standards, project assumptions, proposed SabahLot standards, and requirements awaiting verification.

## Rules

- Do not invent circular numbers, manual numbers, dates, or regulatory titles.
- Do not claim compliance with JTU, JUPEM, JKR, PBT, or any authority without official source documents.
- If the document is not available, mark it as `DOCUMENT NOT AVAILABLE` and `REQUIRES OFFICIAL VERIFICATION`.
- Distinguish every requirement as one of:
  - verified requirement
  - project assumption
  - proposed SabahLot standard
  - requirement awaiting verification

## Status Values

| Status | Meaning |
|---|---|
| `VERIFIED` | Official source has been obtained, checked, and recorded. |
| `DOCUMENT NOT AVAILABLE` | Official document has not been obtained. |
| `REQUIRES OFFICIAL VERIFICATION` | Requirement, applicability, version, or source must be confirmed by an official/professional reviewer. |
| `SUPERSEDED` | Document is known to be replaced by a newer version. |
| `NOT APPLICABLE` | Standard is confirmed not applicable to the selected plan type or output. |

## Register Fields

| Field | Description |
|---|---|
| Standard ID | Unique SabahLot register ID. |
| Agensi | Authority, agency, standards owner, or SabahLot internal control owner. |
| Tajuk dokumen | Full title of the document. |
| Nombor rujukan | Official reference number, if available. Do not invent. |
| Tahun / versi | Year or version stated in the source. |
| Tarikh kuat kuasa | Effective date stated in the source. |
| Status dokumen | One of the approved status values. |
| Jenis pelan berkaitan | Plan/output type affected by the standard. |
| Elemen teknikal berkaitan | Technical elements covered. |
| Keperluan utama | Requirements extracted from the source or proposed internal requirement. |
| Sumber rasmi | Official source URL, document path, letter, or file reference. |
| Tarikh diperoleh | Date the source was obtained. |
| Tarikh disemak | Date QA/QC reviewed the source. |
| Disemak oleh | Reviewer name or role. |
| Status pengesahan | verified requirement, project assumption, proposed SabahLot standard, or requirement awaiting verification. |
| Catatan | Notes, limitations, exclusions, or next action. |

## Register

| Standard ID | Agensi | Tajuk dokumen | Nombor rujukan | Tahun / versi | Tarikh kuat kuasa | Status dokumen | Jenis pelan berkaitan | Elemen teknikal berkaitan | Keperluan utama | Sumber rasmi | Tarikh diperoleh | Tarikh disemak | Disemak oleh | Status pengesahan | Catatan |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| SL-STD-001 | SabahLot QA/QC | SabahLot Preliminary Plan Internal Control | N/A | Draft | N/A | `REQUIRES OFFICIAL VERIFICATION` | Preliminary PDF | Disclaimer, watermark, title block, drawing status | Output must be clearly marked preliminary and not for legal/cadastral use. | Internal audit evidence only | N/A | 2026-06-17 | Compliance and QA/QC Manager | proposed SabahLot standard | Internal control only. Does not claim authority compliance. |
| SL-STD-002 | JTU Sabah | Official cadastral/survey plan standard | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | Cadastral-related plans, land plans, preliminary boundary references | Title block, coordinate table, bearing/distance, boundary style, certification | `REQUIRES OFFICIAL VERIFICATION` | `DOCUMENT NOT AVAILABLE` | N/A | 2026-06-17 | Compliance and QA/QC Manager | requirement awaiting verification | Obtain official JTU Sabah source before any compliance claim. |
| SL-STD-003 | JUPEM | Official national geodetic/coordinate reference requirements | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | CRS, datum, transformation, KML, DXF, GIS outputs | CRS, datum, EPSG, unit, source CRS, output CRS, transformation record | `REQUIRES OFFICIAL VERIFICATION` | `DOCUMENT NOT AVAILABLE` | N/A | 2026-06-17 | Compliance and QA/QC Manager | requirement awaiting verification | Needed before CRS implementation or formal coordinate claim. |
| SL-STD-004 | JTU Sabah / JUPEM | Timbalai 1948 / RSO Borneo requirements for Sabah | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | Sabah DXF, survey/CAD output, coordinate conversion | Datum, projection, EPSG, units, transformation parameters | `REQUIRES OFFICIAL VERIFICATION` | `DOCUMENT NOT AVAILABLE` | N/A | 2026-06-17 | Compliance and QA/QC Manager | requirement awaiting verification | Critical dependency for Sabah meter-based DXF. |
| SL-STD-005 | JUPEM / Sarawak authority | Sarawak coordinate reference requirements | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | Sarawak plans and CAD/GIS outputs | CRS, datum, EPSG, units, transformation | `REQUIRES OFFICIAL VERIFICATION` | `DOCUMENT NOT AVAILABLE` | N/A | 2026-06-17 | Compliance and QA/QC Manager | requirement awaiting verification | Required only if SabahLot supports Sarawak output. |
| SL-STD-006 | JUPEM | Semenanjung Malaysia coordinate reference requirements | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | Semenanjung plans and CAD/GIS outputs | CRS, datum, EPSG, units, transformation | `REQUIRES OFFICIAL VERIFICATION` | `DOCUMENT NOT AVAILABLE` | N/A | 2026-06-17 | Compliance and QA/QC Manager | requirement awaiting verification | Required only if SabahLot supports Semenanjung output. |
| SL-STD-007 | JKR / PBT | Road reserve, proposed access, and centreline drafting requirements | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | Road/access-related plans | Road reserve, proposed access, centreline, setback, symbols, line type | `REQUIRES OFFICIAL VERIFICATION` | `DOCUMENT NOT AVAILABLE` | N/A | 2026-06-17 | Compliance and QA/QC Manager | requirement awaiting verification | Do not claim JKR/PBT compliance until official document is registered. |
| SL-STD-008 | PBT / planning authority | Setback and planning control requirements | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | `DOCUMENT NOT AVAILABLE` | Planning/preliminary subdivision plan | Setback, reserve, proposed subdivision table, approval notes | `REQUIRES OFFICIAL VERIFICATION` | `DOCUMENT NOT AVAILABLE` | N/A | 2026-06-17 | Compliance and QA/QC Manager | requirement awaiting verification | Setback distances must not be assumed. |
| SL-STD-009 | SabahLot QA/QC | SabahLot Graphic Standard | N/A | Draft | N/A | `REQUIRES OFFICIAL VERIFICATION` | PDF, map display, future CAD legend | Line type, line weight, color, text size, font, symbols, legend | Define internal graphic conventions, pending official alignment. | Internal audit evidence only | N/A | 2026-06-17 | Compliance and QA/QC Manager | proposed SabahLot standard | Must be reviewed after agency standards are obtained. |
| SL-STD-010 | SabahLot QA/QC | SabahLot CRS and Export Control Standard | N/A | Draft | N/A | `REQUIRES OFFICIAL VERIFICATION` | KML, DXF, PDF, stored lot geometry | WGS84 default, source CRS, output CRS, datum, unit, EPSG, no silent transformation | KML remains WGS84; DXF must require meter-based CRS; every transformation must be recorded. | Internal audit evidence only | N/A | 2026-06-17 | Compliance and QA/QC Manager | proposed SabahLot standard | Internal control; depends on official CRS documents. |

## Missing Official Documents

All official agency standards listed above remain unavailable in this repository. They must remain marked as `DOCUMENT NOT AVAILABLE` and `REQUIRES OFFICIAL VERIFICATION` until obtained, version-checked, and reviewed.
