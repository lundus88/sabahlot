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
} from "./types";

export class MapperError extends Error {}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

  const base = {
    id: row.id,
    name: row.name ?? "",
    category: row.category as DrawingObject["category"],
    coordinates,
    lineStyle: (row.line_style ?? "solid") as DrawingObject["lineStyle"],
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
