// Sprint 02D-1B: authenticated cloud create coordinator for
// land_points. land_points ONLY -- no land record, geometry, party, or
// document write happens here.
//
// CREATE-ONLY (ADR-011): no updateCloudPoint, no deleteCloudPoint
// exist, and none should be added without a new ADR + a migration
// adding land_points.updated_at (delete is separately deferred by
// ADR-013). land_points has no updated_at column and no update
// trigger -- confirmed directly against
// supabase/migrations/202607110006_create_land_points.sql before this
// sprint began.
//
// Not wired into src/app/page.tsx or any UI -- same deferred-wiring
// posture Sprint 02D-1A left for geometry.
//
// "Read Point from cloud" / "Load existing Points" already exist and
// are UNMODIFIED by this sprint: getLandPoints (cloud-repository.ts,
// Sprint 02B) and loadCloudLandRecords (index.ts, Sprint 02B) already
// fetch and map land_points rows for a given land_record via
// mapCloudPoint. This sprint only adds the missing create path and
// wires its result into the same per-user cache those reads already
// populate -- see points-cache.ts.

import type { SupabaseClient } from "@supabase/supabase-js";

import { createPointRow, getPointById, mapPointFieldsToDbPayload } from "./points-repository";
import { isCloudWriteEnabled } from "./feature-gate";
import { mapCloudPoint } from "./mapper";
import { upsertCachedPoint } from "./points-cache";
import { isStableCloudId } from "./types";
import type { CloudLandPoint } from "./types";
import type { ChildSyncState, ChildWriteResult, CreatePointInput } from "./child-types";
import {
  arePointPayloadsEquivalent,
  buildComparablePointPayload,
  extractComparableFieldsFromPointRow,
  validateCreatePointInput,
  type ComparablePointFieldName,
} from "./points-validation";

function failure(
  state: ChildSyncState,
  code: Extract<ChildWriteResult<CloudLandPoint>, { ok: false }>["code"],
  message: string,
): ChildWriteResult<CloudLandPoint> {
  return { ok: false, state, code, message };
}

async function getAuthenticatedUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/**
 * Creates one land_points row for the authenticated caller.
 * `input.landRecordId` may be null (unlinked point) -- RLS then
 * requires `captured_by` (derived here from the session, never from
 * the caller, per ADR-005) to match the current user instead of
 * checking a parent's owner_id. If `landRecordId` is provided, RLS
 * checks it via the parent land_record's owner_id (see the migration's
 * two-branch policies) -- this function does not and cannot bypass
 * that check.
 *
 * Only ever returns `points_synced` on success -- never
 * `core_record_synced`/`record_synced`/`geometry_synced`, which
 * require the parent/geometry/parties to also be confirmed synced.
 */
export async function createCloudPoint(
  supabase: SupabaseClient,
  input: CreatePointInput,
): Promise<ChildWriteResult<CloudLandPoint>> {
  if (!isCloudWriteEnabled()) {
    return failure("local_only", "database_error", "Cloud write is disabled in this environment.");
  }

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) {
    return failure("failed", "unauthenticated", "No authenticated session.");
  }

  if (!isStableCloudId(input.id)) {
    return failure(
      "failed",
      "legacy_child_id_requires_mapping",
      "Point id is not a stable UUID; legacy local point ids are not uploaded automatically.",
    );
  }

  if (
    input.landRecordId !== undefined &&
    input.landRecordId !== null &&
    !isStableCloudId(input.landRecordId)
  ) {
    return failure("failed", "invalid_parent_id", "landRecordId is not a valid UUID.");
  }

  const validation = validateCreatePointInput(input);
  if (!validation.ok) {
    return failure("failed", "validation_failed", validation.error);
  }

  const dbPayload = mapPointFieldsToDbPayload(validation.payload);
  const landRecordId = validation.payload.landRecordId ?? null;

  const result = await createPointRow(supabase, input.id, landRecordId, userId, dbPayload);

  if (!result.ok) {
    if (result.error.code === "23505") {
      return resolveDuplicatePointCreate(supabase, userId, validation.payload);
    }

    return failure(
      "failed",
      "database_error",
      "Cloud point create failed; the local working copy has not been changed.",
    );
  }

  const point = mapCloudPoint(result.data);
  const syncedAt = new Date().toISOString();
  upsertCachedPoint(userId, result.data.land_record_id, point, syncedAt);

  return { ok: true, state: "points_synced", data: point };
}

/**
 * A 23505 on create means a row with this id already exists. Safe for
 * a genuine retry (double-click, or a request that succeeded but whose
 * response was lost) PROVIDED the existing row's allowlisted content
 * matches what this attempt asked to create -- same three-outcome
 * pattern as land_records/geometry: unreadable/not-owned ->
 * not_found_or_forbidden; owned but different content ->
 * duplicate_conflict (row/cache untouched, no automatic retry); owned
 * and matching -> verified success.
 */
async function resolveDuplicatePointCreate(
  supabase: SupabaseClient,
  userId: string,
  requestedPayload: CreatePointInput,
): Promise<ChildWriteResult<CloudLandPoint>> {
  const existing = await getPointById(supabase, requestedPayload.id);

  if (!existing.ok || !existing.data) {
    return failure(
      "failed",
      "not_found_or_forbidden",
      "Duplicate point could not be confirmed as accessible to the current user.",
    );
  }

  const requestedLandRecordId = requestedPayload.landRecordId ?? null;
  if (existing.data.land_record_id !== requestedLandRecordId) {
    // Same point id somehow tied to a different parent (or a different
    // link state) -- do not reveal details, treat identically to "not
    // accessible".
    return failure(
      "failed",
      "not_found_or_forbidden",
      "Duplicate point could not be confirmed as accessible to the current user.",
    );
  }

  const requestedComparable = buildComparablePointPayload(requestedPayload);
  const existingComparable = extractComparableFieldsFromPointRow(
    existing.data,
    Object.keys(requestedComparable) as ComparablePointFieldName[],
  );

  if (!arePointPayloadsEquivalent(requestedComparable, existingComparable)) {
    return failure(
      "conflict",
      "duplicate_conflict",
      "A point with this id already exists with different content; this retry was not treated as a successful save.",
    );
  }

  const point = mapCloudPoint(existing.data);
  const syncedAt = new Date().toISOString();
  upsertCachedPoint(userId, existing.data.land_record_id, point, syncedAt);

  return { ok: true, state: "points_synced", data: point };
}
