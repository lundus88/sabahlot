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
import type { CloudDocumentType, CloudPointType } from "./types";

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

// Shared across all child tables. Each child module only ever produces
// the state(s) it owns -- e.g. geometry code never produces
// "points_synced", points code never produces "documents_synced" -- see
// each module's own write-coordinator tests asserting this.
//
// "documents_synced" (Sprint documents-cloud-write) is deliberately its
// own state, not folded into "core_record_synced": ADR-010 reserves
// "full_record_synced" for when parent + geometry + points + parties +
// documents are ALL confirmed synced together, which this sprint alone
// does not establish.
export type ChildSyncState =
  | "local_only"
  | "saving"
  | "record_synced"
  | "geometry_synced"
  | "points_synced"
  | "parties_synced"
  | "documents_synced"
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

// ---------------------------------------------------------------------
// Sprint documents-cloud-write: document-specific writable fields.
// CREATE-ONLY -- public.documents has no updated_at column (only
// created_at), so there is deliberately no UpdateDocumentInput here,
// mirroring the reasoning ADR-011 established for land_points (RLS
// itself does permit UPDATE/DELETE on this table, unlike land_points --
// see the migration -- but the application layer does not build either
// without a safe optimistic-concurrency token; delete additionally
// mirrors ADR-013's standing "delete is its own separate decision").
//
// mimeType/sizeBytes are deliberately NOT writable fields here: they are
// always derived from the actual file Blob passed to
// createCloudDocument (Blob.type / Blob.size), never trusted from a
// caller-supplied field that could drift from the real uploaded bytes --
// same "never trust caller-declared metadata that the platform can
// derive itself" spirit as ADR-005's owner_id handling.
// ---------------------------------------------------------------------
export interface DocumentWritableFields {
  documentType: CloudDocumentType;
  originalFilename: string;
  isSensitive?: boolean;
}

export interface CreateDocumentInput extends DocumentWritableFields {
  // Stable child UUID, generated client-side (crypto.randomUUID(), same
  // as every other table) and passed explicitly on INSERT -- this
  // overrides public.documents.id's `default gen_random_uuid()` on
  // purpose, so the ADR-001/ADR-002 stable-id-plus-23505-retry
  // idempotency pattern applies here too, not just to tables whose
  // column has no default at all.
  id: string;
  // Parent land_records.id. Nullable, mirroring land_points' two-branch
  // ownership (see the documents migration comment): null means an
  // unlinked document, owned via uploaded_by instead of via the parent.
  landRecordId?: string | null;
}
