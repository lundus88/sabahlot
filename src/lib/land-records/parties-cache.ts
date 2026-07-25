// Sprint parties cloud write: cache coordination for party writes.
//
// Extends local-cache.ts's per-user CloudLandRecord cache without
// modifying that file -- same pattern as geometry-cache.ts /
// points-cache.ts, patching only the `parties` array of the one record
// the party belongs to. Every other cached record (and every other
// cached field of the SAME record) is left untouched.

import { readCloudCache, writeCloudCache } from "./local-cache";
import type { CloudLandParty } from "./types";

/**
 * Merges one successfully created/updated party into the cached
 * land_record it belongs to, replacing it by id if already present in
 * that record's `parties` array, or appending it otherwise.
 *
 * Callers (parties-write-coordinator.ts) must only invoke this after a
 * confirmed successful cloud write -- this function itself does not
 * check that. If the parent record is not present in this user's cache
 * yet (e.g. cache was never populated by a prior read), this is a
 * no-op: party cache updates never fabricate a parent record.
 */
export function upsertCachedParty(
  userId: string,
  landRecordId: string,
  party: CloudLandParty,
  syncedAt: string,
): void {
  const existing = readCloudCache(userId);
  if (!existing) return;

  const recordIndex = existing.records.findIndex(
    (candidate) => candidate.id === landRecordId,
  );
  if (recordIndex === -1) return;

  const record = existing.records[recordIndex];
  const partyIndex = record.parties.findIndex((candidate) => candidate.id === party.id);

  const nextParties =
    partyIndex >= 0
      ? record.parties.map((candidate, i) => (i === partyIndex ? party : candidate))
      : [...record.parties, party];

  const nextRecords = existing.records.map((candidate, i) =>
    i === recordIndex ? { ...record, parties: nextParties } : candidate,
  );

  writeCloudCache(userId, nextRecords, syncedAt);
}
