// Sprint documents cloud write: authenticated cloud create coordinator
// for `documents` (table) + `land-documents` (Storage bucket). Both
// already exist on sabahlot-dev -- no migration or bucket creation in
// this sprint. documents ONLY -- no land_record, geometry, point, or
// party write happens here.
//
// CREATE-ONLY this sprint (see documents-validation.ts's file header
// for the full reasoning: documents has no updated_at column, so there
// is no safe optimistic-concurrency UPDATE token, even though RLS
// itself permits UPDATE/DELETE here, unlike land_points).
//
// Two independent writes happen per successful call: a Storage object
// (uploadDocumentFile) and a documents metadata row (createDocumentRow).
// Order matters: the file is uploaded FIRST, then the metadata row is
// inserted referencing it. If the row insert fails after a successful
// upload, the orphaned Storage object is left in place (not rolled
// back -- there is no multi-resource transaction here, same accepted
// staged-write posture as ADR-008) but is harmless: RLS still scopes it
// to the uploader, and a retry with the same id/path is idempotent (see
// uploadDocumentFile's upsert:false handling) rather than creating a
// second orphan.
//
// Not wired into any UI from within this file -- see
// documents-ui-sync.ts for the UI-facing orchestration.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createDocumentRow,
  getDocumentById,
  mapDocumentFieldsToDbPayload,
  uploadDocumentFile,
} from "./documents-repository";
import { isCloudWriteEnabled } from "./feature-gate";
import { isStableCloudId } from "./types";
import { upsertCachedDocument } from "./documents-cache";
import {
  areDocumentPayloadsEquivalent,
  buildComparableDocumentPayload,
  buildDocumentStoragePath,
  extractComparableFieldsFromDocumentRow,
  mapCloudDocument,
  validateCreateDocumentInput,
  validateDocumentFile,
} from "./documents-validation";
import type {
  ComparableDocumentFieldName,
  CreateDocumentInput,
  DocumentErrorCode,
  DocumentSyncState,
  DocumentWriteResult,
} from "./documents-validation";

function failure(
  state: DocumentSyncState,
  code: DocumentErrorCode,
  message: string,
): DocumentWriteResult {
  return { ok: false, state, code, message };
}

async function getAuthenticatedUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/**
 * Uploads `file` to the land-documents bucket and creates one
 * `documents` metadata row under `input.landRecordId` for the
 * authenticated caller. RLS confirms `landRecordId` is owned by the
 * caller -- this function never accepts an owner/uploader id directly
 * and cannot bypass that check (ADR-005: uploaded_by is always the
 * session user).
 *
 * Only ever returns `documents_synced` on success -- never a broader
 * "record"/"core_record_synced" state, which would require the parent,
 * geometry, points, and parties to also be confirmed synced.
 */
export async function createCloudDocument(
  supabase: SupabaseClient,
  input: CreateDocumentInput,
  file: Blob,
): Promise<DocumentWriteResult> {
  if (!isCloudWriteEnabled()) {
    return failure("local_only", "database_error", "Cloud write is disabled in this environment.");
  }

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) {
    return failure("failed", "unauthenticated", "No authenticated session.");
  }

  if (!isStableCloudId(input.landRecordId)) {
    return failure("failed", "invalid_parent_id", "landRecordId is not a valid UUID.");
  }

  if (!isStableCloudId(input.id)) {
    return failure(
      "failed",
      "legacy_child_id_requires_mapping",
      "Document id is not a stable UUID; legacy local document ids are not uploaded automatically.",
    );
  }

  const validation = validateCreateDocumentInput(input);
  if (!validation.ok) {
    return failure("failed", "validation_failed", validation.error);
  }

  const fileValidation = validateDocumentFile({ type: file.type, size: file.size });
  if (!fileValidation.ok) {
    return failure("failed", "validation_failed", fileValidation.error);
  }

  const storagePath = buildDocumentStoragePath(
    userId,
    input.id,
    validation.payload.originalFilename,
  );

  const upload = await uploadDocumentFile(
    supabase,
    storagePath,
    file,
    validation.payload.mimeType ?? file.type,
  );

  if (!upload.ok) {
    return failure(
      "failed",
      "database_error",
      "Document file upload failed; the local working copy has not been changed.",
    );
  }

  const dbPayload = mapDocumentFieldsToDbPayload(validation.payload);
  const result = await createDocumentRow(
    supabase,
    input.id,
    input.landRecordId,
    userId,
    storagePath,
    dbPayload,
  );

  if (!result.ok) {
    if (result.error.code === "23505") {
      return resolveDuplicateDocumentCreate(supabase, userId, validation.payload);
    }

    return failure(
      "failed",
      "database_error",
      "Cloud document metadata create failed; the local working copy has not been changed.",
    );
  }

  const document = mapCloudDocument(result.data);
  const syncedAt = new Date().toISOString();
  upsertCachedDocument(userId, document, syncedAt);

  return { ok: true, state: "documents_synced", data: document };
}

/**
 * A 23505 on the metadata-row INSERT means a row with this id already
 * exists. Safe for a genuine retry PROVIDED the existing row's
 * allowlisted content matches what this attempt asked to create -- same
 * three-outcome pattern as every other child table: unreadable/not-owned
 * -> not_found_or_forbidden; owned but different content ->
 * duplicate_conflict (row/cache untouched); owned and matching ->
 * verified success. (The Storage object side of the retry was already
 * resolved by uploadDocumentFile's upsert:false handling before this
 * function runs.)
 */
async function resolveDuplicateDocumentCreate(
  supabase: SupabaseClient,
  userId: string,
  requestedPayload: CreateDocumentInput,
): Promise<DocumentWriteResult> {
  const existing = await getDocumentById(supabase, requestedPayload.id);

  if (!existing.ok || !existing.data) {
    return failure(
      "failed",
      "not_found_or_forbidden",
      "Duplicate document could not be confirmed as accessible to the current user.",
    );
  }

  if (existing.data.land_record_id !== requestedPayload.landRecordId) {
    return failure(
      "failed",
      "not_found_or_forbidden",
      "Duplicate document could not be confirmed as accessible to the current user.",
    );
  }

  const requestedComparable = buildComparableDocumentPayload(requestedPayload);
  const existingComparable = extractComparableFieldsFromDocumentRow(
    existing.data,
    Object.keys(requestedComparable) as ComparableDocumentFieldName[],
  );

  if (!areDocumentPayloadsEquivalent(requestedComparable, existingComparable)) {
    return failure(
      "conflict",
      "duplicate_conflict",
      "A document with this id already exists with different content; this retry was not treated as a successful save.",
    );
  }

  const document = mapCloudDocument(existing.data);
  const syncedAt = new Date().toISOString();
  upsertCachedDocument(userId, document, syncedAt);

  return { ok: true, state: "documents_synced", data: document };
}
