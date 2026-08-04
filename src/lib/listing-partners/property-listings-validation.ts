// Sprint property-listings-backend: property_listings payload
// allowlisting and validation. Mirrors
// supabase/migrations/202608040001_create_listing_partner.sql's CHECK
// constraint exactly (non-empty title) -- this is a client-side
// pre-check, not the actual authorization/validation boundary (that's
// RLS + the DB's own CHECK constraint).

import { isStableCloudId } from "../land-records/types";
import type {
  CreatePropertyListingInput,
  PropertyListingRegion,
  PropertyListingRow,
  PropertyListingStatus,
  PropertyListingType,
  PropertyListingWritableFields,
  UpdatePropertyListingInput,
  ValidationResult,
} from "./types";

const LISTING_TYPE_VALUES: readonly PropertyListingType[] = ["for_sale", "for_lease"];
const LISTING_STATUS_VALUES: readonly PropertyListingStatus[] = [
  "draft",
  "pending_review",
  "active",
  "under_offer",
  "sold",
  "leased",
  "expired",
  "removed",
];
const REGION_VALUES: readonly PropertyListingRegion[] = ["sabah", "sarawak", "peninsular"];

function sanitizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

interface FieldExtractionSuccess {
  ok: true;
  fields: Partial<PropertyListingWritableFields>;
}
interface FieldExtractionFailure {
  ok: false;
  error: string;
}
type FieldExtractionResult = FieldExtractionSuccess | FieldExtractionFailure;

/**
 * Reads only the allowlisted field names off `input`, one at a time by
 * name -- never a blanket spread of unknown keys. This is what makes it
 * structurally impossible for `partnerId` (or any other unlisted key) to
 * flow through, even if a caller's raw object happens to carry one.
 */
function extractWritableFields(
  input: Record<string, unknown>,
  requireCore: boolean,
): FieldExtractionResult {
  const fields: Partial<PropertyListingWritableFields> = {};

  if (requireCore || "title" in input) {
    if (typeof input.title !== "string" || input.title.trim().length === 0) {
      return { ok: false, error: "title must be a non-empty string." };
    }
    fields.title = input.title;
  }

  if (requireCore || "listingType" in input) {
    if (
      typeof input.listingType !== "string" ||
      !LISTING_TYPE_VALUES.includes(input.listingType as PropertyListingType)
    ) {
      return {
        ok: false,
        error: `listingType must be one of: ${LISTING_TYPE_VALUES.join(", ")}.`,
      };
    }
    fields.listingType = input.listingType as PropertyListingType;
  }

  if (input.status !== undefined) {
    if (
      typeof input.status !== "string" ||
      !LISTING_STATUS_VALUES.includes(input.status as PropertyListingStatus)
    ) {
      return {
        ok: false,
        error: `status must be one of: ${LISTING_STATUS_VALUES.join(", ")}.`,
      };
    }
    fields.status = input.status as PropertyListingStatus;
  }

  const description = sanitizeOptionalString(input.description);
  if (description === undefined && input.description !== undefined) {
    return { ok: false, error: "description must be a string or null." };
  }
  if (description !== undefined) fields.description = description;

  if (input.price !== undefined) {
    if (input.price !== null && typeof input.price !== "number") {
      return { ok: false, error: "price must be a number or null." };
    }
    fields.price = input.price;
  }

  const district = sanitizeOptionalString(input.district);
  if (district === undefined && input.district !== undefined) {
    return { ok: false, error: "district must be a string or null." };
  }
  if (district !== undefined) fields.district = district;

  const village = sanitizeOptionalString(input.village);
  if (village === undefined && input.village !== undefined) {
    return { ok: false, error: "village must be a string or null." };
  }
  if (village !== undefined) fields.village = village;

  if (input.region !== undefined) {
    if (input.region !== null && !REGION_VALUES.includes(input.region as PropertyListingRegion)) {
      return {
        ok: false,
        error: `region must be null or one of: ${REGION_VALUES.join(", ")}.`,
      };
    }
    fields.region = input.region as PropertyListingRegion | null;
  }

  return { ok: true, fields };
}

export function validateCreatePropertyListingInput(
  input: CreatePropertyListingInput,
): ValidationResult<CreatePropertyListingInput> {
  if (typeof input.id !== "string" || !isStableCloudId(input.id)) {
    return {
      ok: false,
      error: "Property listing id is missing or not a stable UUID.",
    };
  }

  const extraction = extractWritableFields(
    input as unknown as Record<string, unknown>,
    true,
  );
  if (!extraction.ok) return extraction;

  const { fields } = extraction;

  return {
    ok: true,
    payload: {
      id: input.id,
      title: fields.title!,
      listingType: fields.listingType!,
      ...(fields.status !== undefined ? { status: fields.status } : {}),
      ...(fields.description !== undefined ? { description: fields.description } : {}),
      ...(fields.price !== undefined ? { price: fields.price } : {}),
      ...(fields.district !== undefined ? { district: fields.district } : {}),
      ...(fields.village !== undefined ? { village: fields.village } : {}),
      ...(fields.region !== undefined ? { region: fields.region } : {}),
    },
  };
}

export function validateUpdatePropertyListingInput(
  input: UpdatePropertyListingInput,
): ValidationResult<UpdatePropertyListingInput> {
  const extraction = extractWritableFields(
    input as unknown as Record<string, unknown>,
    false,
  );
  if (!extraction.ok) return extraction;

  return { ok: true, payload: extraction.fields };
}

// ---------------------------------------------------------------------
// Duplicate-create payload comparison (ADR-002 pattern), same shape as
// listing-partners-validation.ts.
// ---------------------------------------------------------------------

const COMPARABLE_PROPERTY_LISTING_FIELDS = [
  "title",
  "listingType",
  "status",
  "description",
  "price",
  "district",
  "village",
  "region",
] as const;

export type ComparablePropertyListingFieldName =
  (typeof COMPARABLE_PROPERTY_LISTING_FIELDS)[number];

export type ComparablePropertyListingPayload = Partial<
  Record<ComparablePropertyListingFieldName, string | null>
>;

function normalizeComparableValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return String(value);
}

export function buildComparablePropertyListingPayload(
  payload: CreatePropertyListingInput,
): ComparablePropertyListingPayload {
  const comparable: ComparablePropertyListingPayload = {};

  for (const field of COMPARABLE_PROPERTY_LISTING_FIELDS) {
    if (field in payload) {
      comparable[field] = normalizeComparableValue(
        (payload as unknown as Record<string, unknown>)[field],
      );
    }
  }

  return comparable;
}

const ROW_COLUMN_BY_FIELD: Record<ComparablePropertyListingFieldName, keyof PropertyListingRow> = {
  title: "title",
  listingType: "listing_type",
  status: "status",
  description: "description",
  price: "price",
  district: "district",
  village: "village",
  region: "region",
};

export function extractComparableFieldsFromPropertyListingRow(
  row: PropertyListingRow,
  fieldsToExtract: readonly ComparablePropertyListingFieldName[],
): ComparablePropertyListingPayload {
  const comparable: ComparablePropertyListingPayload = {};

  for (const field of fieldsToExtract) {
    const column = ROW_COLUMN_BY_FIELD[field];
    comparable[field] = normalizeComparableValue(row[column]);
  }

  return comparable;
}

export function arePropertyListingPayloadsEquivalent(
  requested: ComparablePropertyListingPayload,
  existing: ComparablePropertyListingPayload,
): boolean {
  const fields = Object.keys(requested) as ComparablePropertyListingFieldName[];
  return fields.every((field) => requested[field] === existing[field]);
}
