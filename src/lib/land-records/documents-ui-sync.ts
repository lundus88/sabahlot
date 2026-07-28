// Sprint documents cloud write UI wiring: UI-facing orchestration for
// syncing pending document uploads (DocumentsSection.tsx's local
// pending-file list) to `documents` + the land-documents Storage bucket
// after a successful parent (+ geometry + points + parties) save.
// Follows the same overall shape as points-ui-sync.ts /
// parties-ui-sync.ts: the parent row must already be core_record_synced
// before any child write is attempted, and every path reports a settled
// outcome rather than throwing.
//
// A pending document already carries its own stable id from the moment
// it is added to the list (DocumentsSection.tsx, mirroring
// FieldGpsLite's createFieldGpsId() pattern for points) -- there is no
// "generate on first sync" step here, unlike parties.
//
// CREATE-ONLY (see documents-validation.ts for why). This sprint does
// not modify documents-repository.ts / documents-write-coordinator.ts /
// documents-validation.ts / documents-cache.ts from within this file.
//
// documents (+ land-documents Storage) ONLY. Never reads or writes
// land_records, land_record_geometries, land_points, or land_parties,
// and never touches src/lib/local-lots.ts or its storage key.

import type { SupabaseClient } from "@supabase/supabase-js";

import { createCloudDocument } from "./documents-write-coordinator";
import type {
  CloudDocument,
  CloudDocumentType,
  CreateDocumentInput,
  DocumentWriteResult,
} from "./documents-validation";
import type { ParentSyncResult } from "./parent-ui-sync";

export type DocumentUiSyncStatus =
  | "local_only"
  | "documents_synced"
  | "invalid_input"
  | "duplicate_conflict"
  | "failed"
  | "network_error";

// Distinguishes the one reason a document stays local-only without
// attempting a cloud write at all -- not an error. Mirrors
// PartyUiLocalOnlyReason / PointUiLocalOnlyReason.
export type DocumentUiLocalOnlyReason = "parent_not_synced";

export interface PendingDocumentInput {
  // Stable id assigned by the caller (DocumentsSection.tsx) the moment
  // the file is added to the pending list -- reused verbatim on every
  // save attempt, never regenerated here (ADR-001).
  id: string;
  file: File;
  documentType: CloudDocumentType;
  isSensitive?: boolean;
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
  ): Promise<DocumentWriteResult>;
}

const DEFAULT_OPERATIONS: DocumentOperations = {
  create: createCloudDocument,
};

function mapWriteResult(id: string, result: DocumentWriteResult): DocumentUiSyncResult {
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
 * Syncs each pending document to `documents` + Storage after a
 * successful parent save. Every pending document already has its own
 * stable id (assigned when added to the list) -- this function never
 * generates one.
 *
 * Never writes a child under an unsettled parent, matching
 * syncFieldGpsPointsToCloud/syncPdfIdentitiesToCloud's ordering
 * guarantee: if parentResult is not core_record_synced, every pending
 * document reports local_only with zero cloud calls.
 *
 * A thrown error on one document is contained to that document's own
 * result and never blocks the remaining documents in the same call.
 */
export async function syncPendingDocumentsToCloud(
  supabase: SupabaseClient,
  parentResult: ParentSyncResult,
  documents: PendingDocumentInput[],
  operations: DocumentOperations = DEFAULT_OPERATIONS,
): Promise<DocumentUiSyncResult[]> {
  if (parentResult.status !== "core_record_synced" || !parentResult.record) {
    return documents.map((doc) => ({
      id: doc.id,
      status: "local_only",
      localOnlyReason: "parent_not_synced",
    }));
  }

  const landRecordId = parentResult.record.id;
  const results: DocumentUiSyncResult[] = [];

  for (const doc of documents) {
    try {
      const result = await operations.create(
        supabase,
        {
          id: doc.id,
          landRecordId,
          documentType: doc.documentType,
          originalFilename: doc.file.name,
          mimeType: doc.file.type || null,
          sizeBytes: doc.file.size,
          isSensitive: doc.isSensitive,
        },
        doc.file,
      );

      results.push(mapWriteResult(doc.id, result));
    } catch (error) {
      results.push({
        id: doc.id,
        status: "network_error",
        message: error instanceof Error ? error.message : "Unknown document sync error.",
      });
    }
  }

  return results;
}
