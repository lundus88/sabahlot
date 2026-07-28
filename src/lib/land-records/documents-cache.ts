// Sprint documents cloud write: standalone per-user cache for synced
// document metadata.
//
// UNLIKE parties-cache.ts / points-cache.ts, this does NOT patch a
// `documents` array into the existing per-user CloudLandRecord cache
// (local-cache.ts) -- CloudLandRecord (types.ts) has no `documents`
// field, and types.ts is a shared, Foundation/Integration-owned file
// outside this sprint's Allowed Files (see docs/ai/FILE_OWNERSHIP.md).
// Adding one would also require updating every pre-existing test helper
// across parties-write.qa.ts / points-write.qa.ts / parent-ui-sync*.qa.ts
// / child-ui-sync.qa.ts that constructs a full CloudLandRecord object
// literal -- well outside "documents-*.ts only". This sprint therefore
// uses its own, separate localStorage key instead, exactly the same
// justification local-cache.ts itself already gives for being separate
// from the legacy `sabahlot_local_lots_v1` key. Flagged explicitly in
// the sprint report as a deviation from the parties/points pattern, for
// a future Foundation/Integration sprint to reconcile if a shared
// `CloudLandRecord.documents` field is ever added.
//
// Namespaced by the authenticated user's UUID (ADR-007's reasoning,
// applied here independently since this is a separate cache) -- there
// is no "current user" global; every function takes the user id
// explicitly.

import type { CloudDocument } from "./documents-validation";

export const DOCUMENTS_CACHE_VERSION = 1;
const DOCUMENTS_CACHE_KEY_PREFIX = "sabahlot_cloud_documents_v1";

interface DocumentsCachePayload {
  version: number;
  userId: string;
  syncedAt: string;
  documents: CloudDocument[];
}

export function getDocumentsCacheKey(userId: string): string {
  return `${DOCUMENTS_CACHE_KEY_PREFIX}:${userId}`;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readDocumentsCache(userId: string): DocumentsCachePayload | null {
  const storage = getStorage();
  if (!storage) return null;

  const raw = storage.getItem(getDocumentsCacheKey(userId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as DocumentsCachePayload).userId !== userId ||
      !Array.isArray((parsed as DocumentsCachePayload).documents)
    ) {
      return null;
    }
    return parsed as DocumentsCachePayload;
  } catch {
    return null;
  }
}

export function writeDocumentsCache(
  userId: string,
  documents: CloudDocument[],
  syncedAt: string,
): void {
  const storage = getStorage();
  if (!storage) return;

  const payload: DocumentsCachePayload = {
    version: DOCUMENTS_CACHE_VERSION,
    userId,
    syncedAt,
    documents,
  };
  storage.setItem(getDocumentsCacheKey(userId), JSON.stringify(payload));
}

/**
 * Merges one successfully created document into this user's cache,
 * replacing it by id if already present, appending otherwise. Callers
 * (documents-write-coordinator.ts) must only invoke this after a
 * confirmed successful cloud write -- this function itself does not
 * check that.
 */
export function upsertCachedDocument(
  userId: string,
  document: CloudDocument,
  syncedAt: string,
): void {
  const existing = readDocumentsCache(userId);
  const documents = existing?.documents ?? [];
  const index = documents.findIndex((candidate) => candidate.id === document.id);

  const nextDocuments =
    index >= 0
      ? documents.map((candidate, i) => (i === index ? document : candidate))
      : [...documents, document];

  writeDocumentsCache(userId, nextDocuments, syncedAt);
}
