// Sprint documents UI wiring: UI-facing orchestration for syncing
// locally-picked files (src/app/page.tsx's new documentUploads state,
// captured via a plain <input type="file">) to public.documents + the
// land-documents Storage bucket after a successful parent (+ geometry)
// save. Follows the same overall shape as points-ui-sync.ts's
// syncFieldGpsPointsToCloud / parties-ui-sync.ts's
// syncPdfIdentitiesToCloud: the parent row must already be
// core_record_synced before any child write is attempted, and every
// path reports a settled outcome rather than throwing.
//
// UNLIKE every other child sync module, there is no pre-existing local
// state to attach to here -- points had FieldGpsLite's `points`, parties
// had PdfIdentityFields. A document upload's `id` is generated once, at
// the moment the file is picked (page.tsx), and reused verbatim on every
// subsequent save attempt for that same item (ADR-001) -- this file
// never generates one itself.
//
// Also unlike every other child, a picked File/Blob cannot be persisted
// to localStorage (no serialization format for binary data) -- so
// documentUploads is deliberately a session-only, in-memory React state
// in page.tsx. A file picked but not yet successfully synced is lost on
// reload. This is a known, accepted limitation of this minimal sprint,
// not an oversight -- see the sprint report.
//
// CREATE-ONLY (mirrors ADR-011's reasoning, extended to documents):
// createCloudDocument has no update counterpart -- public.documents has
// no updated_at column. This sprint does not modify
// documents-repository.ts / documents-write-coordinator.ts /
// documents-validation.ts in any way.
//
// documents (+ the land-documents Storage bucket) ONLY. Never reads or
// writes land_records, land_record_geometries, land_points, or
// land_parties, and never touches src/lib/local-lots.ts or its storage
// key.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChildWriteResult, CreateDocumentInput } from "./child-types";
import type { CloudDocument, CloudDocumentType } from "./types";
import { createCloudDocument } from "./documents-write-coordinator";
import type { ParentSyncResult } from "./parent-ui-sync";

export type DocumentUiSyncStatus =
  | "local_only"
  | "documents_synced"
  | "invalid_input"
  | "duplicate_conflict"
  | "failed"
  | "network_error";

// Distinguishes the one reason a document upload stays local-only
// without attempting a cloud write at all -- not an error. Mirrors
// PointUiLocalOnlyReason / PartyUiLocalOnlyReason.
export type DocumentUiLocalOnlyReason = "parent_not_synced";

export interface DocumentUploadInput {
  // Stable child UUID, generated once by the caller (page.tsx) at the
  // moment the file is picked -- never regenerated here (ADR-001).
  id: string;
  documentType: CloudDocumentType;
  originalFilename: string;
  isSensitive?: boolean;
  // The actual bytes. mimeType/sizeBytes are deliberately not part of
  // this input at all -- createCloudDocument derives both from this
  // Blob's own .type/.size, never from a caller-declared field (see
  // child-types.ts's CreateDocumentInput comment).
  file: Blob;
}

export interface DocumentUiSyncResult {
  id: string;
  status: DocumentUiSyncStatus;
  document?: CloudDocument;
  message?: string;
  localOnlyReason?: DocumentUiLocalOnlyReason;
}

interface DocumentOperations {
  create(
    supabase: SupabaseClient,
    input: CreateDocumentInput,
    file: Blob,
  ): Promise<ChildWriteResult<CloudDocument>>;
}

const DEFAULT_OPERATIONS: DocumentOperations = {
  create: createCloudDocument,
};

function mapWriteResult(
  id: string,
  result: ChildWriteResult<CloudDocument>,
): DocumentUiSyncResult {
  if (result.ok) {
    return { id, status: "documents_synced", document: result.data };
  }

  switch (result.code) {
    case "duplicate_conflict":
      return { id, status: "duplicate_conflict", message: result.message };
    case "validation_failed":
    case "invalid_parent_id":
    case "legacy_child_id_requires_mapping":
      return { id, status: "invalid_input", message: result.message };
    case "network_error":
      return { id, status: "network_error", message: result.message };
    default:
      return { id, status: "failed", message: result.message };
  }
}

/**
 * Syncs each locally-picked document upload to public.documents after a
 * successful parent (+ geometry) save. Every upload already has its own
 * stable id (assigned when the file was picked) -- this function never
 * generates one.
 *
 * Never writes a child under an unsettled parent, matching
 * syncFieldGpsPointsToCloud/syncPdfIdentitiesToCloud's ordering
 * guarantee: if parentResult is not core_record_synced, every upload
 * reports local_only with zero cloud calls.
 *
 * A thrown error on one upload is contained to that upload's own result
 * and never blocks the remaining uploads in the same call.
 */
export async function syncDocumentUploadsToCloud(
  supabase: SupabaseClient,
  parentResult: ParentSyncResult,
  uploads: DocumentUploadInput[],
  operations: DocumentOperations = DEFAULT_OPERATIONS,
): Promise<DocumentUiSyncResult[]> {
  if (parentResult.status !== "core_record_synced" || !parentResult.record) {
    return uploads.map((upload) => ({
      id: upload.id,
      status: "local_only",
      localOnlyReason: "parent_not_synced",
    }));
  }

  const landRecordId = parentResult.record.id;
  const results: DocumentUiSyncResult[] = [];

  for (const upload of uploads) {
    try {
      const result = await operations.create(
        supabase,
        {
          id: upload.id,
          landRecordId,
          documentType: upload.documentType,
          originalFilename: upload.originalFilename,
          isSensitive: upload.isSensitive,
        },
        upload.file,
      );

      results.push(mapWriteResult(upload.id, result));
    } catch (error) {
      results.push({
        id: upload.id,
        status: "network_error",
        message: error instanceof Error ? error.message : "Unknown document sync error.",
      });
    }
  }

  return results;
}
