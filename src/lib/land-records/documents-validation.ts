// Sprint documents-cloud-write: public.documents payload allowlisting and
// validation.
//
// Same responsibility split as points-validation.ts: the only place that
// decides what a client may send for a document create, and the only
// place that validates its content before it ever reaches
// documents-repository.ts. CREATE-ONLY -- there is deliberately no
// validateUpdateDocumentInput here, and none should be added without a
// new ADR + a migration adding public.documents.updated_at (see the
// reasoning in child-types.ts's CreateDocumentInput comment).

import { isStableCloudId } from "./types";
import type { CloudDocumentRow } from "./types";
import type { CreateDocumentInput, DocumentWritableFields } from "./child-types";
import type { ValidationResult } from "./validation";

// Mirrors supabase/migrations/202607110002_create_land_domain_enums.sql's
// `document_type` enum exactly, and CloudDocumentType in types.ts.
const DOCUMENT_TYPE_VALUES = [
  "title_deed",
  "official_receipt",
  "application_letter",
  "plan_or_sketch",
  "site_photo",
  "pdf_plan_export",
  "kml_export",
  "dxf_export",
  "other",
] as const;

// Mirrors the `land-documents` Supabase Storage bucket's own
// allowed_mime_types / file_size_limit, confirmed directly against
// sabahlot-dev via a read-only query on 2026-07-30 (see
// docs/ai/PROJECT_STATE.md). This is defense-in-depth, client-side-first
// validation only -- Storage independently enforces the same limits
// server-side, and if the two ever drift, Storage's own enforcement is
// what actually protects the bucket, not this list.
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validates a document's derived file metadata (size/mime, read directly
 * off the actual Blob by the coordinator -- see child-types.ts's
 * CreateDocumentInput comment for why these are never caller-writable
 * fields). Kept separate from validateCreateDocumentInput because these
 * two values don't come from the same place as the rest of the input.
 */
export function validateDocumentFileMetadata(
  sizeBytes: number,
  mimeType: string,
): ValidationResult<{ sizeBytes: number; mimeType: string | null }> {
  if (!isFiniteNumber(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: "The file appears to be empty or unreadable." };
  }
  if (sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
    return {
      ok: false,
      error: `File is ${sizeBytes} bytes, exceeding the ${MAX_DOCUMENT_SIZE_BYTES}-byte limit.`,
    };
  }

  const normalizedMimeType = mimeType.trim() === "" ? null : mimeType.trim();
  if (
    normalizedMimeType !== null &&
    !(ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(normalizedMimeType)
  ) {
    return {
      ok: false,
      error: `mimeType "${normalizedMimeType}" is not one of the allowed types: ${ALLOWED_DOCUMENT_MIME_TYPES.join(", ")}.`,
    };
  }

  return { ok: true, payload: { sizeBytes, mimeType: normalizedMimeType } };
}

interface FieldExtractionSuccess {
  ok: true;
  fields: DocumentWritableFields;
}
interface FieldExtractionFailure {
  ok: false;
  error: string;
}
type FieldExtractionResult = FieldExtractionSuccess | FieldExtractionFailure;

function extractWritableFields(input: Record<string, unknown>): FieldExtractionResult {
  if (
    typeof input.documentType !== "string" ||
    !(DOCUMENT_TYPE_VALUES as readonly string[]).includes(input.documentType)
  ) {
    return {
      ok: false,
      error: `documentType must be one of: ${DOCUMENT_TYPE_VALUES.join(", ")}.`,
    };
  }

  if (typeof input.originalFilename !== "string" || input.originalFilename.trim() === "") {
    return { ok: false, error: "originalFilename must be a non-empty string." };
  }

  const fields: DocumentWritableFields = {
    documentType: input.documentType as DocumentWritableFields["documentType"],
    originalFilename: input.originalFilename.trim(),
  };

  if ("isSensitive" in input && input.isSensitive !== undefined) {
    if (typeof input.isSensitive !== "boolean") {
      return { ok: false, error: "isSensitive must be a boolean." };
    }
    fields.isSensitive = input.isSensitive;
  }

  return { ok: true, fields };
}

export function validateCreateDocumentInput(
  input: CreateDocumentInput,
): ValidationResult<CreateDocumentInput> {
  if (typeof input.id !== "string" || !isStableCloudId(input.id)) {
    return {
      ok: false,
      error: "Document id is missing or not a stable UUID (legacy_child_id_requires_mapping).",
    };
  }

  if (
    input.landRecordId !== undefined &&
    input.landRecordId !== null &&
    !isStableCloudId(input.landRecordId)
  ) {
    return { ok: false, error: "landRecordId must be a valid UUID or null (unlinked document)." };
  }

  const extraction = extractWritableFields(input as unknown as Record<string, unknown>);
  if (!extraction.ok) return extraction;

  const { fields } = extraction;

  return {
    ok: true,
    payload: {
      id: input.id,
      landRecordId: input.landRecordId ?? null,
      documentType: fields.documentType,
      originalFilename: fields.originalFilename,
      ...(fields.isSensitive !== undefined ? { isSensitive: fields.isSensitive } : {}),
    },
  };
}

// ---------------------------------------------------------------------
// Duplicate-create payload comparison (ADR-002 pattern, applied to
// documents). Deliberately excludes id, landRecordId, uploadedBy,
// storageBucket/storagePath (server/coordinator-derived, never caller
// content) and createdAt. sizeBytes/mimeType ARE included even though
// they aren't part of CreateDocumentInput -- they are derived from the
// same Blob on every call (see documents-write-coordinator.ts), so
// comparing them still correctly detects "this retry is uploading a
// different file under the same id" as a genuine conflict.
// ---------------------------------------------------------------------

const COMPARABLE_DOCUMENT_FIELDS = [
  "documentType",
  "originalFilename",
  "mimeType",
  "sizeBytes",
  "isSensitive",
] as const;

export type ComparableDocumentFieldName = (typeof COMPARABLE_DOCUMENT_FIELDS)[number];

export type ComparableDocumentPayload = Partial<
  Record<ComparableDocumentFieldName, string | number | boolean | null>
>;

function normalizeComparableValue(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

export function buildComparableDocumentPayload(
  payload: CreateDocumentInput,
  derivedFile: { sizeBytes: number; mimeType: string | null },
): ComparableDocumentPayload {
  return {
    documentType: normalizeComparableValue(payload.documentType),
    originalFilename: normalizeComparableValue(payload.originalFilename),
    mimeType: normalizeComparableValue(derivedFile.mimeType),
    sizeBytes: normalizeComparableValue(derivedFile.sizeBytes),
    isSensitive: normalizeComparableValue(payload.isSensitive ?? true),
  };
}

const ROW_COLUMN_BY_FIELD: Record<ComparableDocumentFieldName, keyof CloudDocumentRow> = {
  documentType: "document_type",
  originalFilename: "original_filename",
  mimeType: "mime_type",
  sizeBytes: "size_bytes",
  isSensitive: "is_sensitive",
};

export function extractComparableFieldsFromDocumentRow(
  row: CloudDocumentRow,
): ComparableDocumentPayload {
  const comparable: ComparableDocumentPayload = {};

  for (const field of COMPARABLE_DOCUMENT_FIELDS) {
    const column = ROW_COLUMN_BY_FIELD[field];
    comparable[field] = normalizeComparableValue(row[column]);
  }

  return comparable;
}

export function areDocumentPayloadsEquivalent(
  requested: ComparableDocumentPayload,
  existing: ComparableDocumentPayload,
): boolean {
  const fields = Object.keys(requested) as ComparableDocumentFieldName[];
  return fields.every((field) => requested[field] === existing[field]);
}
