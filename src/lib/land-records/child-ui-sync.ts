// UI-facing child orchestration. The parent row must settle successfully
// before a child write is attempted. This keeps the page's save flow honest:
// parent and geometry have independent, explicit outcomes.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DrawingObject, PolygonDrawingObject } from "@/lib/drawing-types";
import type {
  ChildWriteResult,
  CreateGeometryInput,
  GeometryWritableFields,
  UpdateGeometryInput,
} from "./child-types";
import { createCloudGeometry, updateCloudGeometry } from "./geometry-write-coordinator";
import type { ParentSyncResult } from "./parent-ui-sync";

export type GeometryUiSyncStatus =
  | "local_only"
  | "geometry_synced"
  | "invalid_input"
  | "duplicate_conflict"
  | "stale_conflict"
  | "failed"
  | "network_error";

export type GeometryUiLocalOnlyReason =
  | "parent_not_synced"
  | "no_parent_geometry";

export interface GeometryUiSyncResult {
  status: GeometryUiSyncStatus;
  geometry?: DrawingObject;
  serverGeometry?: DrawingObject;
  message?: string;
  localOnlyReason?: GeometryUiLocalOnlyReason;
}

interface GeometryOperations {
  create(
    supabase: SupabaseClient,
    input: CreateGeometryInput,
  ): Promise<ChildWriteResult<DrawingObject>>;
  update(
    supabase: SupabaseClient,
    geometryId: string,
    patch: UpdateGeometryInput,
    expectedUpdatedAt: string,
  ): Promise<ChildWriteResult<DrawingObject>>;
}

const DEFAULT_OPERATIONS: GeometryOperations = {
  create: createCloudGeometry,
  update: updateCloudGeometry,
};

function writableGeometry(geometry: PolygonDrawingObject): GeometryWritableFields {
  return {
    geometryType: geometry.geometryType,
    category: geometry.category,
    name: geometry.name,
    coordinates: geometry.coordinates,
    lineStyle: geometry.lineStyle,
    color: geometry.color,
    weight: geometry.weight,
    isVisible: geometry.isVisible,
    areaSqm: geometry.areaSqm,
    areaHa: geometry.areaHa,
    areaAcre: geometry.areaAcre,
    perimeterM: geometry.perimeterM,
  };
}

function mapWriteResult(result: ChildWriteResult<DrawingObject>): GeometryUiSyncResult {
  if (result.ok) {
    return { status: "geometry_synced", geometry: result.data };
  }

  switch (result.code) {
    case "duplicate_conflict":
      return { status: "duplicate_conflict", message: result.message };
    case "stale_conflict":
      return {
        status: "stale_conflict",
        message: result.message,
        serverGeometry: result.serverData,
      };
    case "validation_failed":
    case "invalid_parent_id":
    case "invalid_child_id":
    case "legacy_child_id_requires_mapping":
      return { status: "invalid_input", message: result.message };
    case "network_error":
      return { status: "network_error", message: result.message };
    default:
      return { status: "failed", message: result.message };
  }
}

/**
 * Syncs the one authoritative parent-lot polygon after a successful parent
 * save. Proposed lots, lines, and other drawing objects remain local-only.
 * Never invents a child id and never writes a child under an unsettled parent.
 */
export async function syncParentGeometryToCloud(
  supabase: SupabaseClient,
  parentResult: ParentSyncResult,
  drawingObjects: DrawingObject[],
  operations: GeometryOperations = DEFAULT_OPERATIONS,
): Promise<GeometryUiSyncResult> {
  if (parentResult.status !== "core_record_synced" || !parentResult.record) {
    return { status: "local_only", localOnlyReason: "parent_not_synced" };
  }

  const candidates = drawingObjects.filter(
    (object): object is PolygonDrawingObject =>
      object.geometryType === "polygon" && object.category === "parent_lot",
  );

  if (candidates.length === 0) {
    return { status: "local_only", localOnlyReason: "no_parent_geometry" };
  }

  if (candidates.length > 1) {
    return {
      status: "invalid_input",
      message: "More than one parent-lot polygon is active; cloud geometry was not changed.",
    };
  }

  const geometry = candidates[0];
  const cachedGeometry = parentResult.record.geometries.find(
    (candidate) => candidate.id === geometry.id,
  );
  const otherCachedGeometry = parentResult.record.geometries.find(
    (candidate) => candidate.id !== geometry.id,
  );

  if (!cachedGeometry && otherCachedGeometry) {
    return {
      status: "invalid_input",
      message: "This parent already has a different cloud geometry; no replacement was attempted.",
    };
  }

  try {
    const fields = writableGeometry(geometry);
    const result = cachedGeometry
      ? await operations.update(
          supabase,
          geometry.id,
          fields,
          cachedGeometry.updatedAt,
        )
      : await operations.create(supabase, {
          id: geometry.id,
          landRecordId: parentResult.record.id,
          ...fields,
        });

    return mapWriteResult(result);
  } catch (error) {
    return {
      status: "network_error",
      message: error instanceof Error ? error.message : "Unknown geometry sync error.",
    };
  }
}
