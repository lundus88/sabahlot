# SabahLot Handheld GPS QAQC Checklist

Purpose: test the handheld GPS / phone GPS function in SabahLot Alpha.

## QAQC Scope

This QAQC covers:
- Start GPS tracking
- Stop GPS tracking
- Current location marker
- GPS accuracy display
- Mobile phone usability
- Permission handling
- Field point recording
- Save/load GPS-related records
- Preliminary GPS disclaimer

## Important Disclaimer

Phone GPS is for preliminary field reference only. It is not survey-grade GNSS, not certified boundary evidence, and not suitable for official boundary confirmation. All coordinates must be verified by the relevant authority, licensed surveyor, or professional adviser before official use.

## Desktop Test

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Open SabahLot | App loads normally | Pending | |
| Start tracking | Browser asks location permission | Pending | |
| Allow permission | Current location marker appears | Pending | |
| Accuracy display | Accuracy in meters is shown | Pending | |
| Stop tracking | Tracking stops safely | Pending | |
| Deny permission | Friendly error message appears | Pending | |
| Refresh browser | No crash | Pending | |

## Mobile Test

| Test | Expected Result | Status | Notes |
|---|---|---|---|
| Open app on phone | Layout usable | Pending | |
| Allow GPS | Location marker appears | Pending | |
| Outdoor test | Accuracy improves | Pending | |
| Move 10–20m | Position updates | Pending | |
| Add field point | GPS point recorded | Pending | |
| Save record | Record saved | Pending | |
| Load record | Point reloads correctly | Pending | |
| Stop tracking | GPS stops safely | Pending | |

## Pass Criteria

| Criteria | Status |
|---|---|
| No crash | Pending |
| Permission handling works | Pending |
| GPS marker visible | Pending |
| Accuracy visible | Pending |
| Phone layout usable | Pending |
| GPS point can be saved | Pending |
| GPS point can be loaded | Pending |
| Disclaimer clear | Pending |

## Issue Log

| Issue ID | Severity | Description | Action |
|---|---|---|---|
| GPS-001 | | | |
| GPS-002 | | | |
| GPS-003 | | | |

## QAQC Decision

Decision: Pending

Options:
- Pass
- Pass with Minor Issues
- Hold and Fix
- Stop due to Critical Issue
