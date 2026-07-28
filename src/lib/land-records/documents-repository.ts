// Sprint documents cloud write: Supabase access for `documents` (table)
// + the `land-documents` Storage bucket ONLY. Both already exist on
// sabahlot-dev (confirmed live via the Supabase MCP list_tables /
// execute_sql tools, 2026-07-28) -- no migration or bucket creation
// happens in this sprint.
//
// Same shape as parties-repository.ts / points-repository.ts:
// RLS-reliant, no owner/parent id accepted from a UI caller beyond the
// landRecordId the caller is explicitly uploading under (RLS still
// verifies that land_record_id's owner_id == auth.uid() -- this file
// does not and cannot bypass that check).
//
// This is the one child table that writes to TWO independent Supabase
// surfaces (Storage object + Postgres row) for a single logical
// "document". Each has its own idempotency handling -- see
// uploadDocumentFile's upsert:false + 409-tolerant retry note, and
// createDocumentRow's plain-INSERT + 23505 note (resolved by the
// coordinator exactly like every other child table).
//
// No land_record, geometry, point, or party table is ever touched by
// this file.

import type { SupabaseClient } from "@supabase/supabase-js";

import { DOCUMENTS_STORAGE_BUCKET } from "./documents-validation";
import type { CloudDocumentRow, DocumentWritableFields } from "./documents-validation";
import type { ChildRepositoryError, ChildRepositoryResult } from "./geometry-repository";

function toChildRepositoryError(error: unknown): ChildRepositoryError {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      code: typeof record.code === "string" ? record.code : undefined,
      message:
        typeof record.message === "string" ? record.message : "Unknown Supabase error",
    };
  }
  return { message: "Unknown Supabase error" };
}

const DOCUMENT_SELECT_COLUMNS =
  "id, land_record_id, uploaded_by, document_type, storage_bucket, storage_path, original_filename, mime_type, size_bytes, is_sensitive, created_at";

/**
 * Converts validated DocumentWritableFields into the snake_case columns
 * `documents` actually uses. Never accepts or emits `id`,
 * `land_record_id`, `uploaded_by`, `storage_bucket`, or `storage_path`
 * -- those are controlled entirely by createDocumentRow's own
 * parameters, never by this mapping.
 */
export function mapDocumentFieldsToDbPayload(
  fields: Partial<DocumentWritableFields>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if ("documentType" in fields) payload.document_type = fields.documentType;
  if ("originalFilename" in fields) payload.original_filename = fields.originalFilename;
  if ("mimeType" in fields) payload.mime_type = fields.mimeType;
  if ("sizeBytes" in fields) payload.size_bytes = fields.sizeBytes;
  if ("isSensitive" in fields) payload.is_sensitive = fields.isSensitive;
  return payload;
}

export interface StorageUploadSuccess {
  ok: true;
  alreadyExisted: boolean;
}
export interface StorageUploadFailure {
  ok: false;
  error: ChildRepositoryError;
}
export type StorageUploadResult = StorageUploadSuccess | StorageUploadFailure;

/**
 * Uploads the file to the land-documents bucket at `storagePath`, using
 * upsert:false so a retry against the SAME path (same document id, same
 * original filename -- see buildDocumentStoragePath) never silently
 * overwrites a different file's bytes. A "resource already exists"
 * response is treated as a tolerated retry outcome (alreadyExisted:
 * true), not a failure -- the caller (documents-write-coordinator.ts)
 * still runs the metadata-row INSERT+23505 check afterward, which is
 * what actually confirms the retry's CONTENT (document_type, filename,
 * size, ...) matches, exactly like every other child table's duplicate
 * handling. This function itself never compares file bytes.
 */
export async function uploadDocumentFile(
  supabase: SupabaseClient,
  storagePath: string,
  file: Blob,
  mimeType: string | undefined,
): Promise<StorageUploadResult> {
  const { error } = await supabase.storage
    .from(DOCUMENTS_STORAGE_BUCKET)
    .upload(storagePath, file, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    const message = "message" in error ? String(error.message ?? "") : "";
    const statusCode = (error as { statusCode?: string | number }).statusCode;
    const isAlreadyExists =
      /already exists/i.test(message) || statusCode === 409 || statusCode === "409";

    if (isAlreadyExists) {
      return { ok: true, alreadyExisted: true };
    }

    return { ok: false, error: toChildRepositoryError(error) };
  }

  return { ok: true, alreadyExisted: false };
}

/**
 * Plain INSERT using the caller-supplied stable id. Uses INSERT, never
 * upsert, so a retry with the same id surfaces as Postgres 23505 on
 * `error.code` rather than silently overwriting -- the coordinator
 * decides what to do with that (same pattern as every other child
 * table's create function).
 *
 * `id`/`land_record_id`/`uploaded_by`/`storage_bucket`/`storage_path`
 * are spread LAST so they always win even if `dbPayload` ever gained a
 * same-named key.
 */
export async function createDocumentRow(
  supabase: SupabaseClient,
  id: string,
  landRecordId: string,
  uploadedBy: string,
  storagePath: string,
  dbPayload: Record<string, unknown>,
): Promise<ChildRepositoryResult<CloudDocumentRow>> {
  const { data, error } = await supabase
    .from("documents")
    .insert({
      ...dbPayload,
      id,
      land_record_id: landRecordId,
      uploaded_by: uploadedBy,
      storage_bucket: DOCUMENTS_STORAGE_BUCKET,
      storage_path: storagePath,
    })
    .select(DOCUMENT_SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, error: toChildRepositoryError(error) };
  }

  return { ok: true, data: data as CloudDocumentRow };
}

/**
 * Looks up one document by id, scoped by RLS to rows accessible to the
 * caller (via the parent land_record's owner_id, or via uploaded_by for
 * an unlinked row -- see the documents RLS policies). Used to resolve a
 * 23505 retry, same role as every other child table's getXById.
 */
export async function getDocumentById(
  supabase: SupabaseClient,
  id: string,
): Promise<ChildRepositoryResult<CloudDocumentRow | null>> {
  const { data, error } = await supabase
    .from("documents")
    .select(DOCUMENT_SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { ok: false, error: toChildRepositoryError(error) };
  }

  return { ok: true, data: (data ?? null) as CloudDocumentRow | null };
}
