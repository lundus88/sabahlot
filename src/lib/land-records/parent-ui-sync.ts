// Sprint 02C-2: UI-facing orchestration for the parent land_records
// cloud save flow. Wraps the already-merged Sprint 02C
// write-coordinator (createCloudLandRecord/updateCloudLandRecord) with
// the one decision the UI needs that the coordinator itself does not
// make: whether THIS local record has already been synced before, and
// if so, which server `updated_at` to use for optimistic concurrency.
//
// land_records ONLY. This module never reads or writes
// land_record_geometries, land_points, land_parties, or documents, and
// never touches src/lib/local-lots.ts or its storage key.

import type { SupabaseClient } from "@supabase/supabase-js";

import { isCloudWriteEnabled } from "./feature-gate";
import { readCloudCache, upsertCloudCacheRecord } from "./local-cache";
import { isStableCloudId } from "./types";
import type { CloudLandRecord, LandRecordWritableFields, WriteErrorCode } from "./types";
import { createCloudLandRecord, updateCloudLandRecord } from "./write-coordinator";

// Distinct from WriteSyncState (write-coordinator.ts) on purpose: this
// is the smaller set of outcomes the *UI* needs to render distinctly
// (see Sprint 02C-2 brief, "UX minimum"), not the full write-coordinator
// vocabulary. "saving" is intentionally not a member here -- callers set
// that in their own state immediately before invoking this function;
// this function only ever returns a settled outcome.
export type ParentSyncStatus =
  | "local_only"
  | "no_session"
  | "core_record_synced"
  | "invalid_input"
  | "duplicate_conflict"
  | "stale_conflict"
  | "failed"
  | "network_error";

// Distinguishes the two different reasons a record stays local-only
// without attempting a cloud write at all -- neither is an error.
export type ParentSyncLocalOnlyReason = "gate_disabled" | "legacy_id";

export interface ParentSyncResult {
  status: ParentSyncStatus;
  record?: CloudLandRecord;
  serverRecord?: CloudLandRecord;
  errorCode?: WriteErrorCode;
  message?: string;
  localOnlyReason?: ParentSyncLocalOnlyReason;
}

export interface ParentSyncInput extends LandRecordWritableFields {
  // The stable local id (see local-lots.ts createId()) already saved
  // locally by the caller. Reused as-is as the cloud primary key
  // (ADR-001) -- never regenerated here.
  localId: string;
}

async function getAuthenticatedUserId(
  supabase: SupabaseClient,
): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Attempts to sync one local land record's parent row to
 * `land_records`. Always assumes the local save has already succeeded
 * before this is called -- this function never touches local storage,
 * only the cloud side.
 *
 * Decision order:
 *   1. Cloud write disabled (Dev-only gate, or NODE_ENV=production) ->
 *      `local_only` / `gate_disabled`. No network call at all.
 *   2. No authenticated session -> `no_session`. No network call.
 *   3. `localId` is not a stable UUID (pre-crypto.randomUUID legacy id)
 *      -> `local_only` / `legacy_id`. No network call -- see ADR-001.
 *   4. Otherwise: look up this id in the current user's cloud cache
 *      (written by a prior successful create/update via
 *      upsertCloudCacheRecord). Present -> UPDATE using that cached
 *      `updatedAt` for optimistic concurrency (ADR-003). Absent ->
 *      CREATE.
 *
 * Never throws -- any unexpected exception (genuine network failure,
 * thrown client error) is caught and reported as `network_error`,
 * exactly like every other failure path here: the caller's local copy
 * is never touched or assumed lost.
 */
export async function syncParentLandRecordToCloud(
  supabase: SupabaseClient,
  input: ParentSyncInput,
): Promise<ParentSyncResult> {
  if (!isCloudWriteEnabled()) {
    return { status: "local_only", localOnlyReason: "gate_disabled" };
  }

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) {
    return { status: "no_session" };
  }

  if (!isStableCloudId(input.localId)) {
    return { status: "local_only", localOnlyReason: "legacy_id" };
  }

  const { localId, ...fields } = input;

  try {
    const cached = readCloudCache(userId)?.records.find(
      (record) => record.id === localId,
    );

    const result = cached
      ? await updateCloudLandRecord(supabase, localId, fields, cached.updatedAt)
      : await createCloudLandRecord(supabase, { id: localId, ...fields });

    if (result.ok) {
      // Parent writes return only the land_records row. Preserve child rows
      // already loaded into the per-user cache; replacing them with the
      // coordinator's empty child arrays would discard the server
      // `updatedAt` values required by child optimistic concurrency.
      const record = cached
        ? {
            ...result.record,
            geometries: cached.geometries,
            points: cached.points,
            parties: cached.parties,
          }
        : result.record;

      if (cached) {
        upsertCloudCacheRecord(userId, record, new Date().toISOString());
      }

      return { status: "core_record_synced", record };
    }

    switch (result.code) {
      case "unauthenticated":
        return { status: "no_session", errorCode: result.code, message: result.message };

      case "legacy_id_requires_migration_mapping":
        return { status: "local_only", localOnlyReason: "legacy_id" };

      case "validation_failed":
      case "invalid_record_id":
        return { status: "invalid_input", errorCode: result.code, message: result.message };

      case "duplicate_conflict":
        return { status: "duplicate_conflict", errorCode: result.code, message: result.message };

      case "stale_conflict":
        return {
          status: "stale_conflict",
          errorCode: result.code,
          message: result.message,
          serverRecord: result.serverRecord,
        };

      case "not_found":
      case "forbidden":
      case "network_error":
      case "database_error":
      default:
        return { status: "failed", errorCode: result.code, message: result.message };
    }
  } catch (error) {
    return {
      status: "network_error",
      message: error instanceof Error ? error.message : "Unknown cloud sync error.",
    };
  }
}
