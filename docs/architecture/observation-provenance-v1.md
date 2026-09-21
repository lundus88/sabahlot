# Observation Provenance v1

## Purpose

Extend SabahLot's existing `land_points` model so future observations can retain their evidence source and quality metadata without changing the meaning of current Alpha phone-GPS points.

This is an **evidence/provenance layer**, not a cadastral-authority layer.

## Core rules

1. Never infer or fabricate receiver metadata.
2. Unknown CRS/datum must stay unknown until explicitly verified.
3. A high-quality GNSS solution does not establish a legal cadastral boundary.
4. Existing phone-GPS and keyed-coordinate capture must remain backward compatible.
5. New metadata is nullable and additive.
6. Production remains unchanged until migration + regression evidence receives human approval.

## Supported source taxonomy

- phone-gps
- keyed-coordinate
- rtk-gnss
- total-station
- image-measurement
- drone
- lidar
- kml-import
- dxf-import
- csv-import
- unknown

## Provenance fields

- source CRS / datum
- instrument make / model / serial
- firmware version
- correction source / correction age
- PDOP / satellite count
- tilt status
- signal-integrity status

Signal-integrity status intentionally supports future receiver diagnostics such as suspected interference, jamming or spoofing. Null means the source does not provide that evidence.

## Alpha compatibility

The current browser Geolocation API does not expose satellite count, PDOP, RTK correction age or receiver integrity diagnostics. SabahLot must therefore leave those fields null for phone-GPS capture.

## Governance

- No Production migration in this change.
- No authoritative cadastral claim.
- No silent CRS transformation.
- No automatic upgrade of point confidence because extra metadata exists.
- Merge/deploy remains human-approved.
