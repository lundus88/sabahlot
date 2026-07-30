// Sprint documents-cloud-write: authenticated cloud create coordinator
// for public.documents + the land-documents Storage bucket. documents
// (metadata) and land-documents (Storage) ONLY -- no land record,
// geometry, point, or party write happens here.
//
// CREATE-ONLY: no updateCloudDocument, no deleteCloudDocument exist, and
// none should be added without a new ADR (see child-types.ts's
// CreateDocumentInput comment). Not wired into src/app/page.tsx or any
// UI -- same deferred-wiring posture every other child table's backend
// sprint left for its own later UI-wiring sprint.
//
// TWO-PHASE WRITE: unlike every other child table, one call to
// createCloudDocument is actually two independent remote operations --
// a Storage upload, then a metadata row insert -- neither atomic with
// the other. This module's central job is making a retry after a
// partial failure behave safely:
//
//   1. Upload succeeds, insert succeeds  -> ordinary first-time success.
//   2. Upload fails (any reason)         -> stop immediately. No insert
//      is ever attempted for a file that didn't actually upload.
//   3. Upload reports "already exists"   -> a previous attempt (this
//      exact id, hence this exact path) already got the file to
//      Storage. Look up the metadata row for this id:
//        a. Row exists, content matches   -> verified idempotent
//           success (no re-upload, no re-insert).
//        b. Row exists, content differs   -> duplicate_conflict (row
//           and the Storage object are both left untouched).
//        c. Row does not exist yet        -> the previous attempt's
//           upload succeeded but its insert never landed (dropped
//           response, crash, etc.). Resume by inserting the metadata
//           row now -- this is the one path where "upload already
//           happened" and "insert has not happened" legitimately
//           coexist, and it is exactly the case this design exists to
//           handle safely.
//   4. Insert reports 23505 despite a fresh, non-"already exists"
//      upload (a genuine race between two concurrent requests) ->
//      resolved via the same existing-row comparison as (3a)/(3b).
//
// mimeType/sizeBytes are derived from the actual `file: Blob` on every
// call, never trusted from caller-supplied fields (see
// child-types.ts).

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createDocumentRow,
  getDocumentById,
  mapDocumentFieldsToDbPayload,
  uploadDocumentFile,
} from "./documents-repository";
import { isCloudWriteEnabled } from "./feature-gate";
import { mapCloudDocument } from "./mapper";
import { isStableCloudId } from "./types";
import type { CloudDocument } from "./types";
import type { ChildSyncState, ChildWriteResult, CreateDocumentInput } from "./child-types";
import {
  areDocumentPayloadsEquivalent,
  buildComparableDocumentPayload,
  extractComparableFieldsFromDocumentRow,
  validateCreateDocumentInput,
  validateDocumentFileMetadata,
  type ComparableDocumentPayload,
} from "./documents-validation";

function failure(
  state: ChildSyncState,
  code: Extract<ChildWriteResult<CloudDocument>, { ok: false }>["code"],
  message: string,
): ChildWriteResult<CloudDocument> {
  return { ok: false, state, code, message };
}

async function getAuthenticatedUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/**
 * Creates one documents row plus its backing Storage object for the
 * authenticated caller. `input.landRecordId` may be null (unlinked
 * document) -- RLS then requires `uploaded_by` (derived here from the
 * session, never from the caller, per ADR-005) to match the current user
 * instead of checking a parent's owner_id.
 *
 * `file` is the actual bytes to upload; its `.size`/`.type` are the only
 * source of truth for sizeBytes/mimeType (never a caller-supplied field
 * on `input`).
 *
 * Only ever returns `documents_synced` on success -- never
 * `core_record_synced`/`record_synced`/`geometry_synced`/`points_synced`/
 * `parties_synced`, which require the parent/geometry/points/parties to
 * also be confirmed synced, and never `full_record_synced` (ADR-010).
 */
export async function createCloudDocument(
  supabase: SupabaseClient,
  input: CreateDocumentInput,
  file: Blob,
): Promise<ChildWriteResult<CloudDocument>> {
  if (!isCloudWriteEnabled()) {
    return failure("local_only", "database_error", "Cloud write is disabled in this environment.");
  }

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) {
    return failure("failed", "unauthenticated", "No authenticated session.");
  }

  if (!isStableCloudId(input.id)) {
    return failure(
      "failed",
      "legacy_child_id_requires_mapping",
      "Document id is not a stable UUID; legacy local document ids are not uploaded automatically.",
    );
  }

  if (
    input.landRecordId !== undefined &&
    input.landRecordId !== null &&
    !isStableCloudId(input.landRecordId)
  ) {
    return failure("failed", "invalid_parent_id", "landRecordId is not a valid UUID.");
  }

  const validation = validateCreateDocumentInput(input);
  if (!validation.ok) {
    return failure("failed", "validation_failed", validation.error);
  }

  const fileMetadata = validateDocumentFileMetadata(file.size, file.type);
  if (!fileMetadata.ok) {
    return failure("failed", "validation_failed", fileMetadata.error);
  }

  const landRecordId = validation.payload.landRecordId ?? null;
  const path = `${userId}/${input.id}`;
  const dbPayload = mapDocumentFieldsToDbPayload(validation.payload, fileMetadata.payload);
  const requestedComparable = buildComparableDocumentPayload(
    validation.payload,
    fileMetadata.payload,
  );

  const uploadResult = await uploadDocumentFile(
    supabase,
    path,
    file,
    fileMetadata.payload.mimeType,
  );

  if (!uploadResult.ok) {
    if (uploadResult.alreadyExists) {
      return resolveExistingDocument(
        supabase,
        input.id,
        landRecordId,
        userId,
        dbPayload,
        requestedComparable,
      );
    }

    return failure(
      "failed",
      "database_error",
      "Storage upload failed; no document metadata was written.",
    );
  }

  const result = await createDocumentRow(supabase, input.id, landRecordId, userId, dbPayload);

  if (!result.ok) {
    if (result.error.code === "23505") {
      return resolveExistingDocument(
        supabase,
        input.id,
        landRecordId,
        userId,
        dbPayload,
        requestedComparable,
      );
    }

    return failure(
      "failed",
      "database_error",
      "Document metadata insert failed; the uploaded file is orphaned and will be resolved by a future retry with the same id.",
    );
  }

  return { ok: true, state: "documents_synced", data: mapCloudDocument(result.data) };
}

/**
 * Shared resolution for both entry points that can discover an existing
 * row for this id: a Storage "already exists" response, and a 23505 on
 * insert. Outcomes, same shape as every other child table's duplicate-
 * create resolution:
 *   - Not found/not accessible -> not_found_or_forbidden (never reveals
 *     whether the id belongs to another user).
 *   - Found, different parent  -> not_found_or_forbidden (same
 *     non-disclosure reasoning, ADR-004).
 *   - Found, different content -> duplicate_conflict, row untouched.
 *   - Found, matching content  -> verified documents_synced.
 *   - Not found at all (Storage object exists, no row yet -- case 3c in
 *     the module comment: a previous attempt's upload succeeded but its
 *     insert never landed) -> resumes the two-phase write by inserting
 *     the metadata row now, using the SAME already-validated dbPayload
 *     the original attempt would have inserted. If that resuming insert
 *     itself somehow races into another 23505, this returns
 *     database_error rather than recursing again -- two conflicting
 *     resolution attempts in a row means something is genuinely wrong,
 *     not a simple dropped response.
 */
async function resolveExistingDocument(
  supabase: SupabaseClient,
  id: string,
  requestedLandRecordId: string | null,
  uploadedBy: string,
  dbPayload: Record<string, unknown>,
  requestedComparable: ComparableDocumentPayload,
): Promise<ChildWriteResult<CloudDocument>> {
  const existing = await getDocumentById(supabase, id);

  if (!existing.ok) {
    return failure(
      "failed",
      "not_found_or_forbidden",
      "Could not confirm whether a document with this id already exists.",
    );
  }

  if (!existing.data) {
    const resumed = await createDocumentRow(supabase, id, requestedLandRecordId, uploadedBy, dbPayload);

    if (!resumed.ok) {
      return failure(
        "failed",
        "database_error",
        "The file was uploaded but its metadata record could not be written on this resume attempt.",
      );
    }

    return { ok: true, state: "documents_synced", data: mapCloudDocument(resumed.data) };
  }

  if (existing.data.land_record_id !== requestedLandRecordId) {
    return failure(
      "failed",
      "not_found_or_forbidden",
      "Duplicate document could not be confirmed as accessible to the current user.",
    );
  }

  const existingComparable = extractComparableFieldsFromDocumentRow(existing.data);

  if (!areDocumentPayloadsEquivalent(requestedComparable, existingComparable)) {
    return failure(
      "conflict",
      "duplicate_conflict",
      "A document with this id already exists with different content; this retry was not treated as a successful save.",
    );
  }

  return { ok: true, state: "documents_synced", data: mapCloudDocument(existing.data) };
}
