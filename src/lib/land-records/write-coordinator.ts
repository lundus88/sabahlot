// Sprint 02C: authenticated cloud create/update coordinator for
// land_records. land_records ONLY -- no geometry, points, parties, or
// documents are ever written here.
//
// This module is not wired into src/app/page.tsx -- see the Sprint
// 02C report for why and where a future sprint should connect it.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createLandRecordRow,
  getLandRecordById,
  updateLandRecordRow,
} from "./cloud-repository";
import { isCloudWriteEnabled } from "./feature-gate";
import { mapCloudRecordToDomain, mapWritableFieldsToDbPayload } from "./mapper";
import { upsertCloudCacheRecord } from "./local-cache";
import { isStableCloudId } from "./types";
import type {
  CreateLandRecordInput,
  UpdateLandRecordInput,
  WriteResult,
} from "./types";
import {
  areCreatePayloadsEquivalent,
  buildComparableCreatePayload,
  extractComparableFieldsFromRow,
  validateCreatePayload,
  validateUpdatePayload,
} from "./validation";

function failure(
  state: WriteResult["state"],
  code: Extract<WriteResult, { ok: false }>["code"],
  message: string,
): WriteResult {
  return { ok: false, state, code, message };
}

async function getAuthenticatedUserId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/**
 * Creates one land_records row for the authenticated caller.
 *
 * Never accepts an owner id from `input` -- the owner is always the
 * session's own auth.uid(), derived here. Never sends `status` --
 * the column default ('draft') applies. Retrying with the exact same
 * `input.id` after a prior success (double-click, timeout-then-retry)
 * resolves as a success without creating a second row -- see the
 * 23505 handling below.
 */
export async function createCloudLandRecord(
  supabase: SupabaseClient,
  input: CreateLandRecordInput,
): Promise<WriteResult> {
  if (!isCloudWriteEnabled()) {
    return failure("idle", "database_error", "Cloud write is disabled in this environment.");
  }

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) {
    return failure("failed", "unauthenticated", "No authenticated session.");
  }

  if (!isStableCloudId(input.id)) {
    return failure(
      "failed",
      "legacy_id_requires_migration_mapping",
      "Record id is not a stable UUID; legacy local ids are not uploaded automatically.",
    );
  }

  const validation = validateCreatePayload(input);
  if (!validation.ok) {
    return failure("failed", "validation_failed", validation.error);
  }

  const dbPayload = mapWritableFieldsToDbPayload(validation.payload);
  const result = await createLandRecordRow(supabase, input.id, userId, dbPayload);

  if (!result.ok) {
    if (result.error.code === "23505") {
      return resolveDuplicateCreate(supabase, userId, validation.payload);
    }

    return failure(
      "failed",
      "database_error",
      "Cloud create failed; the local working copy has not been changed.",
    );
  }

  const record = mapCloudRecordToDomain(result.data, {
    geometries: [],
    points: [],
    parties: [],
  });

  const syncedAt = new Date().toISOString();
  upsertCloudCacheRecord(userId, record, syncedAt);

  return { ok: true, state: "record_synced", record };
}

/**
 * A 23505 on create means a row with this id already exists. This is
 * expected and safe for a retry (double-click, or a request that
 * actually succeeded but whose response was lost to a timeout) --
 * PROVIDED the existing row's allowlisted content actually matches
 * what this attempt asked to create. Same id with different content
 * is NOT treated as success (Sprint 02C-1 Patch 1 -- see the
 * independent review finding this replaces).
 *
 * Three outcomes:
 *   - existing row unreadable / not owned by this user -> `not_found`
 *     (never reveals whether a record with this id exists under
 *     another owner -- same safe messaging as resolveNoRowsUpdated).
 *   - existing row owned by this user but content differs from the
 *     requested payload -> `duplicate_conflict`. The row is NOT
 *     touched, the cache is NOT updated, and no automatic retry is
 *     attempted.
 *   - existing row owned by this user and content matches -> verified
 *     idempotent success, `record_synced`.
 */
async function resolveDuplicateCreate(
  supabase: SupabaseClient,
  userId: string,
  requestedPayload: CreateLandRecordInput,
): Promise<WriteResult> {
  const existing = await getLandRecordById(supabase, requestedPayload.id);

  if (!existing.ok || !existing.data) {
    return failure(
      "failed",
      "not_found",
      "Duplicate record could not be confirmed as accessible to the current user.",
    );
  }

  if (existing.data.owner_id !== userId) {
    // Do not reveal that a record with this id exists under a
    // different owner -- report the same outcome as "unreadable".
    return failure(
      "failed",
      "not_found",
      "Duplicate record could not be confirmed as accessible to the current user.",
    );
  }

  const requestedComparable = buildComparableCreatePayload(requestedPayload);
  const existingComparable = extractComparableFieldsFromRow(
    existing.data,
    Object.keys(requestedComparable) as Parameters<
      typeof extractComparableFieldsFromRow
    >[1],
  );

  if (!areCreatePayloadsEquivalent(requestedComparable, existingComparable)) {
    return failure(
      "conflict",
      "duplicate_conflict",
      "A record with this id already exists with different content; this retry was not treated as a successful save.",
    );
  }

  const record = mapCloudRecordToDomain(existing.data, {
    geometries: [],
    points: [],
    parties: [],
  });

  const syncedAt = new Date().toISOString();
  upsertCloudCacheRecord(userId, record, syncedAt);

  return { ok: true, state: "record_synced", record };
}

/**
 * Updates ordinary fields on one land_records row owned by the
 * authenticated caller. `expectedUpdatedAt` must be the `updated_at`
 * value the caller last read/saved for this record -- the UPDATE is
 * scoped by both `id` and that value, so a row that has changed since
 * (on another device, or via a concurrent save) matches zero rows and
 * is reported as `conflict`, never silently overwritten.
 *
 * Never accepts `status` or `owner_id` in `patch` -- validation.ts's
 * allowlist does not emit them, so there is nothing for this function
 * to strip; they are structurally absent.
 */
export async function updateCloudLandRecord(
  supabase: SupabaseClient,
  recordId: string,
  patch: UpdateLandRecordInput,
  expectedUpdatedAt: string,
): Promise<WriteResult> {
  if (!isCloudWriteEnabled()) {
    return failure("idle", "database_error", "Cloud write is disabled in this environment.");
  }

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) {
    return failure("failed", "unauthenticated", "No authenticated session.");
  }

  if (!isStableCloudId(recordId)) {
    return failure("failed", "invalid_record_id", "Record id is not a valid UUID.");
  }

  const validation = validateUpdatePayload(patch);
  if (!validation.ok) {
    return failure("failed", "validation_failed", validation.error);
  }

  const dbPayload = mapWritableFieldsToDbPayload(validation.payload);

  if (Object.keys(dbPayload).length === 0) {
    return failure(
      "failed",
      "validation_failed",
      "Update patch contained no allowed fields.",
    );
  }

  const result = await updateLandRecordRow(
    supabase,
    recordId,
    expectedUpdatedAt,
    dbPayload,
  );

  if (!result.ok) {
    if (result.error.code === "PGRST116") {
      return resolveNoRowsUpdated(supabase, recordId);
    }

    return failure(
      "failed",
      "database_error",
      "Cloud update failed; the local working copy has not been changed.",
    );
  }

  const record = mapCloudRecordToDomain(result.data, {
    geometries: [],
    points: [],
    parties: [],
  });

  const syncedAt = new Date().toISOString();
  upsertCloudCacheRecord(userId, record, syncedAt);

  return { ok: true, state: "record_synced", record };
}

/**
 * An UPDATE matching zero rows is ambiguous by itself: the row may
 * not exist, may not belong to this user (RLS filters both cases
 * identically -- see note below), or may simply have moved to a
 * different `updated_at` since the caller last read it. This performs
 * a read-only, RLS-scoped lookup to tell a genuine stale-conflict
 * apart from not-found/not-owned.
 *
 * Note: RLS means a row belonging to another user is indistinguishable
 * from a row that does not exist at all -- returning `forbidden`
 * specifically (rather than `not_found`) for another user's row would
 * leak whether that id exists to a caller who has no right to know.
 * Both cases are reported as `not_found` here; this is a deliberate
 * safety choice, not a missing distinction.
 */
async function resolveNoRowsUpdated(
  supabase: SupabaseClient,
  recordId: string,
): Promise<WriteResult> {
  const current = await getLandRecordById(supabase, recordId);

  if (!current.ok || !current.data) {
    return failure(
      "failed",
      "not_found",
      "Record was not found, or does not belong to the current user.",
    );
  }

  // Reaching here means the row IS visible to this user (RLS already
  // filtered), so it exists and is owned by them -- the only reason
  // the UPDATE matched zero rows is that updated_at moved on.
  const serverRecord = mapCloudRecordToDomain(current.data, {
    geometries: [],
    points: [],
    parties: [],
  });

  // A conflict must never overwrite the last-known-good cache entry
  // with a state that looks synced -- the cache is intentionally left
  // untouched here (no upsertCloudCacheRecord call on this path).
  return {
    ok: false,
    state: "conflict",
    code: "stale_conflict",
    message: "This record changed elsewhere since it was last loaded.",
    serverRecord,
  };
}
