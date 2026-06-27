# SabahLot Sprint 04s — Preliminary Pecah Geran Planner

## Objective

Build a preliminary planning module to help landowners, families, listing partners, and field users prepare an early subdivision planning concept for land matters in Sabah.

This module is named:

**Preliminary Pecah Geran Planner**

It is not an official subdivision approval system.

## Important Legal / Professional Disclaimer

All outputs from this module are preliminary only.

The output is:
- not an official survey plan,
- not a certified boundary plan,
- not proof of land ownership,
- not approval from JTU / PBT / relevant authority,
- not a replacement for a licensed surveyor,
- not a guarantee that pecah geran will be approved.

All coordinates, boundaries, lot areas, proposed sub-lots, access routes, and planning notes must be verified by the relevant authority, licensed surveyor, lawyer, planner, valuer, or professional adviser before official use.

## Product Positioning

SabahLot helps users prepare early land workflow information.

For pecah geran, SabahLot will help users:
- understand parent lot shape,
- prepare preliminary lot division ideas,
- estimate proposed lot areas,
- label proposed sub-lots,
- record family / inheritance allocation,
- mark access route or road reserve idea,
- export preliminary planning information,
- prepare for professional consultation.

## MVP Scope

### 1. Parent Lot

User can use existing polygon as parent lot.

Required information:
- Parent lot name
- District / location
- Land title reference if available
- Approximate area
- Notes
- Source of boundary information

### 2. Proposed Sub-Lots

User can create proposed sub-lots manually.

Each proposed sub-lot should include:
- Proposed Lot ID: Lot A, Lot B, Lot C
- Proposed owner / recipient name
- Approximate area
- Purpose: house site, family allocation, agriculture, access, reserve, other
- Notes

### 3. Area Summary Table

System should show:
- Parent lot approximate area
- Proposed lot area
- Total proposed lot area
- Balance / difference
- Warning if proposed lot appears outside parent boundary
- Warning if proposed lots overlap

### 4. Access / Road Reserve

User can mark preliminary access route.

Output should show:
- Access label
- Approximate length
- Notes
- Warning that access must be verified with relevant authority

### 5. Export Output

MVP output:
- Preliminary Pecah Geran Summary
- Proposed Lot Table
- Disclaimer
- Export to PDF / KML / GPX in later phase

### 6. Risk Labels

The module must display risk warnings:

- Boundary source not verified
- Area is approximate
- Access not confirmed
- Proposed lots require professional review
- Not for official submission without verification
- Not a legal subdivision plan

## Suggested UI Labels

Use:
- Pecah Geran Planner
- Parent Lot
- Proposed Sub-Lot
- Proposed Allocation
- Preliminary Summary
- Professional Review Required

Avoid:
- Approved Lot
- Official Lot
- Legal Boundary
- Final Subdivision
- JTU Approved
- Certified Plan

## Alpha Version Features

Sprint 04s Alpha should focus on:

1. Add requirement documentation
2. Add UI concept label
3. Prepare data model
4. Prepare proposed lot summary logic
5. Prepare manual workflow
6. Avoid auto-split complexity first

## Future Phase

Later versions may include:
- auto split by number of lots,
- split by area target,
- access corridor planning,
- family allocation report,
- upload title document reference,
- professional review workflow,
- assisted service quotation.

## QAQC Criteria

Module can proceed to Alpha only if:
- no wording implies official approval,
- disclaimer appears clearly,
- area is labelled approximate,
- user understands this is preliminary planning only,
- output cannot be mistaken as official survey plan.

## Decision

Status: Approved for controlled development.

Sprint: 04s

Module Name: Preliminary Pecah Geran Planner

Development Mode: Controlled Alpha only
