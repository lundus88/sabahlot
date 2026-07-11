// Sprint 02B: authenticated cloud read flow for land_records.
//
// This module is intentionally not wired into src/app/page.tsx yet --
// see the Sprint 02B report, section "Minimum UI integration", for why
// and where Sprint 02C should connect it.

import type { SupabaseClient } from "@supabase/supabase-js";

import { isCloudReadEnabled } from "./feature-gate";
import {
  getLandParties,
  getLandPoints,
  getLandRecordGeometries,
  listLandRecordsForCurrentUser,
} from "./cloud-repository";
import { readCloudCache, writeCloudCache } from "./local-cache";
import { mapCloudRecordToDomain } from "./mapper";
import type { CloudLandRecord, CloudReadResult } from "./types";

export * from "./types";
export * from "./mapper";
export * from "./cloud-repository";
export * from "./local-cache";
export { isCloudReadEnabled } from "./feature-gate";

/**
 * Implements the authenticated read flow described in Sprint 02B
 * section 4:
 *   1. Get current session.
 *   2. No user -> do not query cloud, return an explicit
 *      anonymous/offline status.
 *   3. User present -> fetch land_records + child rows, map, cache by
 *      user UUID, return `synced`.
 *   4. Cloud read fails -> read that same user's cache only, return
 *      `offline`/`failed`, never another user's cache.
 *
 * Never returns `synced` when the cloud query actually failed.
 */
export async function loadCloudLandRecords(
  supabase: SupabaseClient,
): Promise<CloudReadResult> {
  if (!isCloudReadEnabled()) {
    return { state: "idle", records: [], lastSyncedAt: null };
  }

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;

  if (!userId) {
    // No session: this is the anonymous-mode boundary. Anonymous
    // sessions are never synced automatically (owner decision #6) --
    // there is deliberately no cloud query and no cache read/write
    // here for the anonymous case.
    return { state: "offline", records: [], lastSyncedAt: null };
  }

  const recordsResult = await listLandRecordsForCurrentUser(supabase);

  if (!recordsResult.ok) {
    return readFromCacheOnly(userId, recordsResult.error);
  }

  try {
    const records: CloudLandRecord[] = [];

    for (const row of recordsResult.data) {
      const [geometries, points, parties] = await Promise.all([
        getLandRecordGeometries(supabase, row.id),
        getLandPoints(supabase, row.id),
        getLandParties(supabase, row.id),
      ]);

      if (!geometries.ok) return readFromCacheOnly(userId, geometries.error);
      if (!points.ok) return readFromCacheOnly(userId, points.error);
      if (!parties.ok) return readFromCacheOnly(userId, parties.error);

      const existingCached = readCloudCache(userId)?.records.find(
        (cached) => cached.id === row.id,
      );

      records.push(
        mapCloudRecordToDomain(
          row,
          {
            geometries: geometries.data,
            points: points.data,
            parties: parties.data,
          },
          existingCached?.originalApplicantStatus ?? "",
        ),
      );
    }

    const syncedAt = new Date().toISOString();
    writeCloudCache(userId, records, syncedAt);

    return { state: "synced", records, lastSyncedAt: syncedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mapping error";
    return readFromCacheOnly(userId, message);
  }
}

function readFromCacheOnly(
  userId: string,
  error: string,
): CloudReadResult {
  const cached = readCloudCache(userId);

  return {
    state: cached ? "offline" : "failed",
    records: cached?.records ?? [],
    lastSyncedAt: cached?.syncedAt ?? null,
    error,
  };
}
