// Sprint 02B: read-only mapping from cloud rows to the frontend domain
// model. No write-direction mapping exists yet (Sprint 02C).

import type { DrawingObject } from "@/lib/drawing-types";
import type { ApplicantStatus } from "@/lib/local-lots";
import type {
  CloudLandParty,
  CloudLandPartyRow,
  CloudLandPoint,
  CloudLandPointRow,
  CloudLandRecord,
  CloudLandRecordGeometryRow,
  CloudLandRecordRow,
  LandRecordWritableFields,
} from "./types";

export class MapperError extends Error {}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Sprint 02C-1 Patch 1: mirrors DrawingObjectCategory / DrawingLineStyle
// in @/lib/drawing-types.ts exactly (which in turn mirror the
// geometry_category / line_style Postgres enums). Replaces the
// previous unchecked `as DrawingObject["category"]` type assertions --
// an unexpected value now fails loudly via MapperError instead of
// silently flowing through as a value TypeScript claims is valid but
// isn't actually a member of the union at runtime.
// Exported (Sprint 02D-1A) so geometry-validation.ts can validate
// write-direction category/line_style against the exact same list,
// instead of duplicating it and risking drift between read and write
// validation.
export const DRAWING_OBJECT_CATEGORY_VALUES = [
  "parent_lot",
  "proposed_lot",
  "standard_line",
  "proposed_boundary",
  "proposed_access",
  "road_reserve",
  "setback",
  "reference_line",
] as const;

export const DRAWING_LINE_STYLE_VALUES = ["solid", "dashed", "dotted"] as const;

function assertValidCategory(
  value: unknown,
): asserts value is DrawingObject["category"] {
  if (
    typeof value !== "string" ||
    !(DRAWING_OBJECT_CATEGORY_VALUES as readonly string[]).includes(value)
  ) {
    throw new MapperError(
      `land_record_geometries.category has an unexpected value: ${JSON.stringify(value)}.`,
    );
  }
}

function assertValidLineStyle(
  value: unknown,
): asserts value is DrawingObject["lineStyle"] {
  if (
    typeof value !== "string" ||
    !(DRAWING_LINE_STYLE_VALUES as readonly string[]).includes(value)
  ) {
    throw new MapperError(
      `land_record_geometries.line_style has an unexpected value: ${JSON.stringify(value)}.`,
    );
  }
}

interface CoordinatePair {
  lat: number;
  lng: number;
}

function sanitizeCoordinatesJson(value: unknown): CoordinatePair[] {
  if (!Array.isArray(value)) {
    throw new MapperError(
      "land_record_geometries.coordinates was not an array (unexpected cloud data shape).",
    );
  }

  return value.map((entry, index) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !isFiniteNumber((entry as Record<string, unknown>).lat) ||
      !isFiniteNumber((entry as Record<string, unknown>).lng)
    ) {
      throw new MapperError(
        `land_record_geometries.coordinates[${index}] is missing a valid {lat, lng} pair.`,
      );
    }

    const record = entry as Record<string, unknown>;
    return { lat: record.lat as number, lng: record.lng as number };
  });
}

/**
 * Maps one `land_record_geometries` row to the existing DrawingObject
 * union. The two shapes already line up 1:1 (see Sprint 02A schema
 * mapping section 3), so this reuses DrawingObject rather than
 * introducing a parallel type.
 */
export function mapCloudGeometryToDrawingObject(
  row: CloudLandRecordGeometryRow,
): DrawingObject {
  const coordinates = sanitizeCoordinatesJson(row.coordinates);

  assertValidCategory(row.category);
  const lineStyleValue = row.line_style ?? "solid";
  assertValidLineStyle(lineStyleValue);

  const base = {
    id: row.id,
    name: row.name ?? "",
    category: row.category,
    coordinates,
    lineStyle: lineStyleValue,
    color: row.color ?? "#16a34a",
    weight: row.weight ?? 3,
    isVisible: row.is_visible,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.geometry_type === "polygon") {
    return {
      ...base,
      geometryType: "polygon",
      areaSqm: row.area_m2 ?? 0,
      areaHa: row.area_ha ?? 0,
      areaAcre: row.area_acre ?? 0,
      perimeterM: row.perimeter_m ?? 0,
    };
  }

  return {
    ...base,
    geometryType: "line",
    lengthM: row.length_m ?? 0,
    startBearing: row.start_bearing ?? null,
    endBearing: row.end_bearing ?? null,
  };
}

export function mapCloudPoint(row: CloudLandPointRow): CloudLandPoint {
  return {
    id: row.id,
    pointType: row.point_type,
    label: row.label,
    latitude: row.latitude,
    longitude: row.longitude,
    altitude: row.altitude,
    accuracyM: row.accuracy_m,
    note: row.note,
    capturedAt: row.captured_at,
  };
}

export function mapCloudParty(row: CloudLandPartyRow): CloudLandParty {
  return {
    id: row.id,
    partyRole: row.party_role,
    fullName: row.full_name,
    idNumber: row.id_number,
    relationshipToApplicant: row.relationship_to_applicant,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
  };
}

/**
 * Derives `ownerName` from the associated parties rather than a
 * duplicate column on land_records (owner decision #4). Prefers a
 * party with role 'owner'; falls back to 'original_applicant'; null if
 * neither exists yet.
 */
function deriveOwnerName(parties: CloudLandParty[]): string | null {
  const owner = parties.find((party) => party.partyRole === "owner");
  if (owner) return owner.fullName;

  const applicant = parties.find(
    (party) => party.partyRole === "original_applicant",
  );
  return applicant?.fullName ?? null;
}

/**
 * Maps one land_records row plus its already-fetched child rows into
 * the frontend domain model.
 *
 * `existingOriginalApplicantStatus` carries over a local-only value
 * that has no cloud column (owner decision #5, deferred). It is never
 * read from `row` and this function never writes it anywhere -- the
 * caller is responsible for persisting it locally if it changes.
 */
export function mapCloudRecordToDomain(
  row: CloudLandRecordRow,
  children: {
    geometries: CloudLandRecordGeometryRow[];
    points: CloudLandPointRow[];
    parties: CloudLandPartyRow[];
  },
  existingOriginalApplicantStatus: ApplicantStatus | "" = "",
): CloudLandRecord {
  if (typeof row.id !== "string" || typeof row.record_name !== "string") {
    throw new MapperError(
      "land_records row is missing required id/record_name fields.",
    );
  }

  const parties = children.parties.map(mapCloudParty);

  return {
    id: row.id,
    recordName: row.record_name,
    lotNumber: row.lot_number,
    village: row.village,
    district: row.district,
    landCaseType: row.land_case_type ?? "",
    applicationAge: row.application_age ?? "",
    recordsAvailable: row.records_available ?? [],
    issueTags: row.issue_tags ?? [],
    heirsCanIdentifyLocation: row.heirs_can_identify_location ?? "",
    landHistoryNotes: row.land_history_notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    geometries: children.geometries.map(mapCloudGeometryToDrawingObject),
    points: children.points.map(mapCloudPoint),
    parties,
    ownerName: deriveOwnerName(parties),
    originalApplicantStatus: existingOriginalApplicantStatus,
  };
}

/**
 * Sprint 02C: write-direction mapping. Converts the allowlisted,
 * already-validated domain fields (see validation.ts) into the
 * snake_case column names land_records actually uses. Only fields
 * present in `fields` are included in the output, so an UPDATE patch
 * only touches columns the caller intended to change.
 *
 * Deliberately does not accept or emit `id`, `owner_id`, `status`,
 * `created_at`, or `updated_at` -- those are controlled entirely by
 * cloud-repository.ts / write-coordinator.ts, never by this mapper.
 */
export function mapWritableFieldsToDbPayload(
  fields: Partial<LandRecordWritableFields>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if ("recordName" in fields) payload.record_name = fields.recordName;
  if ("lotNumber" in fields) payload.lot_number = fields.lotNumber;
  if ("village" in fields) payload.village = fields.village;
  if ("district" in fields) payload.district = fields.district;
  if ("region" in fields) payload.region = fields.region;
  if ("landCaseType" in fields) payload.land_case_type = fields.landCaseType;
  if ("applicationAge" in fields) payload.application_age = fields.applicationAge;
  if ("recordsAvailable" in fields) {
    payload.records_available = fields.recordsAvailable;
  }
  if ("issueTags" in fields) payload.issue_tags = fields.issueTags;
  if ("heirsCanIdentifyLocation" in fields) {
    payload.heirs_can_identify_location = fields.heirsCanIdentifyLocation;
  }
  if ("landHistoryNotes" in fields) {
    payload.land_history_notes = fields.landHistoryNotes;
  }

  return payload;
}
