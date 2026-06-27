# SabahLot Sprint 04r — GPS Handheld QAQC & Field Test

## Objective

Validate SabahLot handheld GPS functions before wider Alpha testing.

## Important Disclaimer

GPS phone and handheld GPS data in SabahLot are for preliminary field reference only.

SabahLot GPS output is:
- not survey-grade GNSS,
- not an official survey plan,
- not legal boundary evidence,
- not proof of ownership,
- not authority approval,
- not a replacement for licensed surveyor / JTU / relevant authority verification.

## Test Scope

### 1. Live GPS / My Location

| Test | Expected Result | Status |
|---|---|---|
| Click Track GPS | GPS marker appears | Pending |
| Accuracy circle appears | Blue accuracy circle visible | Pending |
| Click Stop GPS | Marker and circle disappear | Pending |
| Status returns to not tracked | Location not tracked | Pending |
| App does not crash | Stable | Pending |

### 2. Import CSV Waypoints

Test file:

`test-data/gps/gps-test-waypoints.csv`

| Test | Expected Result | Status |
|---|---|---|
| Import CSV | Waypoints appear on map | Pending |
| Popup displays point name | Name visible | Pending |
| Map zooms to imported points | Fit bounds works | Pending |

### 3. Import GPX Waypoints and Tracks

Test file:

`test-data/gps/gps-test-waypoints-tracks.gpx`

| Test | Expected Result | Status |
|---|---|---|
| Import GPX | Waypoints appear | Pending |
| Import GPX track | Track line appears | Pending |
| Popup displays track name | Name visible | Pending |

### 4. Import KML Points and Tracks

Test file:

`test-data/gps/gps-test-points-tracks.kml`

| Test | Expected Result | Status |
|---|---|---|
| Import KML point | Point appears | Pending |
| Import KML LineString | Track appears | Pending |
| Map zooms to features | Fit bounds works | Pending |

### 5. Coordinate Zoom

| Format | Example | Expected Result | Status |
|---|---|---|---|
| DD | 5.9804, 116.0735 | Map zooms to coordinate | Pending |
| DDM | 5 58.824 N, 116 04.410 E | Map zooms to coordinate | Pending |
| DMS | 5 58 49.4 N, 116 04 24.6 E | Map zooms to coordinate | Pending |

### 6. Export Lot to GPX

| Test | Expected Result | Status |
|---|---|---|
| Draw polygon | Polygon appears | Pending |
| Click Export Lot to GPX | GPX file downloads | Pending |
| GPX opens in QGIS / Garmin BaseCamp / GPS tool | Boundary track readable | Pending |

## Issue Log

| ID | Severity | Issue | Action | Status |
|---|---|---|---|---|
| GPS-001 | Major | GPS button not visible | Fixed in previous sprint | Closed |
| GPS-002 | Minor | Stop GPS button slow response | Improved | Monitor |
| GPS-003 | Major | Marker/circle did not disappear after stop | Fixed | Closed |

## QAQC Decision

| Decision | Criteria |
|---|---|
| GO | All core GPS tests pass, no critical issue |
| HOLD | Major issue found but workaround available |
| FIX | Critical issue, crash, wrong export, or misleading coordinate output |

## Field Test Notes

Device:
Location:
Date:
Tester:
Weather:
Mobile browser:
GPS permission:
Result:
Remarks:
