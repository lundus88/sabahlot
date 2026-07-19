// Sprint 02D-1B: cache coordination for point writes.
//
// Extends local-cache.ts's per-user CloudLandRecord cache without
// modifying that file -- same pattern as geometry-cache.ts, patching
// only the `points` array of the one record the point belongs to.
// Every other cached record (and every other cached field of the SAME
// record) is left untouched.
//
// A point with no land_record_id (unlinked, per land_points'
// two-branch ownership -- see the migration comment) has no cached
// parent record to attach to under the current cache model:
// CloudLandRecord.points is nested under a land_record, and there is
// no top-level "unlinked points" slot in the cache today. This is a
// deliberate no-op for unlinked points, not a bug -- there is nothing
// in the existing cache shape for an unattached point to join. Revisit
// only if a future sprint introduces a top-level unlinked-point cache.

import { readCloudCache, writeCloudCache } from "./local-cache";
import type { CloudLandPoint } from "./types";

/**
 * Merges one successfully created point into the cached land_record it
 * belongs to, replacing it by id if already present in that record's
 * `points` array, or appending it otherwise.
 *
 * Callers (points-write-coordinator.ts) must only invoke this after a
 * confirmed successful cloud write -- this function itself does not
 * check that. If the parent record is not present in this user's cache
 * yet (e.g. cache was never populated by a prior read), this is a
 * no-op: point cache updates never fabricate a parent record.
 */
export function upsertCachedPoint(
  userId: string,
  landRecordId: string | null,
  point: CloudLandPoint,
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
  const pointIndex = record.points.findIndex((candidate) => candidate.id === point.id);

  const nextPoints =
    pointIndex >= 0
      ? record.points.map((candidate, i) => (i === pointIndex ? point : candidate))
      : [...record.points, point];

  const nextRecords = existing.records.map((candidate, i) =>
    i === recordIndex ? { ...record, points: nextPoints } : candidate,
  );

  writeCloudCache(userId, nextRecords, syncedAt);
}
