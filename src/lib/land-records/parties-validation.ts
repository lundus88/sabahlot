// Sprint parties cloud write: land_parties payload allowlisting and
// validation. Same responsibility split as geometry-validation.ts /
// points-validation.ts: the only place that decides what a client may
// send for a party create/update, and the only place that validates
// its content before it ever reaches parties-repository.ts.
//
// Unlike geometry/points, this sprint's Allowed Files do not include
// child-types.ts (a shared file owned by the Foundation/Integration
// Agent per docs/ai/FILE_OWNERSHIP.md). PartyWritableFields /
// CreatePartyInput / UpdatePartyInput therefore live HERE instead of
// child-types.ts -- a deliberate deviation from the geometry/points
// convention, not an oversight. They reuse the same shape convention
// (writable fields interface + Create/Update variants) so a future
// Foundation/Integration sprint can relocate them into child-types.ts
// additively without any behavioral change, if that consolidation is
// ever wanted.
//
// ADR-014 (id_number is never cloud-writable): PartyWritableFields has
// no id_number field at all, so there is no key to strip -- id_number
// structurally cannot flow through extractWritableFields below, since
// every field is read one at a time by name, never spread from the raw
// input. See parties-repository.ts for the matching guarantee on the
// outbound DB payload side, and parties-write.qa.ts for the explicit
// regression test asserting this end-to-end.

import { isStableCloudId } from "./types";
import type { CloudLandPartyRow, CloudPartyRole } from "./types";
// Reuse the same generic result shape as validation.ts/geometry-validation.ts/
// points-validation.ts rather than redefining an identically-shaped type
// under a different name -- avoids an export ambiguity if this module is
// ever barrel-exported, and keeps one canonical "validation result" shape
// across parent and child writes.
import type { ValidationResult } from "./validation";

// Mirrors supabase/migrations/202607110002_create_land_domain_enums.sql's
// `party_role` enum exactly, and CloudPartyRole in types.ts.
const PARTY_ROLE_VALUES = [
  "owner",
  "original_applicant",
  "main_heir",
  "surveyor",
  "witness",
  "village_head",
] as const;

function sanitizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

// ---------------------------------------------------------------------
// Write-direction types (would normally live in child-types.ts -- see
// the file-level comment above for why they're here instead).
// ---------------------------------------------------------------------

export interface PartyWritableFields {
  partyRole: CloudPartyRole;
  fullName: string;
  relationshipToApplicant?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
}

export interface CreatePartyInput extends PartyWritableFields {
  // Stable child UUID. No local client object currently carries a
  // party id at all (parties today are flat string fields, e.g.
  // LocalPdfIdentityPerson {name, idNo}) -- per docs/ai/DATABASE_CONTRACT.md,
  // a new UUID must be generated on first cloud sync and persisted back
  // locally. Generating that UUID is the caller's responsibility (e.g. a
  // future UI-wiring sprint); this validation layer only requires that
  // whatever id is supplied is already a stable UUID, exactly like
  // geometry/points.
  id: string;
  // Parent land_records.id. Required on create; never accepted again on
  // update (a party's parent cannot change) -- structurally absent from
  // UpdatePartyInput below.
  landRecordId: string;
}

export type UpdatePartyInput = Partial<PartyWritableFields>;

interface FieldExtractionSuccess {
  ok: true;
  fields: Partial<PartyWritableFields>;
}
interface FieldExtractionFailure {
  ok: false;
  error: string;
}
type FieldExtractionResult = FieldExtractionSuccess | FieldExtractionFailure;

/**
 * Reads only the allowlisted field names off `input`, one at a time by
 * name -- never a blanket spread of unknown keys. This is what makes it
 * structurally impossible for `id_number` (or any other unlisted key)
 * to flow through, even if a caller's raw object happens to carry one.
 */
function extractWritableFields(
  input: Record<string, unknown>,
  requireCore: boolean,
): FieldExtractionResult {
  const fields: Partial<PartyWritableFields> = {};

  if (requireCore || "partyRole" in input) {
    if (
      typeof input.partyRole !== "string" ||
      !(PARTY_ROLE_VALUES as readonly string[]).includes(input.partyRole)
    ) {
      return {
        ok: false,
        error: `partyRole must be one of: ${PARTY_ROLE_VALUES.join(", ")}.`,
      };
    }
    fields.partyRole = input.partyRole as CloudPartyRole;
  }

  if (requireCore || "fullName" in input) {
    if (typeof input.fullName !== "string" || input.fullName.trim().length === 0) {
      return {
        ok: false,
        error: "fullName must be a non-empty string.",
      };
    }
    fields.fullName = input.fullName;
  }

  const relationshipToApplicant = sanitizeOptionalString(input.relationshipToApplicant);
  if (relationshipToApplicant === undefined && input.relationshipToApplicant !== undefined) {
    return { ok: false, error: "relationshipToApplicant must be a string or null." };
  }
  if (relationshipToApplicant !== undefined) fields.relationshipToApplicant = relationshipToApplicant;

  const contactPhone = sanitizeOptionalString(input.contactPhone);
  if (contactPhone === undefined && input.contactPhone !== undefined) {
    return { ok: false, error: "contactPhone must be a string or null." };
  }
  if (contactPhone !== undefined) fields.contactPhone = contactPhone;

  const contactEmail = sanitizeOptionalString(input.contactEmail);
  if (contactEmail === undefined && input.contactEmail !== undefined) {
    return { ok: false, error: "contactEmail must be a string or null." };
  }
  if (contactEmail !== undefined) fields.contactEmail = contactEmail;

  const notes = sanitizeOptionalString(input.notes);
  if (notes === undefined && input.notes !== undefined) {
    return { ok: false, error: "notes must be a string or null." };
  }
  if (notes !== undefined) fields.notes = notes;

  return { ok: true, fields };
}

export function validateCreatePartyInput(
  input: CreatePartyInput,
): ValidationResult<CreatePartyInput> {
  if (typeof input.id !== "string" || !isStableCloudId(input.id)) {
    return {
      ok: false,
      error: "Party id is missing or not a stable UUID (legacy_child_id_requires_mapping).",
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

  return {
    ok: true,
    payload: {
      id: input.id,
      landRecordId: input.landRecordId,
      partyRole: fields.partyRole!,
      fullName: fields.fullName!,
      ...(fields.relationshipToApplicant !== undefined
        ? { relationshipToApplicant: fields.relationshipToApplicant }
        : {}),
      ...(fields.contactPhone !== undefined ? { contactPhone: fields.contactPhone } : {}),
      ...(fields.contactEmail !== undefined ? { contactEmail: fields.contactEmail } : {}),
      ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
    },
  };
}

export function validateUpdatePartyInput(
  input: UpdatePartyInput,
): ValidationResult<UpdatePartyInput> {
  const extraction = extractWritableFields(
    input as unknown as Record<string, unknown>,
    false,
  );
  if (!extraction.ok) return extraction;

  return { ok: true, payload: extraction.fields };
}

// ---------------------------------------------------------------------
// Duplicate-create payload comparison (Sprint 02C-1 Patch 1 pattern,
// applied to parties). Deliberately excludes id, land_record_id,
// created_at, updated_at, and id_number (never caller-controlled content
// for this cloud-write path at all) -- only fields the caller actually
// controls on create.
// ---------------------------------------------------------------------

const COMPARABLE_PARTY_FIELDS = [
  "partyRole",
  "fullName",
  "relationshipToApplicant",
  "contactPhone",
  "contactEmail",
  "notes",
] as const;

export type ComparablePartyFieldName = (typeof COMPARABLE_PARTY_FIELDS)[number];

export type ComparablePartyPayload = Partial<Record<ComparablePartyFieldName, string | null>>;

function normalizeComparableValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return String(value);
}

export function buildComparablePartyPayload(payload: CreatePartyInput): ComparablePartyPayload {
  const comparable: ComparablePartyPayload = {};

  for (const field of COMPARABLE_PARTY_FIELDS) {
    if (field in payload) {
      comparable[field] = normalizeComparableValue(
        (payload as unknown as Record<string, unknown>)[field],
      );
    }
  }

  return comparable;
}

const ROW_COLUMN_BY_FIELD: Record<ComparablePartyFieldName, keyof CloudLandPartyRow> = {
  partyRole: "party_role",
  fullName: "full_name",
  relationshipToApplicant: "relationship_to_applicant",
  contactPhone: "contact_phone",
  contactEmail: "contact_email",
  notes: "notes",
};

export function extractComparableFieldsFromPartyRow(
  row: CloudLandPartyRow,
  fieldsToExtract: readonly ComparablePartyFieldName[],
): ComparablePartyPayload {
  const comparable: ComparablePartyPayload = {};

  for (const field of fieldsToExtract) {
    const column = ROW_COLUMN_BY_FIELD[field];
    comparable[field] = normalizeComparableValue(row[column]);
  }

  return comparable;
}

export function arePartyPayloadsEquivalent(
  requested: ComparablePartyPayload,
  existing: ComparablePartyPayload,
): boolean {
  const fields = Object.keys(requested) as ComparablePartyFieldName[];
  return fields.every((field) => requested[field] === existing[field]);
}
