// Sprint documents cloud write: land_documents metadata + Storage
// payload allowlisting and validation, following the same
// responsibility split as parties-validation.ts / points-validation.ts:
// the only place that decides what a client may send for a document
// create, and the only place that validates its content before it ever
// reaches documents-repository.ts.
//
// Unlike geometry/points, this sprint's Allowed Files do not include
// child-types.ts or types.ts (shared, Foundation/Integration-owned
// files per docs/ai/FILE_OWNERSHIP.md) -- same deviation
// parties-validation.ts already took for the same reason.
// DocumentWritableFields / CreateDocumentInput, the row/domain types
// (CloudDocumentRow / CloudDocument), and the result-shape types
// (DocumentSyncState / DocumentWriteResult, which would normally reuse
// ChildSyncState / ChildWriteResult from child-types.ts) therefore all
// live HERE instead. A future Foundation/Integration sprint can
// relocate them additively if that consolidation is ever wanted -- see
// the sprint report's Findings section.
//
// CREATE-ONLY this sprint (owner brief, 2026-07-28): `documents` HAS
// full CRUD RLS policies live on sabahlot-dev
// (documents_select_own/documents_insert_own/documents_update_own/
// documents_delete_own all exist, confirmed directly against the
// project via the Supabase MCP list_tables/execute_sql tools before
// writing any code) -- unlike land_points, RLS itself does not force
// create-only here. The reason is structural instead: `documents` has
// no `updated_at` column (confirmed the same way), so there is no safe
// value to filter an UPDATE on atomically (ADR-003's pattern). Building
// UPDATE/DELETE without that column would mean either no conflict
// control at all, or a hand-rolled read-then-write race -- both
// unacceptable per ADR-002/ADR-003's precedent. This mirrors ADR-011's
// conclusion for a different underlying reason and should get its own
// ADR from Foundation/Integration (see the sprint report).

import { isStableCloudId } from "./types";
import type { ValidationResult } from "./validation";

// Mirrors the `document_type` Postgres enum exactly, confirmed directly
// against sabahlot-dev via the Supabase MCP list_tables tool
// (2026-07-28) rather than assumed from the sprint brief alone.
export const DOCUMENT_TYPE_VALUES = [
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

export type CloudDocumentType = (typeof DOCUMENT_TYPE_VALUES)[number];

export const DOCUMENTS_STORAGE_BUCKET = "land-documents";

// Mirrors the land-documents Storage bucket's own file_size_limit /
// allowed_mime_types, confirmed live against sabahlot-dev
// (storage.buckets) via the Supabase MCP execute_sql tool (2026-07-28).
// Validated here too so an oversized/wrong-type file fails fast with
// `validation_failed` instead of an opaque Storage error after a
// network round trip.
export const DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

// ---------------------------------------------------------------------
// Row / domain types (would normally live in types.ts -- see the
// file-level comment above for why they're here instead).
// ---------------------------------------------------------------------

// Mirrors the `documents` table exactly, confirmed live against
// sabahlot-dev (2026-07-28) -- documents has NO updated_at column.
export interface CloudDocumentRow {
  id: string;
  land_record_id: string | null;
  uploaded_by: string | null;
  document_type: CloudDocumentType;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  is_sensitive: boolean;
  created_at: string;
}

export interface CloudDocument {
  id: string;
  landRecordId: string | null;
  documentType: CloudDocumentType;
  storageBucket: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  isSensitive: boolean;
  createdAt: string;
}

export function mapCloudDocument(row: CloudDocumentRow): CloudDocument {
  return {
    id: row.id,
    landRecordId: row.land_record_id,
    documentType: row.document_type,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    isSensitive: row.is_sensitive,
    createdAt: row.created_at,
  };
}

export interface DocumentWritableFields {
  documentType: CloudDocumentType;
  originalFilename: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  isSensitive?: boolean;
}

export interface CreateDocumentInput extends DocumentWritableFields {
  // Stable child UUID, assigned client-side the moment a file is added
  // to the pending list (see DocumentsSection.tsx) -- never regenerated
  // on retry (ADR-001), also reused as the Storage object's own path
  // segment so a retried upload of the same file lands on the same
  // object instead of creating a duplicate.
  id: string;
  // Parent land_records.id. Required -- this sprint only uploads
  // documents after the parent has already synced (see
  // documents-ui-sync.ts), unlike points' nullable/unlinked-capture
  // design. There is no "unlinked document" capture flow in this app
  // today.
  landRecordId: string;
  // Never accepted from a caller as `uploadedBy` -- always derived
  // server-side from the session inside documents-write-coordinator.ts
  // (ADR-005). Structurally absent from this type on purpose.
}

// ---------------------------------------------------------------------
// Local result-shape types -- see the file-level comment above for why
// these are defined here instead of adding a "documents_synced" member
// to the shared ChildSyncState union in child-types.ts. Same generic
// shape and field names as ChildSyncState/ChildWriteResult, defined
// locally instead.
// ---------------------------------------------------------------------

export type DocumentSyncState =
  | "local_only"
  | "saving"
  | "documents_synced"
  | "failed"
  | "conflict";

export type DocumentErrorCode =
  | "unauthenticated"
  | "invalid_parent_id"
  | "invalid_child_id"
  | "legacy_child_id_requires_mapping"
  | "validation_failed"
  | "not_found_or_forbidden"
  | "duplicate_conflict"
  | "network_error"
  | "database_error";

export interface DocumentWriteSuccess {
  ok: true;
  state: DocumentSyncState;
  data: CloudDocument;
}

export interface DocumentWriteFailure {
  ok: false;
  state: DocumentSyncState;
  code: DocumentErrorCode;
  message: string;
}

export type DocumentWriteResult = DocumentWriteSuccess | DocumentWriteFailure;

function sanitizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

interface FieldExtractionSuccess {
  ok: true;
  fields: Partial<DocumentWritableFields>;
}
interface FieldExtractionFailure {
  ok: false;
  error: string;
}
type FieldExtractionResult = FieldExtractionSuccess | FieldExtractionFailure;

function extractWritableFields(
  input: Record<string, unknown>,
): FieldExtractionResult {
  const fields: Partial<DocumentWritableFields> = {};

  if (
    typeof input.documentType !== "string" ||
    !(DOCUMENT_TYPE_VALUES as readonly string[]).includes(input.documentType)
  ) {
    return {
      ok: false,
      error: `documentType must be one of: ${DOCUMENT_TYPE_VALUES.join(", ")}.`,
    };
  }
  fields.documentType = input.documentType as CloudDocumentType;

  if (
    typeof input.originalFilename !== "string" ||
    input.originalFilename.trim().length === 0
  ) {
    return { ok: false, error: "originalFilename must be a non-empty string." };
  }
  fields.originalFilename = input.originalFilename;

  const mimeType = sanitizeOptionalString(input.mimeType);
  if (mimeType === undefined && input.mimeType !== undefined) {
    return { ok: false, error: "mimeType must be a string or null." };
  }
  if (mimeType !== undefined) {
    if (
      mimeType !== null &&
      !(DOCUMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)
    ) {
      return {
        ok: false,
        error: `mimeType must be one of: ${DOCUMENT_ALLOWED_MIME_TYPES.join(", ")}, or null.`,
      };
    }
    fields.mimeType = mimeType;
  }

  if ("sizeBytes" in input && input.sizeBytes !== undefined) {
    if (
      input.sizeBytes !== null &&
      (typeof input.sizeBytes !== "number" ||
        !Number.isFinite(input.sizeBytes) ||
        input.sizeBytes < 0)
    ) {
      return { ok: false, error: "sizeBytes must be a non-negative finite number or null." };
    }
    if (
      typeof input.sizeBytes === "number" &&
      input.sizeBytes > DOCUMENT_MAX_SIZE_BYTES
    ) {
      return {
        ok: false,
        error: `sizeBytes exceeds the land-documents bucket limit of ${DOCUMENT_MAX_SIZE_BYTES} bytes.`,
      };
    }
    fields.sizeBytes = input.sizeBytes;
  }

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

  if (typeof input.landRecordId !== "string" || !isStableCloudId(input.landRecordId)) {
    return { ok: false, error: "landRecordId is missing or not a valid UUID." };
  }

  const extraction = extractWritableFields(input as unknown as Record<string, unknown>);
  if (!extraction.ok) return extraction;

  const { fields } = extraction;

  return {
    ok: true,
    payload: {
      id: input.id,
      landRecordId: input.landRecordId,
      documentType: fields.documentType!,
      originalFilename: fields.originalFilename!,
      ...(fields.mimeType !== undefined ? { mimeType: fields.mimeType } : {}),
      ...(fields.sizeBytes !== undefined ? { sizeBytes: fields.sizeBytes } : {}),
      ...(fields.isSensitive !== undefined ? { isSensitive: fields.isSensitive } : {}),
    },
  };
}

// ---------------------------------------------------------------------
// Duplicate-create payload comparison (Sprint 02C-1 Patch 1 pattern,
// applied to documents). Deliberately excludes id, land_record_id,
// uploaded_by, storage_bucket, storage_path, created_at -- storage_path
// idempotency is resolved separately by uploadDocumentFile's
// upsert:false handling (documents-repository.ts) since the Storage
// object and the metadata row are two independent write targets for
// this table, unlike every prior child table which only writes one.
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
): ComparableDocumentPayload {
  const comparable: ComparableDocumentPayload = {};
  for (const field of COMPARABLE_DOCUMENT_FIELDS) {
    if (field in payload) {
      comparable[field] = normalizeComparableValue(
        (payload as unknown as Record<string, unknown>)[field],
      );
    }
  }
  return comparable;
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
  fieldsToExtract: readonly ComparableDocumentFieldName[],
): ComparableDocumentPayload {
  const comparable: ComparableDocumentPayload = {};
  for (const field of fieldsToExtract) {
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

// ---------------------------------------------------------------------
// File allowlisting (Storage side) -- separate from the metadata field
// validation above, since a File's mime/size come from the browser, not
// from a JSON payload. Mirrors the land-documents bucket's own
// constraints (confirmed live, 2026-07-28) so an invalid file fails
// fast client-side.
// ---------------------------------------------------------------------

export function validateDocumentFile(file: {
  type: string;
  size: number;
}): ValidationResult<true> {
  if (!(DOCUMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      error: `File type "${file.type}" is not allowed. Allowed: ${DOCUMENT_ALLOWED_MIME_TYPES.join(", ")}.`,
    };
  }
  if (file.size > DOCUMENT_MAX_SIZE_BYTES) {
    return {
      ok: false,
      error: `File exceeds the ${DOCUMENT_MAX_SIZE_BYTES / (1024 * 1024)}MB limit.`,
    };
  }
  return { ok: true, payload: true };
}

// ---------------------------------------------------------------------
// Storage path helper -- the first path segment MUST be the uploader's
// own auth.uid() (storage.objects RLS: land_documents_insert_own /
// land_documents_select_own both require
// (storage.foldername(name))[1] = auth.uid()), confirmed live via the
// Supabase MCP execute_sql tool (2026-07-28). The filename is sanitized
// to avoid characters that would create unintended nested "folders" via
// storage.foldername's '/' splitting, or otherwise confuse the Storage
// API.
// ---------------------------------------------------------------------

export function buildDocumentStoragePath(
  userId: string,
  documentId: string,
  originalFilename: string,
): string {
  const sanitized = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return `${userId}/${documentId}/${sanitized || "file"}`;
}
