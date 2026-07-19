// Sprint 02D-1A: shared contract for child-table cloud writes
// (geometry now; points/parties in later sprints reuse this same
// contract). Deliberately separate from types.ts's WriteErrorCode /
// WriteSyncState (Sprint 02C, land_records only) -- child rows have a
// parent-ownership dimension land_records doesn't, and geometry alone
// can never legitimately report `core_record_synced`.

import type {
  DrawingCoordinate,
  DrawingObjectCategory,
  DrawingGeometryType,
  DrawingLineStyle,
} from "@/lib/drawing-types";
import type { CloudPointType } from "./types";

export type ChildErrorCode =
  | "unauthenticated"
  | "invalid_parent_id"
  | "invalid_child_id"
  | "legacy_child_id_requires_mapping"
  | "validation_failed"
  | "not_found_or_forbidden"
  | "duplicate_conflict"
  | "stale_conflict"
  | "network_error"
  | "database_error";

// Shared across all child tables (present sprint: geometry only).
// Values this sprint's geometry functions can actually return:
// local_only, saving, geometry_synced, failed, conflict, partial_sync.
// The rest (record_synced, points_synced, parties_synced,
// core_record_synced, points_out_of_sync) are declared here so the
// union is stable for future sprints, but geometry code never produces
// them -- see child-write-coordinator tests asserting this.
export type ChildSyncState =
  | "local_only"
  | "saving"
  | "record_synced"
  | "geometry_synced"
  | "points_synced"
  | "parties_synced"
  | "core_record_synced"
  | "points_out_of_sync"
  | "partial_sync"
  | "failed"
  | "conflict";

export interface ChildWriteSuccess<TDomain> {
  ok: true;
  state: ChildSyncState;
  data: TDomain;
}

export interface ChildWriteFailure<TDomain> {
  ok: false;
  state: ChildSyncState;
  code: ChildErrorCode;
  message: string;
  // Populated only for code === 'stale_conflict'.
  serverData?: TDomain;
}

export type ChildWriteResult<TDomain> =
  | ChildWriteSuccess<TDomain>
  | ChildWriteFailure<TDomain>;

// ---------------------------------------------------------------------
// Geometry-specific writable fields. Deliberately its own flat
// interface (not a reuse of the DrawingObject discriminated union) so
// validation/comparison logic doesn't have to fight TypeScript's
// non-distributive Partial<Union> behavior -- same pattern as
// LandRecordWritableFields in types.ts.
// ---------------------------------------------------------------------
export interface GeometryWritableFields {
  geometryType: DrawingGeometryType;
  category: DrawingObjectCategory;
  name?: string | null;
  coordinates: DrawingCoordinate[];
  lineStyle?: DrawingLineStyle;
  color?: string | null;
  weight?: number | null;
  isVisible?: boolean;
  areaSqm?: number | null;
  areaHa?: number | null;
  areaAcre?: number | null;
  perimeterM?: number | null;
  lengthM?: number | null;
  startBearing?: number | null;
  endBearing?: number | null;
}

export interface CreateGeometryInput extends GeometryWritableFields {
  // Stable child UUID, reused from the local DrawingObject.id -- never
  // generated fresh per save/retry (see geometry-validation.ts).
  id: string;
  // Parent land_records.id. Required on create; never accepted again
  // on update (a geometry's parent cannot change).
  landRecordId: string;
}

export type UpdateGeometryInput = Partial<GeometryWritableFields>;

// ---------------------------------------------------------------------
// Sprint 02D-1B: point-specific writable fields. CREATE-ONLY (ADR-011)
// -- land_points has no updated_at column, so there is deliberately no
// UpdatePointInput here, and none should be added without a new ADR +
// a migration adding that column. Delete is separately deferred by
// ADR-013.
// ---------------------------------------------------------------------
export interface PointWritableFields {
  pointType: CloudPointType;
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
  distanceDifferenceM?: number | null;
  bearingDegrees?: number | null;
  note?: string | null;
  // ISO 8601 string. Optional -- the captured_at column defaults to
  // now() at the database level if this is omitted.
  capturedAt?: string;
}

export interface CreatePointInput extends PointWritableFields {
  // Stable child UUID, reused from the local point's id -- never
  // regenerated per save/retry (ADR-001).
  id: string;
  // Parent land_records.id. Nullable BY DESIGN, unlike geometry: a
  // point may be captured before being attached to any saved
  // land_record (see the land_points migration's "two-branch
  // ownership" comment). null means an unlinked point, owned via
  // captured_by instead of via the parent.
  landRecordId?: string | null;
}
