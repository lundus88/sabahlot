// Sprint 02D-1A: authenticated cloud create/update coordinator for
// land_record_geometries. land_record_geometries ONLY -- no land
// record, points, parties, or documents are ever written here.
//
// Not wired into src/app/page.tsx -- see the Sprint 02D-1A report for
// why and where a future sprint should connect it.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createGeometryRow,
  getGeometryById,
  listGeometriesForLandRecord,
  mapGeometryFieldsToDbPayload,
  updateGeometryRow,
} from "./geometry-repository";
import { isCloudWriteEnabled } from "./feature-gate";
import { mapCloudGeometryToDrawingObject } from "./mapper";
import { upsertCachedGeometry } from "./geometry-cache";
import { isStableCloudId } from "./types";
import type { ChildSyncState, ChildWriteResult, CreateGeometryInput, UpdateGeometryInput } from "./child-types";
import {
  areGeometryPayloadsEquivalent,
  buildComparableGeometryPayload,
  extractComparableFieldsFromGeometryRow,
  validateCreateGeometryInput,
  validateUpdateGeometryInput,
  type ComparableGeometryFieldName,
} from "./geometry-validation";
import type { DrawingObject } from "@/lib/drawing-types";

function failure(
  state: ChildSyncState,
  code: Extract<ChildWriteResult<DrawingObject>, { ok: false }>["code"],
  message: string,
): ChildWriteResult<DrawingObject> {
  return { ok: false, state, code, message };
}

async function getAuthenticatedUserId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/**
 * Creates one land_record_geometries row under `input.landRecordId`
 * for the authenticated caller. RLS confirms `landRecordId` is owned
 * by the caller -- this function never accepts an owner/user id
 * directly and cannot bypass that check.
 *
 * Enforces "one active geometry per parent" at the application level
 * (see the Sprint 02D-1A report, section 13): if the parent already
 * has a geometry with a DIFFERENT id, this create is rejected. This
 * check has an inherent TOCTOU gap under truly concurrent requests
 * (no unique constraint exists on land_record_geometries to make it
 * airtight) -- documented as a MEDIUM finding, not silently hidden.
 *
 * Only ever returns `geometry_synced` on success -- never
 * `core_record_synced`/`record_synced`, which require the parent,
 * points, and parties to also be confirmed synced.
 */
export async function createCloudGeometry(
  supabase: SupabaseClient,
  input: CreateGeometryInput,
): Promise<ChildWriteResult<DrawingObject>> {
  if (!isCloudWriteEnabled()) {
    return failure("local_only", "database_error", "Cloud write is disabled in this environment.");
  }

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) {
    return failure("failed", "unauthenticated", "No authenticated session.");
  }

  if (!isStableCloudId(input.landRecordId)) {
    return failure("failed", "invalid_parent_id", "landRecordId is not a valid UUID.");
  }

  if (!isStableCloudId(input.id)) {
    return failure(
      "failed",
      "legacy_child_id_requires_mapping",
      "Geometry id is not a stable UUID; legacy local geometry ids are not uploaded automatically.",
    );
  }

  const validation = validateCreateGeometryInput(input);
  if (!validation.ok) {
    return failure("failed", "validation_failed", validation.error);
  }

  const existingForParent = await listGeometriesForLandRecord(supabase, input.landRecordId);
  if (!existingForParent.ok) {
    return failure("failed", "database_error", "Could not verify existing geometry for this record.");
  }
  const conflictingActiveGeometry = existingForParent.data.find(
    (row) => row.id !== input.id,
  );
  if (conflictingActiveGeometry) {
    return failure(
      "failed",
      "validation_failed",
      "This land record already has an active geometry; update it instead of creating a new one.",
    );
  }

  const dbPayload = mapGeometryFieldsToDbPayload(validation.payload);
  const result = await createGeometryRow(supabase, input.id, input.landRecordId, dbPayload);

  if (!result.ok) {
    if (result.error.code === "23505") {
      return resolveDuplicateGeometryCreate(supabase, userId, validation.payload);
    }

    return failure(
      "failed",
      "database_error",
      "Cloud geometry create failed; the local working copy has not been changed.",
    );
  }

  const geometry = mapCloudGeometryToDrawingObject(result.data);
  const syncedAt = new Date().toISOString();
  upsertCachedGeometry(userId, input.landRecordId, geometry, syncedAt);

  return { ok: true, state: "geometry_synced", data: geometry };
}

/**
 * A 23505 on create means a row with this id already exists. Safe for
 * a genuine retry (double-click, or a request that succeeded but
 * whose response was lost) PROVIDED the existing row's allowlisted
 * content matches what this attempt asked to create -- same
 * three-outcome pattern as land_records (Sprint 02C-1 Patch 1):
 * unreadable/not-owned -> not_found_or_forbidden; owned but different
 * content -> duplicate_conflict (row untouched, cache untouched, no
 * automatic retry); owned and matching -> verified success.
 */
async function resolveDuplicateGeometryCreate(
  supabase: SupabaseClient,
  userId: string,
  requestedPayload: CreateGeometryInput,
): Promise<ChildWriteResult<DrawingObject>> {
  const existing = await getGeometryById(supabase, requestedPayload.id);

  if (!existing.ok || !existing.data) {
    return failure(
      "failed",
      "not_found_or_forbidden",
      "Duplicate geometry could not be confirmed as accessible to the current user.",
    );
  }

  if (existing.data.land_record_id !== requestedPayload.landRecordId) {
    // Same geometry id somehow tied to a different parent -- do not
    // reveal details, treat identically to "not accessible".
    return failure(
      "failed",
      "not_found_or_forbidden",
      "Duplicate geometry could not be confirmed as accessible to the current user.",
    );
  }

  const requestedComparable = buildComparableGeometryPayload(requestedPayload);
  const existingComparable = extractComparableFieldsFromGeometryRow(
    existing.data,
    Object.keys(requestedComparable) as ComparableGeometryFieldName[],
  );

  if (!areGeometryPayloadsEquivalent(requestedComparable, existingComparable)) {
    return failure(
      "conflict",
      "duplicate_conflict",
      "A geometry with this id already exists with different content; this retry was not treated as a successful save.",
    );
  }

  const geometry = mapCloudGeometryToDrawingObject(existing.data);
  const syncedAt = new Date().toISOString();
  upsertCachedGeometry(userId, existing.data.land_record_id, geometry, syncedAt);

  return { ok: true, state: "geometry_synced", data: geometry };
}

/**
 * Updates one land_record_geometries row owned (via its parent) by the
 * authenticated caller. `expectedUpdatedAt` must be the `updated_at`
 * value the caller last read/saved for this geometry -- the UPDATE is
 * scoped by both `id` and that value, so a row changed since (another
 * device, or a concurrent save) matches zero rows and is reported as
 * `conflict`, never silently overwritten. The parent (`land_record_id`)
 * cannot be changed -- it is structurally absent from
 * UpdateGeometryInput and never accepted here.
 */
export async function updateCloudGeometry(
  supabase: SupabaseClient,
  geometryId: string,
  patch: UpdateGeometryInput,
  expectedUpdatedAt: string,
): Promise<ChildWriteResult<DrawingObject>> {
  if (!isCloudWriteEnabled()) {
    return failure("local_only", "database_error", "Cloud write is disabled in this environment.");
  }

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) {
    return failure("failed", "unauthenticated", "No authenticated session.");
  }

  if (!isStableCloudId(geometryId)) {
    return failure("failed", "invalid_child_id", "Geometry id is not a valid UUID.");
  }

  const validation = validateUpdateGeometryInput(patch);
  if (!validation.ok) {
    return failure("failed", "validation_failed", validation.error);
  }

  const dbPayload = mapGeometryFieldsToDbPayload(validation.payload);
  if (Object.keys(dbPayload).length === 0) {
    return failure("failed", "validation_failed", "Update patch contained no allowed fields.");
  }

  const result = await updateGeometryRow(supabase, geometryId, expectedUpdatedAt, dbPayload);

  if (!result.ok) {
    if (result.error.code === "PGRST116") {
      return resolveNoRowsUpdatedGeometry(supabase, geometryId);
    }

    return failure(
      "failed",
      "database_error",
      "Cloud geometry update failed; the local working copy has not been changed.",
    );
  }

  const geometry = mapCloudGeometryToDrawingObject(result.data);
  const syncedAt = new Date().toISOString();
  upsertCachedGeometry(userId, result.data.land_record_id, geometry, syncedAt);

  return { ok: true, state: "geometry_synced", data: geometry };
}

/**
 * An UPDATE matching zero rows is ambiguous: the row may not exist,
 * may not be accessible to this user (RLS filters both identically --
 * see note below), or may simply have moved to a different
 * `updated_at`. Read-only diagnosis distinguishes a genuine
 * stale-conflict from not-found/not-owned, without ever revealing to
 * the caller whether an inaccessible id belongs to someone else.
 */
async function resolveNoRowsUpdatedGeometry(
  supabase: SupabaseClient,
  geometryId: string,
): Promise<ChildWriteResult<DrawingObject>> {
  const current = await getGeometryById(supabase, geometryId);

  if (!current.ok || !current.data) {
    return failure(
      "failed",
      "not_found_or_forbidden",
      "Geometry was not found, or is not accessible to the current user.",
    );
  }

  // Reaching here means the row IS visible to this user (RLS already
  // filtered via the parent land_record's owner_id), so the only
  // reason the UPDATE matched zero rows is that updated_at moved on.
  const serverGeometry = mapCloudGeometryToDrawingObject(current.data);

  // Cache is intentionally left untouched here -- a conflict must
  // never overwrite the last-known-good cache entry with a state that
  // looks synced.
  return {
    ok: false,
    state: "conflict",
    code: "stale_conflict",
    message: "This geometry changed elsewhere since it was last loaded.",
    serverData: serverGeometry,
  };
}
