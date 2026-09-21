# CRS & Datum Safety Engine P0

## Objective

Prevent SabahLot from treating imported coordinate values as verified WGS84 when the source coordinate reference system is unknown or requires a transformation.

## Safety states

- `VERIFIED_NATIVE` — source is verified as WGS84 / EPSG:4326 and no transformation is applied.
- `TRANSFORM_REQUIRED` — source CRS is recognized, but a verified transformation engine is not enabled.
- `CRS_UNCONFIRMED` — source CRS is missing or cannot be verified.

Only `VERIFIED_NATIVE` may proceed to import preview/use in P0.

## Format policy

### KML
Consumed under KML's geographic WGS84 longitude/latitude coordinate contract. No transform is applied.

### GeoJSON
Consumed under the RFC 7946 WGS84 longitude/latitude contract. A legacy top-level `crs` member causes fail-closed rejection rather than inference.

### CSV
CSV has no universal CRS contract. The user must explicitly declare the source CRS.

P0 choices:
- WGS84 / EPSG:4326 — allowed;
- BRSO Timbalai / EPSG:29873 — recognized, transform required;
- GDM2000 Borneo RSO — recognized, transform required;
- UTM — recognized, transform required;
- unknown — blocked.

## Explicit non-goals

P0 does not implement:
- BRSO ↔ WGS84 projection/datum transformation;
- GDM2000 transformations;
- UTM zone resolution;
- Cassini-Soldner;
- DXF coordinate-system inference;
- silent axis swaps or coordinate guessing.

## Future transformation gate

Before any non-WGS84 transformation is enabled, the implementation must provide:

1. exact source CRS identifier/datum/epoch where applicable;
2. target CRS;
3. method and parameters/grid source;
4. transformation version/evidence metadata;
5. forward/inverse Golden Dataset tests using known control values;
6. error/tolerance limits;
7. audit/provenance output;
8. explicit human approval.

## Governance

CRS uncertainty is fail-closed. A coordinate that is numerically plausible is not evidence that its CRS is correct.
