// Sprint parties cloud write: authenticated cloud create/update
// coordinator for land_parties. land_parties ONLY -- no land record,
// geometry, point, or document is ever written here.
//
// Conflict strategy matches land_records/geometry exactly (per
// docs/ai/DATABASE_CONTRACT.md: "Same INSERT+23505 / atomic-UPDATE
// pattern as land_records/geometries -- updated_at column exists"),
// confirmed directly against
// supabase/migrations/202607110007_create_land_parties.sql before this
// sprint began: land_parties has both an `updated_at` column and a
// `land_parties_set_updated_at` trigger.
//
// id_number (ADR-014) is never accepted as writable input at all --
// PartyWritableFields (parties-validation.ts) has no such field, so
// there is no code path here that could forward it to Supabase.
//
// Not wired into any UI -- this sprint is backend/repository only, same
// deferred-wiring posture as geometry (Sprint 02D-1A) and points
// (Sprint 02D-1B).
//
// Unlike geometry-write-coordinator.ts, this file does not enforce a
// "one active X per parent" rule -- no such rule was designed for
// parties (a land record legitimately has multiple parties: owner,
// applicant, heir, surveyor, witness, village head), so no
// listPartiesForLandRecord-equivalent pre-check exists here.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createPartyRow,
  getPartyById,
  mapPartyFieldsToDbPayload,
  updatePartyRow,
} from "./parties-repository";
import { isCloudWriteEnabled } from "./feature-gate";
import { mapCloudParty } from "./mapper";
import { upsertCachedParty } from "./parties-cache";
import { isStableCloudId } from "./types";
import type { CloudLandParty } from "./types";
import type { ChildSyncState, ChildWriteResult } from "./child-types";
import {
  arePartyPayloadsEquivalent,
  buildComparablePartyPayload,
  extractComparableFieldsFromPartyRow,
  validateCreatePartyInput,
  validateUpdatePartyInput,
  type ComparablePartyFieldName,
  type CreatePartyInput,
  type UpdatePartyInput,
} from "./parties-validation";

function failure(
  state: ChildSyncState,
  code: Extract<ChildWriteResult<CloudLandParty>, { ok: false }>["code"],
  message: string,
): ChildWriteResult<CloudLandParty> {
  return { ok: false, state, code, message };
}

async function getAuthenticatedUserId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/**
 * Creates one land_parties row under `input.landRecordId` for the
 * authenticated caller. RLS confirms `landRecordId` is owned by the
 * caller -- this function never accepts an owner/user id directly and
 * cannot bypass that check.
 *
 * Only ever returns `parties_synced` on success -- never
 * `core_record_synced`/`record_synced`, which require the parent,
 * geometry, and points to also be confirmed synced.
 */
export async function createCloudParty(
  supabase: SupabaseClient,
  input: CreatePartyInput,
): Promise<ChildWriteResult<CloudLandParty>> {
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
      "Party id is not a stable UUID; legacy local party ids are not uploaded automatically.",
    );
  }

  const validation = validateCreatePartyInput(input);
  if (!validation.ok) {
    return failure("failed", "validation_failed", validation.error);
  }

  const dbPayload = mapPartyFieldsToDbPayload(validation.payload);
  const result = await createPartyRow(supabase, input.id, input.landRecordId, dbPayload);

  if (!result.ok) {
    if (result.error.code === "23505") {
      return resolveDuplicatePartyCreate(supabase, userId, validation.payload);
    }

    return failure(
      "failed",
      "database_error",
      "Cloud party create failed; the local working copy has not been changed.",
    );
  }

  const party = mapCloudParty(result.data);
  const syncedAt = new Date().toISOString();
  upsertCachedParty(userId, input.landRecordId, party, syncedAt);

  return { ok: true, state: "parties_synced", data: party };
}

/**
 * A 23505 on create means a row with this id already exists. Safe for
 * a genuine retry (double-click, or a request that succeeded but whose
 * response was lost) PROVIDED the existing row's allowlisted content
 * matches what this attempt asked to create -- same three-outcome
 * pattern as land_records/geometry/points: unreadable/not-owned ->
 * not_found_or_forbidden; owned but different content ->
 * duplicate_conflict (row untouched, cache untouched, no automatic
 * retry); owned and matching -> verified success.
 */
async function resolveDuplicatePartyCreate(
  supabase: SupabaseClient,
  userId: string,
  requestedPayload: CreatePartyInput,
): Promise<ChildWriteResult<CloudLandParty>> {
  const existing = await getPartyById(supabase, requestedPayload.id);

  if (!existing.ok || !existing.data) {
    return failure(
      "failed",
      "not_found_or_forbidden",
      "Duplicate party could not be confirmed as accessible to the current user.",
    );
  }

  if (existing.data.land_record_id !== requestedPayload.landRecordId) {
    // Same party id somehow tied to a different parent -- do not reveal
    // details, treat identically to "not accessible".
    return failure(
      "failed",
      "not_found_or_forbidden",
      "Duplicate party could not be confirmed as accessible to the current user.",
    );
  }

  const requestedComparable = buildComparablePartyPayload(requestedPayload);
  const existingComparable = extractComparableFieldsFromPartyRow(
    existing.data,
    Object.keys(requestedComparable) as ComparablePartyFieldName[],
  );

  if (!arePartyPayloadsEquivalent(requestedComparable, existingComparable)) {
    return failure(
      "conflict",
      "duplicate_conflict",
      "A party with this id already exists with different content; this retry was not treated as a successful save.",
    );
  }

  const party = mapCloudParty(existing.data);
  const syncedAt = new Date().toISOString();
  upsertCachedParty(userId, existing.data.land_record_id, party, syncedAt);

  return { ok: true, state: "parties_synced", data: party };
}

/**
 * Updates one land_parties row owned (via its parent) by the
 * authenticated caller. `expectedUpdatedAt` must be the `updated_at`
 * value the caller last read/saved for this party -- the UPDATE is
 * scoped by both `id` and that value, so a row changed since (another
 * device, or a concurrent save) matches zero rows and is reported as
 * `conflict`, never silently overwritten. The parent (`land_record_id`)
 * cannot be changed -- it is structurally absent from UpdatePartyInput
 * and never accepted here.
 */
export async function updateCloudParty(
  supabase: SupabaseClient,
  partyId: string,
  patch: UpdatePartyInput,
  expectedUpdatedAt: string,
): Promise<ChildWriteResult<CloudLandParty>> {
  if (!isCloudWriteEnabled()) {
    return failure("local_only", "database_error", "Cloud write is disabled in this environment.");
  }

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) {
    return failure("failed", "unauthenticated", "No authenticated session.");
  }

  if (!isStableCloudId(partyId)) {
    return failure("failed", "invalid_child_id", "Party id is not a valid UUID.");
  }

  const validation = validateUpdatePartyInput(patch);
  if (!validation.ok) {
    return failure("failed", "validation_failed", validation.error);
  }

  const dbPayload = mapPartyFieldsToDbPayload(validation.payload);
  if (Object.keys(dbPayload).length === 0) {
    return failure("failed", "validation_failed", "Update patch contained no allowed fields.");
  }

  const result = await updatePartyRow(supabase, partyId, expectedUpdatedAt, dbPayload);

  if (!result.ok) {
    if (result.error.code === "PGRST116") {
      return resolveNoRowsUpdatedParty(supabase, partyId);
    }

    return failure(
      "failed",
      "database_error",
      "Cloud party update failed; the local working copy has not been changed.",
    );
  }

  const party = mapCloudParty(result.data);
  const syncedAt = new Date().toISOString();
  upsertCachedParty(userId, result.data.land_record_id, party, syncedAt);

  return { ok: true, state: "parties_synced", data: party };
}

/**
 * An UPDATE matching zero rows is ambiguous: the row may not exist, may
 * not be accessible to this user (RLS filters both identically -- see
 * note below), or may simply have moved to a different `updated_at`.
 * Read-only diagnosis distinguishes a genuine stale-conflict from
 * not-found/not-owned, without ever revealing to the caller whether an
 * inaccessible id belongs to someone else.
 */
async function resolveNoRowsUpdatedParty(
  supabase: SupabaseClient,
  partyId: string,
): Promise<ChildWriteResult<CloudLandParty>> {
  const current = await getPartyById(supabase, partyId);

  if (!current.ok || !current.data) {
    return failure(
      "failed",
      "not_found_or_forbidden",
      "Party was not found, or is not accessible to the current user.",
    );
  }

  // Reaching here means the row IS visible to this user (RLS already
  // filtered via the parent land_record's owner_id), so the only reason
  // the UPDATE matched zero rows is that updated_at moved on.
  const serverParty = mapCloudParty(current.data);

  // Cache is intentionally left untouched here -- a conflict must never
  // overwrite the last-known-good cache entry with a state that looks
  // synced.
  return {
    ok: false,
    state: "conflict",
    code: "stale_conflict",
    message: "This party changed elsewhere since it was last loaded.",
    serverData: serverParty,
  };
}
