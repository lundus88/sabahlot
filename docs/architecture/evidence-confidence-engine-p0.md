# Evidence Confidence Engine P0

## Objective

Give every supported SabahLot evidence source an explicit, explainable evidence class without implying legal/cadastral authority from numerical accuracy alone.

## Classes

- `OFFICIAL_RECORD` — explicit traceable government/statutory record or licensed survey plan evidence. P0 still does not authorize official use.
- `SURVEY_OBSERVATION` — survey observation such as RTK GNSS, total station or survey-mark observation.
- `IMPORTED_REFERENCE` — imported geometry whose CRS contract has been verified, while original survey authority remains unproven.
- `FIELD_REFERENCE` — user-entered or remote-sensing reference evidence.
- `APPROXIMATE` — consumer/browser GPS or similarly approximate position evidence.
- `UNVERIFIED` — insufficient source/CRS/provenance evidence.

## Non-negotiable rules

1. RTK FIX is not cadastral authority.
2. Total-station precision is not cadastral authority.
3. A verified CRS is not proof of original survey authority.
4. Phone GPS never becomes survey/cadastral evidence because its reported accuracy improves.
5. `OFFICIAL_RECORD` requires a traceable authority reference plus an accepted authoritative source type.
6. P0 never returns `officialUseAllowed: true`.

## P0 integrations

- Imported KML/GeoJSON/CSV previews expose evidence class.
- Imported point notes carry evidence class and CRS lineage.
- Field GPS CSV/KML/PDF exports expose evidence class for each point / summary.
- Evidence decisions contain human-readable reasons and restrictions.

## Explicit non-goals

- no legal/cadastral validity determination;
- no authority-submission approval;
- no numeric confidence score;
- no database persistence of derived class in P0;
- no replacement for licensed surveyor review or official cadastral records.

## Future gate

If persistence is later required, store source evidence and decision version separately so evidence class can be recomputed and audited rather than becoming an opaque permanent label.
