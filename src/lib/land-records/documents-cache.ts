// Sprint documents-follow-up-cache-only: cache coordination for
// document writes.
//
// Extends local-cache.ts's per-user CloudLandRecord cache without
// modifying that file -- same pattern as geometry-cache.ts/
// points-cache.ts, patching only the `documents` array of the one
// record the document belongs to. Every other cached record (and every
// other cached field of the SAME record) is left untouched.
//
// A document with no land_record_id (unlinked, per public.documents'
// two-branch ownership -- see documents-write-coordinator.ts's comment)
// has no cached parent record to attach to under the current cache
// model: CloudLandRecord.documents is nested under a land_record, and
// there is no top-level "unlinked documents" slot in the cache today.
// This is a deliberate no-op for unlinked documents, not a bug -- same
// reasoning as points-cache.ts's identical unlinked-point case.

import { readCloudCache, writeCloudCache } from "./local-cache";
import type { CloudDocument } from "./types";

/**
 * Merges one successfully created document into the cached land_record
 * it belongs to, replacing it by id if already present in that record's
 * `documents` array, or appending it otherwise.
 *
 * Callers (documents-write-coordinator.ts) must only invoke this after
 * a confirmed successful cloud write -- this function itself does not
 * check that. If the parent record is not present in this user's cache
 * yet (e.g. cache was never populated by a prior read), this is a
 * no-op: document cache updates never fabricate a parent record.
 */
export function upsertCachedDocument(
  userId: string,
  landRecordId: string | null,
  document: CloudDocument,
  syncedAt: string,
): void {
  if (landRecordId === null) return;

  const existing = readCloudCache(userId);
  if (!existing) return;

  const recordIndex = existing.records.findIndex(
    (candidate) => candidate.id === landRecordId,
  );
  if (recordIndex === -1) return;

  const record = existing.records[recordIndex];
  const documentIndex = record.documents.findIndex(
    (candidate) => candidate.id === document.id,
  );

  const nextDocuments =
    documentIndex >= 0
      ? record.documents.map((candidate, i) =>
          i === documentIndex ? document : candidate,
        )
      : [...record.documents, document];

  const nextRecords = existing.records.map((candidate, i) =>
    i === recordIndex ? { ...record, documents: nextDocuments } : candidate,
  );

  writeCloudCache(userId, nextRecords, syncedAt);
}
