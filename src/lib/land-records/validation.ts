// Sprint 02C: create/update payload allowlisting and validation.
//
// This is the one place responsible for stripping anything the client
// should never be able to set (owner, status, audit fields, ids other
// than the record's own stable id) before a payload ever reaches
// cloud-repository.ts. Fields not in the allowlist are silently
// dropped here, not merely rejected -- callers of the write
// coordinator never need to know this file exists.
//
// Sprint 02C-1 Patch 1: enum-typed fields are now validated against
// the actual enum value lists (mirroring
// supabase/migrations/202607110002_create_land_domain_enums.sql and
// the equivalent unions in local-lots.ts), not just `typeof ===
// "string"`. An invalid value is rejected here with
// `validation_failed`, rather than reaching the database and coming
// back as a less-specific database_error.

import { isStableCloudId } from "./types";
import type {
  CloudLandRecordRow,
  CreateLandRecordInput,
  LandRecordWritableFields,
  UpdateLandRecordInput,
} from "./types";

export interface ValidationFailure {
  ok: false;
  error: string;
}

export interface ValidationSuccess<T> {
  ok: true;
  payload: T;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

const REGION_VALUES = ["sabah", "sarawak", "peninsular"] as const;

// Mirrors LandCaseType (local-lots.ts) / land_case_type enum
// (202607110002_create_land_domain_enums.sql), excluding the ""
// empty-UI-state member, which is not a valid cloud value.
const LAND_CASE_TYPE_VALUES = [
  "land_application",
  "inheritance_land",
  "family_customary_land",
  "titled_land",
  "unsure",
] as const;

const APPLICATION_AGE_VALUES = [
  "under_5_years",
  "5_to_10_years",
  "10_to_20_years",
  "over_20_years",
  "unsure",
] as const;

const LAND_AVAILABLE_RECORD_VALUES = [
  "title",
  "official_receipt",
  "application_letter",
  "plan_or_sketch",
  "gps_coordinates",
  "site_photos",
  "no_record",
] as const;

const LAND_ISSUE_TAG_VALUES = [
  "unknown_application_status",
  "difficult_to_get_information",
  "lost_documents",
  "unknown_land_location",
  "unclear_land_process",
  "boundary_dispute",
  "title_subdivision",
  "customary_land_ncr",
  "encroachment",
  "overlapping_land",
] as const;

const HEIR_LOCATION_KNOWLEDGE_VALUES = ["yes", "no", "not_sure"] as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sanitizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function isValidEnumOrNull(
  value: unknown,
  allowed: readonly string[],
): value is string | null {
  return value === null || (typeof value === "string" && allowed.includes(value));
}

function isValidEnumArray(value: unknown, allowed: readonly string[]): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && allowed.includes(item))
  );
}

interface FieldExtractionSuccess {
  ok: true;
  fields: Partial<LandRecordWritableFields>;
}

interface FieldExtractionFailure {
  ok: false;
  error: string;
}

type FieldExtractionResult = FieldExtractionSuccess | FieldExtractionFailure;

/**
 * Strips every field not explicitly allowlisted here -- this is the
 * only function in Sprint 02C allowed to decide what a client is
 * permitted to send. `id`, `owner_id`, `status`, `created_at`,
 * `updated_at` are never read from `input` even if present; they are
 * simply not in the allowlist below.
 *
 * Returns a Partial: a field is only present in the result if the
 * caller actually supplied it. This is deliberate so an UPDATE patch
 * only touches fields the caller intended to change.
 *
 * A field present with an invalid enum value fails the whole
 * extraction (not silently dropped) -- an invalid selection is a
 * caller bug worth surfacing as `validation_failed`, not data to
 * quietly discard.
 */
function extractWritableFields(
  input: Record<string, unknown>,
): FieldExtractionResult {
  const fields: Partial<LandRecordWritableFields> = {};

  if ("recordName" in input) {
    fields.recordName = isNonEmptyString(input.recordName) ? input.recordName : "";
  }

  const lotNumber = sanitizeOptionalString(input.lotNumber);
  if (lotNumber !== undefined) fields.lotNumber = lotNumber;

  const village = sanitizeOptionalString(input.village);
  if (village !== undefined) fields.village = village;

  const district = sanitizeOptionalString(input.district);
  if (district !== undefined) fields.district = district;

  if ("region" in input) {
    if (
      typeof input.region !== "string" ||
      !(REGION_VALUES as readonly string[]).includes(input.region)
    ) {
      return {
        ok: false,
        error: `region must be one of: ${REGION_VALUES.join(", ")}.`,
      };
    }
    fields.region = input.region as (typeof REGION_VALUES)[number];
  }

  if ("landCaseType" in input) {
    if (!isValidEnumOrNull(input.landCaseType, LAND_CASE_TYPE_VALUES)) {
      return {
        ok: false,
        error: `landCaseType must be null or one of: ${LAND_CASE_TYPE_VALUES.join(", ")}.`,
      };
    }
    fields.landCaseType = input.landCaseType as LandRecordWritableFields["landCaseType"];
  }

  if ("applicationAge" in input) {
    if (!isValidEnumOrNull(input.applicationAge, APPLICATION_AGE_VALUES)) {
      return {
        ok: false,
        error: `applicationAge must be null or one of: ${APPLICATION_AGE_VALUES.join(", ")}.`,
      };
    }
    fields.applicationAge =
      input.applicationAge as LandRecordWritableFields["applicationAge"];
  }

  if ("recordsAvailable" in input) {
    if (!isValidEnumArray(input.recordsAvailable, LAND_AVAILABLE_RECORD_VALUES)) {
      return {
        ok: false,
        error: `recordsAvailable must be an array containing only: ${LAND_AVAILABLE_RECORD_VALUES.join(", ")}.`,
      };
    }
    fields.recordsAvailable =
      input.recordsAvailable as LandRecordWritableFields["recordsAvailable"];
  }

  if ("issueTags" in input) {
    if (!isValidEnumArray(input.issueTags, LAND_ISSUE_TAG_VALUES)) {
      return {
        ok: false,
        error: `issueTags must be an array containing only: ${LAND_ISSUE_TAG_VALUES.join(", ")}.`,
      };
    }
    fields.issueTags = input.issueTags as LandRecordWritableFields["issueTags"];
  }

  if ("heirsCanIdentifyLocation" in input) {
    if (!isValidEnumOrNull(input.heirsCanIdentifyLocation, HEIR_LOCATION_KNOWLEDGE_VALUES)) {
      return {
        ok: false,
        error: `heirsCanIdentifyLocation must be null or one of: ${HEIR_LOCATION_KNOWLEDGE_VALUES.join(", ")}.`,
      };
    }
    fields.heirsCanIdentifyLocation =
      input.heirsCanIdentifyLocation as LandRecordWritableFields["heirsCanIdentifyLocation"];
  }

  const landHistoryNotes = sanitizeOptionalString(input.landHistoryNotes);
  if (landHistoryNotes !== undefined) {
    fields.landHistoryNotes = landHistoryNotes;
  }

  return { ok: true, fields };
}

export function validateCreatePayload(
  input: CreateLandRecordInput,
): ValidationResult<CreateLandRecordInput> {
  if (typeof input.id !== "string" || !isStableCloudId(input.id)) {
    return {
      ok: false,
      error:
        "Record id is missing or not a stable UUID (LEGACY ID REQUIRES MIGRATION MAPPING).",
    };
  }

  const extraction = extractWritableFields(input as unknown as Record<string, unknown>);
  if (!extraction.ok) {
    return extraction;
  }

  const { fields } = extraction;
  if (!isNonEmptyString(fields.recordName)) {
    return { ok: false, error: "recordName is required and cannot be blank." };
  }

  return {
    ok: true,
    payload: { id: input.id, ...fields, recordName: fields.recordName },
  };
}

export function validateUpdatePayload(
  input: UpdateLandRecordInput,
): ValidationResult<UpdateLandRecordInput> {
  const extraction = extractWritableFields(input as unknown as Record<string, unknown>);
  if (!extraction.ok) {
    return extraction;
  }

  const { fields } = extraction;
  if ("recordName" in fields && !isNonEmptyString(fields.recordName)) {
    return {
      ok: false,
      error: "recordName cannot be set to a blank value.",
    };
  }

  return { ok: true, payload: fields };
}

// ---------------------------------------------------------------------
// Sprint 02C-1 Patch 1: duplicate-create payload comparison.
//
// Used only by write-coordinator.ts's 23505 handling, to decide
// whether a retry with the same stable id is a verified idempotent
// success (identical allowlisted content) or a genuine
// `duplicate_conflict` (same id, different content). Deliberately
// covers ONLY the fields a caller controls on create -- id, owner_id,
// status, created_at, updated_at are never part of this comparison.
// ---------------------------------------------------------------------

const COMPARABLE_CREATE_FIELDS = [
  "recordName",
  "lotNumber",
  "village",
  "district",
  "region",
  "landCaseType",
  "applicationAge",
  "recordsAvailable",
  "issueTags",
  "heirsCanIdentifyLocation",
  "landHistoryNotes",
] as const;

export type ComparableFieldName = (typeof COMPARABLE_CREATE_FIELDS)[number];

export type ComparableCreatePayload = Partial<
  Record<ComparableFieldName, string | string[] | null>
>;

function normalizeComparableValue(value: unknown): string | string[] | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    // Order carries no meaning for these tag-style fields -- sort a
    // copy so insignificant reordering never causes a false mismatch.
    return [...value]
      .filter((item): item is string => typeof item === "string")
      .sort();
  }
  return String(value);
}

/**
 * Builds the comparable representation of a create request's own
 * (already-validated, allowlisted) payload. Only fields the caller
 * actually specified THIS attempt are included, so a retry that omits
 * an optional field it never asserted a value for is not unfairly
 * rejected against that field.
 */
export function buildComparableCreatePayload(
  payload: CreateLandRecordInput,
): ComparableCreatePayload {
  const comparable: ComparableCreatePayload = {};

  for (const field of COMPARABLE_CREATE_FIELDS) {
    if (field in payload) {
      comparable[field] = normalizeComparableValue(
        (payload as unknown as Record<string, unknown>)[field],
      );
    }
  }

  return comparable;
}

const ROW_COLUMN_BY_FIELD: Record<ComparableFieldName, keyof CloudLandRecordRow> = {
  recordName: "record_name",
  lotNumber: "lot_number",
  village: "village",
  district: "district",
  region: "region",
  landCaseType: "land_case_type",
  applicationAge: "application_age",
  recordsAvailable: "records_available",
  issueTags: "issue_tags",
  heirsCanIdentifyLocation: "heirs_can_identify_location",
  landHistoryNotes: "land_history_notes",
};

/**
 * Extracts only `fieldsToExtract` from a database row, normalized the
 * same way as buildComparableCreatePayload so the two are directly
 * comparable. `ROW_COLUMN_BY_FIELD` deliberately has no entry for
 * owner_id/status/created_at/updated_at/id -- there is no way to
 * accidentally pull those into a comparison here.
 */
export function extractComparableFieldsFromRow(
  row: CloudLandRecordRow,
  fieldsToExtract: readonly ComparableFieldName[],
): ComparableCreatePayload {
  const comparable: ComparableCreatePayload = {};

  for (const field of fieldsToExtract) {
    comparable[field] = normalizeComparableValue(row[ROW_COLUMN_BY_FIELD[field]]);
  }

  return comparable;
}

/**
 * Field-by-field structural comparison -- deliberately not a raw
 * `JSON.stringify(a) === JSON.stringify(b)` (which is sensitive to key
 * order and would need its own canonicalization step to be trustworthy
 * on its own). Only the fields present in `requested` are compared;
 * `existing` is expected to have been built via
 * extractComparableFieldsFromRow with exactly those same fields.
 */
export function areCreatePayloadsEquivalent(
  requested: ComparableCreatePayload,
  existing: ComparableCreatePayload,
): boolean {
  const fields = Object.keys(requested) as ComparableFieldName[];

  return fields.every((field) => {
    const a = requested[field];
    const b = existing[field];

    if (Array.isArray(a) || Array.isArray(b)) {
      const arrA = Array.isArray(a) ? a : [];
      const arrB = Array.isArray(b) ? b : [];
      return (
        arrA.length === arrB.length &&
        arrA.every((value, index) => value === arrB[index])
      );
    }

    return a === b;
  });
}
