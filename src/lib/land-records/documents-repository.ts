// Sprint documents-cloud-write: Supabase access for public.documents AND
// the `land-documents` Storage bucket. CREATE-ONLY -- no updateDocumentRow,
// no deleteDocumentRow exist here, and none should be added without a new
// ADR (see child-types.ts's CreateDocumentInput comment for why).
//
// Same shape as points-repository.ts: RLS-reliant, no owner/uploaded-by id
// accepted from a UI caller beyond what the coordinator derives from the
// session and passes in explicitly here.
//
// Unlike every other child table, a document write is TWO physical
// operations -- a Storage object upload, then a metadata row insert --
// neither of which is atomic with the other. See
// documents-write-coordinator.ts for how the two are sequenced and how a
// retry safely resumes a partially-completed attempt instead of
// duplicating or silently overwriting.
//
// No land_record, geometry, point, or party table is ever touched by this
// file.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CloudDocumentRow } from "./types";
import type { DocumentWritableFields } from "./child-types";
// Reused rather than redefined here -- same generic repository-result
// shape every other child table's repository file already established
// and exports via index.ts. See points-repository.ts for the same
// reasoning.
import type { ChildRepositoryError, ChildRepositoryResult } from "./geometry-repository";

// The only Supabase Storage bucket this file ever touches. Confirmed to
// exist in sabahlot-dev (created 2026-07-27, re-confirmed via a
// read-only query 2026-07-30 -- see docs/ai/PROJECT_STATE.md). Never
// read from an env var: like SABAHLOT_DEV_PROJECT_REF in feature-gate.ts,
// this is public, non-sensitive metadata, not a credential.
export const DOCUMENTS_STORAGE_BUCKET = "land-documents";

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
 * Converts validated DocumentWritableFields plus the coordinator-derived
 * file metadata into the snake_case columns public.documents actually
 * uses. Never accepts or emits `id`, `land_record_id`, `uploaded_by`,
 * `storage_bucket`, or `storage_path` -- those are controlled entirely by
 * createDocumentRow's own parameters, never by this mapping.
 */
export function mapDocumentFieldsToDbPayload(
  fields: DocumentWritableFields,
  derivedFile: { sizeBytes: number; mimeType: string | null },
): Record<string, unknown> {
  return {
    document_type: fields.documentType,
    original_filename: fields.originalFilename,
    is_sensitive: fields.isSensitive ?? true,
    mime_type: derivedFile.mimeType,
    size_bytes: derivedFile.sizeBytes,
  };
}

export interface StorageUploadResult {
  ok: true;
}
export interface StorageUploadFailure {
  ok: false;
  // Best-effort detection of "an object already exists at this path" --
  // Supabase Storage reports this as a 409-shaped error. This is not a
  // documented guarantee of the SDK's error shape, so a false negative
  // here (treated as a generic failure instead) is safe: it just means a
  // genuine retry surfaces as `database_error` instead of resuming
  // cleanly, never a silent overwrite or duplicate.
  alreadyExists: boolean;
  error: ChildRepositoryError;
}
export type StorageUploadOutcome = StorageUploadResult | StorageUploadFailure;

function looksLikeAlreadyExists(error: ChildRepositoryError, raw: unknown): boolean {
  const statusCode =
    raw && typeof raw === "object" && "statusCode" in raw
      ? String((raw as Record<string, unknown>).statusCode)
      : undefined;
  return (
    statusCode === "409" ||
    /already exists/i.test(error.message)
  );
}

/**
 * Uploads one file to the land-documents bucket at the caller-supplied
 * path. `upsert` is always false -- a genuine content update is out of
 * scope this sprint (see child-types.ts), so an existing object at this
 * path is never silently replaced. The coordinator interprets an
 * `alreadyExists` failure as "resume/verify a prior attempt," never as
 * "retry the upload."
 */
export async function uploadDocumentFile(
  supabase: SupabaseClient,
  path: string,
  file: Blob,
  contentType: string | null,
): Promise<StorageUploadOutcome> {
  const { error } = await supabase.storage
    .from(DOCUMENTS_STORAGE_BUCKET)
    .upload(path, file, {
      upsert: false,
      ...(contentType ? { contentType } : {}),
    });

  if (error) {
    const mapped = toChildRepositoryError(error);
    return { ok: false, alreadyExists: looksLikeAlreadyExists(mapped, error), error: mapped };
  }

  return { ok: true };
}

/**
 * Plain INSERT using the caller-supplied stable id -- overrides
 * public.documents.id's `default gen_random_uuid()` on purpose (see
 * child-types.ts's CreateDocumentInput comment). Uses INSERT, never
 * upsert, so a retry with the same id surfaces as Postgres 23505 on
 * `error.code` rather than silently overwriting -- same pattern as every
 * other child table's createXRow.
 *
 * `landRecordId` may be null -- documents' two-branch ownership (see the
 * migration) allows an unlinked document. `uploadedBy` is always the
 * session-derived user id (ADR-005), never accepted from the caller's
 * input type.
 */
export async function createDocumentRow(
  supabase: SupabaseClient,
  id: string,
  landRecordId: string | null,
  uploadedBy: string,
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
      storage_path: `${uploadedBy}/${id}`,
    })
    .select(DOCUMENT_SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, error: toChildRepositoryError(error) };
  }

  return { ok: true, data: data as CloudDocumentRow };
}

/**
 * Looks up one document by id, scoped by RLS (linked via the parent
 * land_record's owner_id, or unlinked via uploaded_by). Used to resolve
 * both an `alreadyExists` Storage response and a 23505 on insert -- same
 * role as every other child table's getXById. There is no update/delete
 * counterpart in this file.
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

export interface SignedUrlResult {
  ok: true;
  url: string;
}
export interface SignedUrlFailure {
  ok: false;
  error: ChildRepositoryError;
}
export type SignedUrlOutcome = SignedUrlResult | SignedUrlFailure;

/**
 * Resolves a document's actual file location to a short-lived signed
 * URL, per the documents migration's own comment: "No permanent public
 * URL is stored anywhere on this table." `expiresInSeconds` has no
 * default here on purpose -- the caller must decide how long the URL
 * should live for its specific use case (e.g. an inline preview vs. a
 * download link) rather than inherit a value silently baked into this
 * repository.
 */
export async function createDocumentSignedUrl(
  supabase: SupabaseClient,
  path: string,
  expiresInSeconds: number,
): Promise<SignedUrlOutcome> {
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_STORAGE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return {
      ok: false,
      error: error ? toChildRepositoryError(error) : { message: "No signed URL returned." },
    };
  }

  return { ok: true, url: data.signedUrl };
}
