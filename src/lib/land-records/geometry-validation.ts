// Sprint 02D-1A: geometry payload allowlisting and validation.
//
// Same responsibility split as validation.ts (land_records): this file
// is the only place that decides what a client may send for a
// geometry create/update, and the only place that validates
// coordinate/enum content before it ever reaches geometry-repository.ts.
//
// Validation performed here is STRUCTURAL and COORDINATE-level only:
//   - structural: array shape, required fields present, types correct
//   - coordinate: numeric range, finiteness, minimum vertex count,
//     ring closure (normalized, not silently rejected)
// It is explicitly NOT topological validation: self-intersection,
// polygon validity in the OGC sense, or overlap with other geometries
// is NOT checked here -- no geometry library exists in this repo's
// dependencies, and adding one is out of scope for Sprint 02D-1A (see
// the Sprint 02D-1A report, section "Polygon validity", for why this
// is flagged as a follow-up rather than solved here). A geometry that
// passes this validation is structurally well-formed, not a
// legally-valid survey boundary -- the app-wide "Preliminary Field
// Assist" status and disclaimers are unaffected and unchanged by this
// file.

import {
  DRAWING_LINE_STYLE_VALUES,
  DRAWING_OBJECT_CATEGORY_VALUES,
} from "./mapper";
import { isStableCloudId } from "./types";
import type { CloudLandRecordGeometryRow } from "./types";
import type {
  CreateGeometryInput,
  GeometryWritableFields,
  UpdateGeometryInput,
} from "./child-types";
// Reuse the same generic result shape as validation.ts (land_records)
// rather than redefining an identically-shaped type under a different
// name -- avoids an export ambiguity in index.ts and keeps one
// canonical "validation result" shape across parent and child writes.
import type { ValidationResult } from "./validation";

const GEOMETRY_TYPE_VALUES = ["polygon", "line"] as const;

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
 * Validates and normalizes a coordinate array. Coordinate order is
 * always the named-field shape `{lat, lng}` used throughout this app
 * (never a positional [lng, lat]/[lat, lng] array), so there is no
 * "which axis is which" ambiguity to resolve here -- there is nothing
 * to swap. What IS checked is whether each value is actually a
 * plausible latitude/longitude; a value that is out of range for its
 * own field but would be in range for the OTHER field is flagged with
 * a specific "possible lat/lng swap" hint, on a best-effort basis --
 * this is a heuristic, not a guarantee, since a genuinely wrong
 * out-of-range value with no plausible swap interpretation is just
 * rejected as invalid either way.
 */
function validateCoordinates(
  value: unknown,
  geometryType: "polygon" | "line",
): ValidationResult<{ lat: number; lng: number }[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: "coordinates must be a non-empty array." };
  }

  const minVertices = geometryType === "polygon" ? 3 : 2;
  if (value.length < minVertices) {
    return {
      ok: false,
      error: `coordinates must contain at least ${minVertices} vertices for a ${geometryType}.`,
    };
  }

  const normalized: { lat: number; lng: number }[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];

    if (typeof entry !== "object" || entry === null) {
      return { ok: false, error: `coordinates[${index}] is not a valid {lat, lng} object.` };
    }

    const { lat, lng } = entry as Record<string, unknown>;

    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
      return {
        ok: false,
        error: `coordinates[${index}] has a non-finite lat/lng (NaN and Infinity are rejected).`,
      };
    }

    if (lat < -90 || lat > 90) {
      const swapHint =
        Math.abs(lat) <= 180 && Math.abs(lng) <= 90
          ? " (possible lat/lng swap: this value would be a valid longitude)"
          : "";
      return {
        ok: false,
        error: `coordinates[${index}].lat (${lat}) is outside -90..90${swapHint}.`,
      };
    }

    if (lng < -180 || lng > 180) {
      const swapHint =
        Math.abs(lng) <= 90 && Math.abs(lat) <= 180
          ? " (possible lat/lng swap: this value would be a valid latitude)"
          : "";
      return {
        ok: false,
        error: `coordinates[${index}].lng (${lng}) is outside -180..180${swapHint}.`,
      };
    }

    normalized.push({ lat, lng });
  }

  // Reject unnecessary duplicate CONSECUTIVE vertices (not duplicates
  // anywhere in the ring -- a closed ring's first/last point is
  // expected to repeat, handled separately below).
  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    if (previous.lat === current.lat && previous.lng === current.lng) {
      return {
        ok: false,
        error: `coordinates[${index}] duplicates the previous vertex exactly.`,
      };
    }
  }

  if (geometryType === "polygon") {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (first.lat !== last.lat || first.lng !== last.lng) {
      // Normalize explicitly (matches the existing app-wide convention
      // in local-lots.ts createGeoJson, which always closes the ring)
      // rather than silently rejecting a not-yet-closed ring.
      normalized.push({ lat: first.lat, lng: first.lng });
    }
  }

  return { ok: true, payload: normalized };
}

interface FieldExtractionSuccess {
  ok: true;
  fields: Partial<GeometryWritableFields>;
}
interface FieldExtractionFailure {
  ok: false;
  error: string;
}
type FieldExtractionResult = FieldExtractionSuccess | FieldExtractionFailure;

function extractWritableFields(
  input: Record<string, unknown>,
  requireCore: boolean,
): FieldExtractionResult {
  const fields: Partial<GeometryWritableFields> = {};

  if (requireCore || "geometryType" in input) {
    if (
      typeof input.geometryType !== "string" ||
      !(GEOMETRY_TYPE_VALUES as readonly string[]).includes(input.geometryType)
    ) {
      return {
        ok: false,
        error: `geometryType must be one of: ${GEOMETRY_TYPE_VALUES.join(", ")}.`,
      };
    }
    fields.geometryType = input.geometryType as GeometryWritableFields["geometryType"];
  }

  if (requireCore || "category" in input) {
    if (
      typeof input.category !== "string" ||
      !(DRAWING_OBJECT_CATEGORY_VALUES as readonly string[]).includes(input.category)
    ) {
      return {
        ok: false,
        error: `category must be one of: ${DRAWING_OBJECT_CATEGORY_VALUES.join(", ")}.`,
      };
    }
    fields.category = input.category as GeometryWritableFields["category"];
  }

  if (requireCore || "coordinates" in input) {
    const geometryTypeForValidation =
      (fields.geometryType as "polygon" | "line" | undefined) ??
      (typeof input.geometryType === "string" ? (input.geometryType as "polygon" | "line") : "polygon");

    const coordinates = validateCoordinates(input.coordinates, geometryTypeForValidation);
    if (!coordinates.ok) return coordinates;
    fields.coordinates = coordinates.payload;
  }

  if ("lineStyle" in input) {
    if (
      typeof input.lineStyle !== "string" ||
      !(DRAWING_LINE_STYLE_VALUES as readonly string[]).includes(input.lineStyle)
    ) {
      return {
        ok: false,
        error: `lineStyle must be one of: ${DRAWING_LINE_STYLE_VALUES.join(", ")}.`,
      };
    }
    fields.lineStyle = input.lineStyle as GeometryWritableFields["lineStyle"];
  }

  const name = sanitizeOptionalString(input.name);
  if (name !== undefined) fields.name = name;

  const color = sanitizeOptionalString(input.color);
  if (color !== undefined) fields.color = color;

  if ("weight" in input) {
    const weight = sanitizeOptionalNumber(input.weight);
    if (weight === undefined && input.weight !== undefined) {
      return { ok: false, error: "weight must be a finite number or null." };
    }
    fields.weight = weight ?? null;
  }

  if ("isVisible" in input) {
    if (typeof input.isVisible !== "boolean") {
      return { ok: false, error: "isVisible must be a boolean." };
    }
    fields.isVisible = input.isVisible;
  }

  for (const key of [
    "areaSqm",
    "areaHa",
    "areaAcre",
    "perimeterM",
    "lengthM",
    "startBearing",
    "endBearing",
  ] as const) {
    if (key in input) {
      const numberValue = sanitizeOptionalNumber(input[key]);
      if (numberValue === undefined && input[key] !== undefined) {
        return { ok: false, error: `${key} must be a finite number or null.` };
      }
      fields[key] = numberValue ?? null;
    }
  }

  return { ok: true, fields };
}

export function validateCreateGeometryInput(
  input: CreateGeometryInput,
): ValidationResult<CreateGeometryInput> {
  if (typeof input.id !== "string" || !isStableCloudId(input.id)) {
    return {
      ok: false,
      error: "Geometry id is missing or not a stable UUID (legacy_child_id_requires_mapping).",
    };
  }

  if (typeof input.landRecordId !== "string" || !isStableCloudId(input.landRecordId)) {
    return { ok: false, error: "landRecordId is missing or not a valid UUID." };
  }

  const extraction = extractWritableFields(
    input as unknown as Record<string, unknown>,
    true,
  );
  if (!extraction.ok) return extraction;

  const { fields } = extraction;

  // Structural-only cross-field check mirroring the DB CHECK
  // constraints (land_record_geometries_polygon_fields_check /
  // _line_fields_check) -- catching this here gives a clean
  // validation_failed instead of a raw database_error.
  if (fields.geometryType === "polygon") {
    if (fields.lengthM != null || fields.startBearing != null || fields.endBearing != null) {
      return {
        ok: false,
        error: "a polygon geometry cannot carry line-only fields (lengthM/startBearing/endBearing).",
      };
    }
  } else if (fields.geometryType === "line") {
    if (
      fields.areaSqm != null ||
      fields.areaHa != null ||
      fields.areaAcre != null ||
      fields.perimeterM != null
    ) {
      return {
        ok: false,
        error: "a line geometry cannot carry polygon-only fields (areaSqm/areaHa/areaAcre/perimeterM).",
      };
    }
  }

  return {
    ok: true,
    payload: {
      id: input.id,
      landRecordId: input.landRecordId,
      geometryType: fields.geometryType!,
      category: fields.category!,
      coordinates: fields.coordinates!,
      ...(fields.name !== undefined ? { name: fields.name } : {}),
      ...(fields.lineStyle !== undefined ? { lineStyle: fields.lineStyle } : {}),
      ...(fields.color !== undefined ? { color: fields.color } : {}),
      ...(fields.weight !== undefined ? { weight: fields.weight } : {}),
      ...(fields.isVisible !== undefined ? { isVisible: fields.isVisible } : {}),
      ...(fields.areaSqm !== undefined ? { areaSqm: fields.areaSqm } : {}),
      ...(fields.areaHa !== undefined ? { areaHa: fields.areaHa } : {}),
      ...(fields.areaAcre !== undefined ? { areaAcre: fields.areaAcre } : {}),
      ...(fields.perimeterM !== undefined ? { perimeterM: fields.perimeterM } : {}),
      ...(fields.lengthM !== undefined ? { lengthM: fields.lengthM } : {}),
      ...(fields.startBearing !== undefined ? { startBearing: fields.startBearing } : {}),
      ...(fields.endBearing !== undefined ? { endBearing: fields.endBearing } : {}),
    },
  };
}

export function validateUpdateGeometryInput(
  input: UpdateGeometryInput,
): ValidationResult<UpdateGeometryInput> {
  const extraction = extractWritableFields(
    input as unknown as Record<string, unknown>,
    false,
  );
  if (!extraction.ok) return extraction;

  return { ok: true, payload: extraction.fields };
}

// ---------------------------------------------------------------------
// Duplicate-create payload comparison (Sprint 02C-1 Patch 1 pattern,
// applied to geometry). Deliberately excludes id, land_record_id,
// created_at, updated_at -- only fields the caller controls on create.
// ---------------------------------------------------------------------

const COMPARABLE_GEOMETRY_FIELDS = [
  "geometryType",
  "category",
  "name",
  "coordinates",
  "lineStyle",
  "color",
  "weight",
  "isVisible",
  "areaSqm",
  "areaHa",
  "areaAcre",
  "perimeterM",
  "lengthM",
  "startBearing",
  "endBearing",
] as const;

export type ComparableGeometryFieldName = (typeof COMPARABLE_GEOMETRY_FIELDS)[number];

export type ComparableGeometryPayload = Partial<
  Record<ComparableGeometryFieldName, string | number | boolean | null>
>;

function normalizeComparableValue(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) {
    // Coordinates: order IS meaningful for a ring/line (unlike the
    // tag-style arrays on land_records), so this is a stable
    // JSON-of-normalized-points comparison, not a sorted-set
    // comparison.
    return JSON.stringify(
      value.map((point) => {
        const { lat, lng } = point as { lat: number; lng: number };
        return [lat, lng];
      }),
    );
  }
  return String(value);
}

export function buildComparableGeometryPayload(
  payload: CreateGeometryInput,
): ComparableGeometryPayload {
  const comparable: ComparableGeometryPayload = {};

  for (const field of COMPARABLE_GEOMETRY_FIELDS) {
    if (field in payload) {
      comparable[field] = normalizeComparableValue(
        (payload as unknown as Record<string, unknown>)[field],
      );
    }
  }

  return comparable;
}

const ROW_COLUMN_BY_FIELD: Record<ComparableGeometryFieldName, keyof CloudLandRecordGeometryRow> = {
  geometryType: "geometry_type",
  category: "category",
  name: "name",
  coordinates: "coordinates",
  lineStyle: "line_style",
  color: "color",
  weight: "weight",
  isVisible: "is_visible",
  areaSqm: "area_m2",
  areaHa: "area_ha",
  areaAcre: "area_acre",
  perimeterM: "perimeter_m",
  lengthM: "length_m",
  startBearing: "start_bearing",
  endBearing: "end_bearing",
};

export function extractComparableFieldsFromGeometryRow(
  row: CloudLandRecordGeometryRow,
  fieldsToExtract: readonly ComparableGeometryFieldName[],
): ComparableGeometryPayload {
  const comparable: ComparableGeometryPayload = {};

  for (const field of fieldsToExtract) {
    const column = ROW_COLUMN_BY_FIELD[field];
    const rawValue = row[column];

    comparable[field] =
      field === "coordinates"
        ? normalizeComparableValue(rawValue)
        : normalizeComparableValue(rawValue);
  }

  return comparable;
}

export function areGeometryPayloadsEquivalent(
  requested: ComparableGeometryPayload,
  existing: ComparableGeometryPayload,
): boolean {
  const fields = Object.keys(requested) as ComparableGeometryFieldName[];
  return fields.every((field) => requested[field] === existing[field]);
}
