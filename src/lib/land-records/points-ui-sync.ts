// Sprint points cloud-write UI wiring: UI-facing orchestration for
// syncing FieldGpsLite's captured point list (src/components/
// FieldGpsLite.tsx's `points` state, reported up to src/app/page.tsx
// via a new onPointsChange callback prop) to land_points after a
// successful parent (+ geometry) save. Follows the same overall shape
// as parties-ui-sync.ts's syncPdfIdentitiesToCloud: the parent row
// must already be core_record_synced before any child write is
// attempted, and every path reports a settled outcome rather than
// throwing.
//
// Unlike parties, a captured point already carries its own stable id
// from the moment it is captured (FieldGpsLite's createFieldGpsId(),
// src/lib/field-gps.ts) -- there is no "generate on first sync" step
// here. ADR-001 requires that id be reused verbatim, never
// regenerated, so this file never calls crypto.randomUUID() itself.
//
// CREATE-ONLY (ADR-011): createCloudPoint has no update counterpart --
// land_points has no updated_at column. A point that was already
// synced and is then edited locally (same id, different content) is
// re-CREATEd on every subsequent save; points-write-coordinator.ts's
// already PASS-verified 23505-retry logic (ADR-002) resolves this
// structurally: identical content -> verified success (points_synced);
// changed content -> this file reports it as `points_out_of_sync`
// (ADR-009/ADR-011), never a false `points_synced`, and the cloud row
// is left untouched. This sprint does not modify points-repository.ts /
// points-write-coordinator.ts / points-validation.ts / points-cache.ts
// in any way.
//
// land_points ONLY. Never reads or writes land_records,
// land_record_geometries, land_parties, or documents, and never
// touches src/lib/local-lots.ts or its storage key.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChildWriteResult, CreatePointInput } from "./child-types";
import type { CloudLandPoint } from "./types";
import { createCloudPoint } from "./points-write-coordinator";
import type { ParentSyncResult } from "./parent-ui-sync";

export type PointUiSyncStatus =
  | "local_only"
  | "points_synced"
  | "points_out_of_sync"
  | "invalid_input"
  | "failed"
  | "network_error";

// Distinguishes the one reason a point stays local-only without
// attempting a cloud write at all -- not an error. Mirrors
// PartyUiLocalOnlyReason in parties-ui-sync.ts.
export type PointUiLocalOnlyReason = "parent_not_synced";

// Decoupled from FieldGpsPoint on purpose -- the caller (page.tsx)
// maps FieldGpsPoint's field names (accuracyMeters,
// altitudeAccuracyMeters, timestamp) onto this shape's land_points
// column-aligned names (accuracyM, altitudeAccuracyM, capturedAt), and
// decides the fixed `pointType` classification there, next to its own
// mapping comment -- same division of responsibility as
// PartyIdentityInput / CloudPartyRole in parties-ui-sync.ts.
export interface PointCaptureInput {
  id: string;
  pointType: CreatePointInput["pointType"];
  label?: string | null;
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracyM?: number | null;
  altitudeAccuracyM?: number | null;
  heading?: number | null;
  speed?: number | null;
  qualityGrade?: "A" | "B" | "C" | "D" | null;
  captureMethod?: "single" | "averaged" | "best-fix" | "manual-key-in" | null;
  source?: "phone-gps" | "keyed-coordinate" | null;
  sampleCount?: number | null;
  occupationSeconds?: number | null;
  note?: string | null;
  capturedAt?: string;
}

export interface PointUiSyncResult {
  id: string;
  status: PointUiSyncStatus;
  point?: CloudLandPoint;
  message?: string;
  localOnlyReason?: PointUiLocalOnlyReason;
}

interface PointOperations {
  create(
    supabase: SupabaseClient,
    input: CreatePointInput,
  ): Promise<ChildWriteResult<CloudLandPoint>>;
}

const DEFAULT_OPERATIONS: PointOperations = {
  create: createCloudPoint,
};

function mapWriteResult(
  id: string,
  result: ChildWriteResult<CloudLandPoint>,
): PointUiSyncResult {
  if (result.ok) {
    return { id, status: "points_synced", point: result.data };
  }

  switch (result.code) {
    // The only reachable conflict code for a create-only path
    // (ADR-002/ADR-011): same id, different content than the cloud
    // row already holds. There is no safe update path to reconcile
    // it, so this is reported as "the local copy no longer matches
    // the cloud" rather than either a silent no-op or a false
    // points_synced.
    case "duplicate_conflict":
      return { id, status: "points_out_of_sync", message: result.message };
    case "validation_failed":
    case "invalid_parent_id":
    case "legacy_child_id_requires_mapping":
      return { id, status: "invalid_input", message: result.message };
    case "network_error":
      return { id, status: "network_error", message: result.message };
    default:
      return { id, status: "failed", message: result.message };
  }
}

/**
 * Syncs each captured field point to land_points after a successful
 * parent (+ geometry) save. Every point already has its own stable id
 * (assigned at capture time) -- this function never generates one.
 *
 * Never writes a child under an unsettled parent, matching
 * syncParentGeometryToCloud/syncPdfIdentitiesToCloud's ordering
 * guarantee: if parentResult is not core_record_synced, every point
 * reports local_only with zero cloud calls.
 *
 * A thrown error on one point is contained to that point's own result
 * and never blocks the remaining points in the same call.
 */
export async function syncFieldGpsPointsToCloud(
  supabase: SupabaseClient,
  parentResult: ParentSyncResult,
  points: PointCaptureInput[],
  operations: PointOperations = DEFAULT_OPERATIONS,
): Promise<PointUiSyncResult[]> {
  if (parentResult.status !== "core_record_synced" || !parentResult.record) {
    return points.map((point) => ({
      id: point.id,
      status: "local_only",
      localOnlyReason: "parent_not_synced",
    }));
  }

  const landRecordId = parentResult.record.id;
  const results: PointUiSyncResult[] = [];

  for (const point of points) {
    try {
      const result = await operations.create(supabase, {
        id: point.id,
        landRecordId,
        pointType: point.pointType,
        label: point.label,
        latitude: point.latitude,
        longitude: point.longitude,
        altitude: point.altitude,
        accuracyM: point.accuracyM,
        altitudeAccuracyM: point.altitudeAccuracyM,
        heading: point.heading,
        speed: point.speed,
        qualityGrade: point.qualityGrade,
        captureMethod: point.captureMethod,
        source: point.source,
        sampleCount: point.sampleCount,
        occupationSeconds: point.occupationSeconds,
        note: point.note,
        capturedAt: point.capturedAt,
      });

      results.push(mapWriteResult(point.id, result));
    } catch (error) {
      results.push({
        id: point.id,
        status: "network_error",
        message: error instanceof Error ? error.message : "Unknown point sync error.",
      });
    }
  }

  return results;
}
