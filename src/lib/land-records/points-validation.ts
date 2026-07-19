// Sprint 02D-1B: land_points payload allowlisting and validation.
//
// Same responsibility split as geometry-validation.ts: the only place
// that decides what a client may send for a point create, and the
// only place that validates its content before it ever reaches
// points-repository.ts. CREATE-ONLY (ADR-011) -- there is deliberately
// no validateUpdatePointInput here, and none should be added without a
// new ADR + a migration adding land_points.updated_at.

import { isStableCloudId } from "./types";
import type { CloudLandPointRow } from "./types";
import type { CreatePointInput, PointWritableFields } from "./child-types";
// Reuse the same generic result shape as validation.ts/geometry-validation.ts
// rather than redefining an identically-shaped type under a different
// name -- avoids an export ambiguity in index.ts and keeps one
// canonical "validation result" shape across parent and child writes.
import type { ValidationResult } from "./validation";

// Mirrors supabase/migrations/202607110002_create_land_domain_enums.sql's
// `point_type` enum exactly, and CloudPointType in types.ts.
const POINT_TYPE_VALUES = [
  "boundary_mark",
  "control_point",
  "found_point",
  "track_point",
  "target_point",
] as const;

// Mirrors the CHECK constraints on land_points (see the migration) --
// these are plain-text CHECKs, not Postgres enums, so there is no
// pg_type to cross-reference the way POINT_TYPE_VALUES does.
const QUALITY_GRADE_VALUES = ["A", "B", "C", "D"] as const;
const CAPTURE_METHOD_VALUES = ["single", "averaged", "best-fix", "manual-key-in"] as const;
const SOURCE_VALUES = ["phone-gps", "keyed-coordinate"] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function sanitizeOptionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return isFiniteNumber(value) ? value : undefined;
}

/**
 * A single lat/lng pair (unlike geometry's coordinate array) -- the
 * same "possible swap" heuristic geometry-validation.ts uses is
 * reused here on a best-effort basis, not a guarantee.
 */
function validateLatitude(value: unknown): ValidationResult<number> {
  if (!isFiniteNumber(value)) {
    return { ok: false, error: "latitude must be a finite number." };
  }
  if (value < -90 || value > 90) {
    const swapHint =
      Math.abs(value) <= 180
        ? " (possible lat/lng swap: this value would be a valid longitude)"
        : "";
    return { ok: false, error: `latitude (${value}) is outside -90..90${swapHint}.` };
  }
  return { ok: true, payload: value };
}

function validateLongitude(value: unknown): ValidationResult<number> {
  if (!isFiniteNumber(value)) {
    return { ok: false, error: "longitude must be a finite number." };
  }
  if (value < -180 || value > 180) {
    const swapHint =
      Math.abs(value) <= 90
        ? " (possible lat/lng swap: this value would be a valid latitude)"
        : "";
    return { ok: false, error: `longitude (${value}) is outside -180..180${swapHint}.` };
  }
  return { ok: true, payload: value };
}

function validateCapturedAt(value: unknown): ValidationResult<string | undefined> {
  if (value === undefined) {
    return { ok: true, payload: undefined };
  }
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return { ok: false, error: "capturedAt must be a valid ISO 8601 date string." };
  }
  return { ok: true, payload: value };
}

interface FieldExtractionSuccess {
  ok: true;
  fields: Partial<PointWritableFields>;
}
interface FieldExtractionFailure {
  ok: false;
  error: string;
}
type FieldExtractionResult = FieldExtractionSuccess | FieldExtractionFailure;

function extractWritableFields(input: Record<string, unknown>): FieldExtractionResult {
  const fields: Partial<PointWritableFields> = {};

  if (
    typeof input.pointType !== "string" ||
    !(POINT_TYPE_VALUES as readonly string[]).includes(input.pointType)
  ) {
    return {
      ok: false,
      error: `pointType must be one of: ${POINT_TYPE_VALUES.join(", ")}.`,
    };
  }
  fields.pointType = input.pointType as PointWritableFields["pointType"];

  const latitude = validateLatitude(input.latitude);
  if (!latitude.ok) return latitude;
  fields.latitude = latitude.payload;

  const longitude = validateLongitude(input.longitude);
  if (!longitude.ok) return longitude;
  fields.longitude = longitude.payload;

  const label = sanitizeOptionalString(input.label);
  if (label === undefined && input.label !== undefined) {
    return { ok: false, error: "label must be a string or null." };
  }
  if (label !== undefined) fields.label = label;

  const note = sanitizeOptionalString(input.note);
  if (note === undefined && input.note !== undefined) {
    return { ok: false, error: "note must be a string or null." };
  }
  if (note !== undefined) fields.note = note;

  for (const key of [
    "altitude",
    "accuracyM",
    "altitudeAccuracyM",
    "heading",
    "speed",
    "sampleCount",
    "occupationSeconds",
    "distanceDifferenceM",
    "bearingDegrees",
  ] as const) {
    if (key in input) {
      const numberValue = sanitizeOptionalNumber(input[key]);
      if (numberValue === undefined && input[key] !== undefined) {
        return { ok: false, error: `${key} must be a finite number or null.` };
      }
      fields[key] = numberValue ?? null;
    }
  }

  if ("qualityGrade" in input && input.qualityGrade !== undefined) {
    if (
      input.qualityGrade !== null &&
      (typeof input.qualityGrade !== "string" ||
        !(QUALITY_GRADE_VALUES as readonly string[]).includes(input.qualityGrade))
    ) {
      return {
        ok: false,
        error: `qualityGrade must be one of: ${QUALITY_GRADE_VALUES.join(", ")}, or null.`,
      };
    }
    fields.qualityGrade = input.qualityGrade as PointWritableFields["qualityGrade"];
  }

  if ("captureMethod" in input && input.captureMethod !== undefined) {
    if (
      input.captureMethod !== null &&
      (typeof input.captureMethod !== "string" ||
        !(CAPTURE_METHOD_VALUES as readonly string[]).includes(input.captureMethod))
    ) {
      return {
        ok: false,
        error: `captureMethod must be one of: ${CAPTURE_METHOD_VALUES.join(", ")}, or null.`,
      };
    }
    fields.captureMethod = input.captureMethod as PointWritableFields["captureMethod"];
  }

  if ("source" in input && input.source !== undefined) {
    if (
      input.source !== null &&
      (typeof input.source !== "string" ||
        !(SOURCE_VALUES as readonly string[]).includes(input.source))
    ) {
      return {
        ok: false,
        error: `source must be one of: ${SOURCE_VALUES.join(", ")}, or null.`,
      };
    }
    fields.source = input.source as PointWritableFields["source"];
  }

  const capturedAt = validateCapturedAt(input.capturedAt);
  if (!capturedAt.ok) return capturedAt;
  if (capturedAt.payload !== undefined) fields.capturedAt = capturedAt.payload;

  return { ok: true, fields };
}

export function validateCreatePointInput(
  input: CreatePointInput,
): ValidationResult<CreatePointInput> {
  if (typeof input.id !== "string" || !isStableCloudId(input.id)) {
    return {
      ok: false,
      error: "Point id is missing or not a stable UUID (legacy_child_id_requires_mapping).",
    };
  }

  if (
    input.landRecordId !== undefined &&
    input.landRecordId !== null &&
    !isStableCloudId(input.landRecordId)
  ) {
    return { ok: false, error: "landRecordId must be a valid UUID or null (unlinked point)." };
  }

  const extraction = extractWritableFields(input as unknown as Record<string, unknown>);
  if (!extraction.ok) return extraction;

  const { fields } = extraction;

  return {
    ok: true,
    payload: {
      id: input.id,
      landRecordId: input.landRecordId ?? null,
      pointType: fields.pointType!,
      latitude: fields.latitude!,
      longitude: fields.longitude!,
      ...(fields.label !== undefined ? { label: fields.label } : {}),
      ...(fields.note !== undefined ? { note: fields.note } : {}),
      ...(fields.altitude !== undefined ? { altitude: fields.altitude } : {}),
      ...(fields.accuracyM !== undefined ? { accuracyM: fields.accuracyM } : {}),
      ...(fields.altitudeAccuracyM !== undefined
        ? { altitudeAccuracyM: fields.altitudeAccuracyM }
        : {}),
      ...(fields.heading !== undefined ? { heading: fields.heading } : {}),
      ...(fields.speed !== undefined ? { speed: fields.speed } : {}),
      ...(fields.qualityGrade !== undefined ? { qualityGrade: fields.qualityGrade } : {}),
      ...(fields.captureMethod !== undefined ? { captureMethod: fields.captureMethod } : {}),
      ...(fields.source !== undefined ? { source: fields.source } : {}),
      ...(fields.sampleCount !== undefined ? { sampleCount: fields.sampleCount } : {}),
      ...(fields.occupationSeconds !== undefined
        ? { occupationSeconds: fields.occupationSeconds }
        : {}),
      ...(fields.distanceDifferenceM !== undefined
        ? { distanceDifferenceM: fields.distanceDifferenceM }
        : {}),
      ...(fields.bearingDegrees !== undefined ? { bearingDegrees: fields.bearingDegrees } : {}),
      ...(fields.capturedAt !== undefined ? { capturedAt: fields.capturedAt } : {}),
    },
  };
}

// ---------------------------------------------------------------------
// Duplicate-create payload comparison (Sprint 02C-1 Patch 1 pattern,
// applied to points). Deliberately excludes id, landRecordId,
// captured_by (session-derived, never caller content), and created_at
// -- only fields the caller actually controls on create. capturedAt IS
// included: it is caller-supplied content (when the reading was taken),
// not a server audit field.
// ---------------------------------------------------------------------

const COMPARABLE_POINT_FIELDS = [
  "pointType",
  "label",
  "latitude",
  "longitude",
  "altitude",
  "accuracyM",
  "altitudeAccuracyM",
  "heading",
  "speed",
  "qualityGrade",
  "captureMethod",
  "source",
  "sampleCount",
  "occupationSeconds",
  "distanceDifferenceM",
  "bearingDegrees",
  "note",
  "capturedAt",
] as const;

export type ComparablePointFieldName = (typeof COMPARABLE_POINT_FIELDS)[number];

export type ComparablePointPayload = Partial<Record<ComparablePointFieldName, string | number | null>>;

function normalizeComparableValue(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return value;
  return String(value);
}

export function buildComparablePointPayload(payload: CreatePointInput): ComparablePointPayload {
  const comparable: ComparablePointPayload = {};

  for (const field of COMPARABLE_POINT_FIELDS) {
    if (field in payload) {
      comparable[field] = normalizeComparableValue(
        (payload as unknown as Record<string, unknown>)[field],
      );
    }
  }

  return comparable;
}

const ROW_COLUMN_BY_FIELD: Record<ComparablePointFieldName, keyof CloudLandPointRow> = {
  pointType: "point_type",
  label: "label",
  latitude: "latitude",
  longitude: "longitude",
  altitude: "altitude",
  accuracyM: "accuracy_m",
  altitudeAccuracyM: "altitude_accuracy_m",
  heading: "heading",
  speed: "speed",
  qualityGrade: "quality_grade",
  captureMethod: "capture_method",
  source: "source",
  sampleCount: "sample_count",
  occupationSeconds: "occupation_seconds",
  distanceDifferenceM: "distance_difference_m",
  bearingDegrees: "bearing_degrees",
  note: "note",
  capturedAt: "captured_at",
};

export function extractComparableFieldsFromPointRow(
  row: CloudLandPointRow,
  fieldsToExtract: readonly ComparablePointFieldName[],
): ComparablePointPayload {
  const comparable: ComparablePointPayload = {};

  for (const field of fieldsToExtract) {
    const column = ROW_COLUMN_BY_FIELD[field];
    comparable[field] = normalizeComparableValue(row[column]);
  }

  return comparable;
}

export function arePointPayloadsEquivalent(
  requested: ComparablePointPayload,
  existing: ComparablePointPayload,
): boolean {
  const fields = Object.keys(requested) as ComparablePointFieldName[];
  return fields.every((field) => requested[field] === existing[field]);
}
