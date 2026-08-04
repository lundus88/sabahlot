// Sprint listing-partner-backend: listing_partners payload allowlisting
// and validation. Mirrors
// supabase/migrations/202608040001_create_listing_partner.sql's CHECK
// constraints exactly (non-empty displayName/phone/email) -- this is a
// client-side pre-check, not the actual authorization/validation
// boundary (that's RLS + the DB's own CHECK constraints).

import type {
  CreateListingPartnerInput,
  ListingPartnerRow,
  ListingPartnerWritableFields,
  UpdateListingPartnerProfileInput,
  ValidationResult,
} from "./types";

function sanitizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

interface FieldExtractionSuccess {
  ok: true;
  fields: Partial<ListingPartnerWritableFields>;
}
interface FieldExtractionFailure {
  ok: false;
  error: string;
}
type FieldExtractionResult = FieldExtractionSuccess | FieldExtractionFailure;

/**
 * Reads only the allowlisted field names off `input`, one at a time by
 * name -- never a blanket spread of unknown keys. This is what makes it
 * structurally impossible for status/approvedBy/approvedAt (or any other
 * unlisted key) to flow through, even if a caller's raw object happens to
 * carry one.
 */
function extractWritableFields(
  input: Record<string, unknown>,
  requireCore: boolean,
): FieldExtractionResult {
  const fields: Partial<ListingPartnerWritableFields> = {};

  if (requireCore || "displayName" in input) {
    if (typeof input.displayName !== "string" || input.displayName.trim().length === 0) {
      return { ok: false, error: "displayName must be a non-empty string." };
    }
    fields.displayName = input.displayName;
  }

  if (requireCore || "phone" in input) {
    if (typeof input.phone !== "string" || input.phone.trim().length === 0) {
      return { ok: false, error: "phone must be a non-empty string." };
    }
    fields.phone = input.phone;
  }

  if (requireCore || "email" in input) {
    if (typeof input.email !== "string" || input.email.trim().length === 0) {
      return { ok: false, error: "email must be a non-empty string." };
    }
    fields.email = input.email;
  }

  const companyName = sanitizeOptionalString(input.companyName);
  if (companyName === undefined && input.companyName !== undefined) {
    return { ok: false, error: "companyName must be a string or null." };
  }
  if (companyName !== undefined) fields.companyName = companyName;

  const renNumber = sanitizeOptionalString(input.renNumber);
  if (renNumber === undefined && input.renNumber !== undefined) {
    return { ok: false, error: "renNumber must be a string or null." };
  }
  if (renNumber !== undefined) fields.renNumber = renNumber;

  const bio = sanitizeOptionalString(input.bio);
  if (bio === undefined && input.bio !== undefined) {
    return { ok: false, error: "bio must be a string or null." };
  }
  if (bio !== undefined) fields.bio = bio;

  if (input.publicContactConsent !== undefined) {
    if (typeof input.publicContactConsent !== "boolean") {
      return { ok: false, error: "publicContactConsent must be a boolean." };
    }
    fields.publicContactConsent = input.publicContactConsent;
  }

  return { ok: true, fields };
}

export function validateCreateListingPartnerInput(
  input: CreateListingPartnerInput,
): ValidationResult<CreateListingPartnerInput> {
  const extraction = extractWritableFields(
    input as unknown as Record<string, unknown>,
    true,
  );
  if (!extraction.ok) return extraction;

  const { fields } = extraction;

  return {
    ok: true,
    payload: {
      displayName: fields.displayName!,
      phone: fields.phone!,
      email: fields.email!,
      ...(fields.companyName !== undefined ? { companyName: fields.companyName } : {}),
      ...(fields.renNumber !== undefined ? { renNumber: fields.renNumber } : {}),
      ...(fields.bio !== undefined ? { bio: fields.bio } : {}),
      ...(fields.publicContactConsent !== undefined
        ? { publicContactConsent: fields.publicContactConsent }
        : {}),
    },
  };
}

export function validateUpdateListingPartnerProfileInput(
  input: UpdateListingPartnerProfileInput,
): ValidationResult<UpdateListingPartnerProfileInput> {
  const extraction = extractWritableFields(
    input as unknown as Record<string, unknown>,
    false,
  );
  if (!extraction.ok) return extraction;

  return { ok: true, payload: extraction.fields };
}

// ---------------------------------------------------------------------
// Duplicate-create payload comparison (ADR-002 pattern). Since
// listing_partners.id is always the caller's own auth.uid() (never
// client-generated), a 23505 here realistically only fires on a genuine
// double-submit -- but the same-content-vs-different-content check must
// still be implemented, not skipped as "can't happen."
// ---------------------------------------------------------------------

const COMPARABLE_LISTING_PARTNER_FIELDS = [
  "companyName",
  "displayName",
  "phone",
  "email",
  "renNumber",
  "bio",
  "publicContactConsent",
] as const;

export type ComparableListingPartnerFieldName =
  (typeof COMPARABLE_LISTING_PARTNER_FIELDS)[number];

export type ComparableListingPartnerPayload = Partial<
  Record<ComparableListingPartnerFieldName, string | null>
>;

function normalizeComparableValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return String(value);
}

export function buildComparableListingPartnerPayload(
  payload: CreateListingPartnerInput,
): ComparableListingPartnerPayload {
  const comparable: ComparableListingPartnerPayload = {};

  for (const field of COMPARABLE_LISTING_PARTNER_FIELDS) {
    if (field in payload) {
      comparable[field] = normalizeComparableValue(
        (payload as unknown as Record<string, unknown>)[field],
      );
    }
  }

  return comparable;
}

const ROW_COLUMN_BY_FIELD: Record<ComparableListingPartnerFieldName, keyof ListingPartnerRow> = {
  companyName: "company_name",
  displayName: "display_name",
  phone: "phone",
  email: "email",
  renNumber: "ren_number",
  bio: "bio",
  publicContactConsent: "public_contact_consent",
};

export function extractComparableFieldsFromListingPartnerRow(
  row: ListingPartnerRow,
  fieldsToExtract: readonly ComparableListingPartnerFieldName[],
): ComparableListingPartnerPayload {
  const comparable: ComparableListingPartnerPayload = {};

  for (const field of fieldsToExtract) {
    const column = ROW_COLUMN_BY_FIELD[field];
    comparable[field] = normalizeComparableValue(row[column]);
  }

  return comparable;
}

export function areListingPartnerPayloadsEquivalent(
  requested: ComparableListingPartnerPayload,
  existing: ComparableListingPartnerPayload,
): boolean {
  const fields = Object.keys(requested) as ComparableListingPartnerFieldName[];
  return fields.every((field) => requested[field] === existing[field]);
}
