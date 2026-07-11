// Sprint 02B: local cache for cloud-sourced land records, namespaced
// per authenticated user UUID.
//
// This is a NEW, separate localStorage key from the legacy
// `sabahlot_local_lots_v1` key used by local-lots.ts (see
// LOCAL_LOTS_STORAGE_KEY there) -- this file never reads, writes, or
// deletes that key. The two caches are intentionally independent in
// this sprint; unifying them is out of scope here.

import type { CloudLandRecord } from "./types";

export const CLOUD_CACHE_VERSION = 1;

const CLOUD_CACHE_KEY_PREFIX = "sabahlot_cloud_land_records_v1";

interface CloudCachePayload {
  version: number;
  userId: string;
  syncedAt: string;
  records: CloudLandRecord[];
}

/**
 * The cache key is namespaced by the authenticated user's UUID, so
 * User A and User B never read or write the same storage entry. There
 * is no "current user" global -- callers must always pass the id they
 * mean, which is what prevents a stale/wrong cache from becoming
 * active after logout or account switch.
 */
export function getCloudCacheKey(userId: string): string {
  return `${CLOUD_CACHE_KEY_PREFIX}:${userId}`;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}

export function readCloudCache(userId: string): CloudCachePayload | null {
  const storage = getStorage();
  if (!storage) return null;

  const raw = storage.getItem(getCloudCacheKey(userId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as CloudCachePayload).userId !== userId ||
      !Array.isArray((parsed as CloudCachePayload).records)
    ) {
      return null;
    }

    return parsed as CloudCachePayload;
  } catch {
    return null;
  }
}

/**
 * Writes the cloud cache for one user. Callers must only invoke this
 * after a successful cloud read (see index.ts) -- this file does not
 * enforce that itself, it just performs the write it's given.
 */
export function writeCloudCache(
  userId: string,
  records: CloudLandRecord[],
  syncedAt: string,
): void {
  const storage = getStorage();
  if (!storage) return;

  const payload: CloudCachePayload = {
    version: CLOUD_CACHE_VERSION,
    userId,
    syncedAt,
    records,
  };

  storage.setItem(getCloudCacheKey(userId), JSON.stringify(payload));
}

export function readCloudCacheLastSyncedAt(userId: string): string | null {
  return readCloudCache(userId)?.syncedAt ?? null;
}
