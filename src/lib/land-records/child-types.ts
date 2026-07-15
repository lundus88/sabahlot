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
