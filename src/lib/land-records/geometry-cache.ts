// Sprint 02D-1A: cache coordination for geometry writes.
//
// Extends local-cache.ts's per-user CloudLandRecord cache without
// modifying that file -- this reads the existing cache, updates only
// the `geometries` array of the one record the geometry belongs to,
// and writes the whole cache back via the same functions Sprint
// 02B/02C already established. Every other cached record (and every
// other cached field of the SAME record) is left untouched.

import { readCloudCache, writeCloudCache } from "./local-cache";
import type { DrawingObject } from "@/lib/drawing-types";

/**
 * Merges one successfully created/updated geometry into the cached
 * land_record it belongs to, replacing it by id if already present in
 * that record's `geometries` array, or appending it otherwise.
 *
 * Callers (geometry-write-coordinator.ts) must only invoke this after
 * a confirmed successful cloud write -- this function itself does not
 * check that. If the parent record is not present in this user's
 * cache yet (e.g. cache was never populated by a prior read), this is
 * a no-op: geometry cache updates never fabricate a parent record.
 */
export function upsertCachedGeometry(
  userId: string,
  landRecordId: string,
  geometry: DrawingObject,
  syncedAt: string,
): void {
  const existing = readCloudCache(userId);
  if (!existing) return;

  const recordIndex = existing.records.findIndex(
    (candidate) => candidate.id === landRecordId,
  );
  if (recordIndex === -1) return;

  const record = existing.records[recordIndex];
  const geometryIndex = record.geometries.findIndex(
    (candidate) => candidate.id === geometry.id,
  );

  const nextGeometries =
    geometryIndex >= 0
      ? record.geometries.map((candidate, i) =>
          i === geometryIndex ? geometry : candidate,
        )
      : [...record.geometries, geometry];

  const nextRecords = existing.records.map((candidate, i) =>
    i === recordIndex ? { ...record, geometries: nextGeometries } : candidate,
  );

  writeCloudCache(userId, nextRecords, syncedAt);
}
