// Sprint 02D-1B: Supabase access for land_points ONLY. CREATE-ONLY
// (ADR-011) -- no updatePointRow, no deletePointRow exist here, and
// none should be added without a new ADR + a migration adding
// land_points.updated_at (delete is separately deferred by ADR-013).
//
// Same shape as geometry-repository.ts: RLS-reliant, no owner/captured
// id accepted from a UI caller beyond what the coordinator derives
// from the session and passes in explicitly here.
//
// No land_record, geometry, party, or document table is ever touched
// by this file.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CloudLandPointRow } from "./types";
import type { PointWritableFields } from "./child-types";
// Reused rather than redefined here -- same generic repository-result
// shape geometry-repository.ts already established and exports via
// index.ts. Redefining identically-named types would create an export
// ambiguity in index.ts (two `export *` sources exporting the same
// name); importing the existing one keeps a single canonical shape
// across every child table's repository file.
import type { ChildRepositoryError, ChildRepositoryResult } from "./geometry-repository";

function toChildRepositoryError(error: unknown): ChildRepositoryError {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      code: typeof record.code === "string" ? record.code : undefined,
      message:
        typeof record.message === "string" ? record.message : "Unknown Supabase error",
    };
  }
  return { message: "Unknown Supabase error" };
}

const POINT_SELECT_COLUMNS =
  "id, land_record_id, captured_by, point_type, label, latitude, longitude, altitude, accuracy_m, altitude_accuracy_m, heading, speed, quality_grade, capture_method, source, sample_count, occupation_seconds, distance_difference_m, bearing_degrees, note, captured_at, created_at";

/**
 * Converts validated PointWritableFields into the snake_case columns
 * land_points actually uses. Never accepts or emits `id`,
 * `land_record_id`, or `captured_by` -- those are controlled entirely
 * by createPointRow's own parameters, never by this mapping.
 */
export function mapPointFieldsToDbPayload(
  fields: Partial<PointWritableFields>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if ("pointType" in fields) payload.point_type = fields.pointType;
  if ("label" in fields) payload.label = fields.label;
  if ("latitude" in fields) payload.latitude = fields.latitude;
  if ("longitude" in fields) payload.longitude = fields.longitude;
  if ("altitude" in fields) payload.altitude = fields.altitude;
  if ("accuracyM" in fields) payload.accuracy_m = fields.accuracyM;
  if ("altitudeAccuracyM" in fields) payload.altitude_accuracy_m = fields.altitudeAccuracyM;
  if ("heading" in fields) payload.heading = fields.heading;
  if ("speed" in fields) payload.speed = fields.speed;
  if ("qualityGrade" in fields) payload.quality_grade = fields.qualityGrade;
  if ("captureMethod" in fields) payload.capture_method = fields.captureMethod;
  if ("source" in fields) payload.source = fields.source;
  if ("sampleCount" in fields) payload.sample_count = fields.sampleCount;
  if ("occupationSeconds" in fields) payload.occupation_seconds = fields.occupationSeconds;
  if ("distanceDifferenceM" in fields) payload.distance_difference_m = fields.distanceDifferenceM;
  if ("bearingDegrees" in fields) payload.bearing_degrees = fields.bearingDegrees;
  if ("note" in fields) payload.note = fields.note;
  if ("capturedAt" in fields) payload.captured_at = fields.capturedAt;

  return payload;
}

/**
 * Plain INSERT using the caller-supplied stable id. Uses INSERT, never
 * upsert, so a retry with the same id surfaces as Postgres 23505 on
 * `error.code` rather than silently overwriting -- the coordinator
 * decides what to do with that (same pattern as
 * geometry-repository.ts's createGeometryRow).
 *
 * `landRecordId` may be null -- land_points' two-branch ownership
 * allows an unlinked point (see the migration comment). `capturedBy`
 * is always the session-derived user id (ADR-005), never accepted
 * from the caller's input type.
 *
 * `id`/`land_record_id`/`captured_by` are spread LAST so they always
 * win even if `dbPayload` ever gained a same-named key.
 */
export async function createPointRow(
  supabase: SupabaseClient,
  id: string,
  landRecordId: string | null,
  capturedBy: string,
  dbPayload: Record<string, unknown>,
): Promise<ChildRepositoryResult<CloudLandPointRow>> {
  const { data, error } = await supabase
    .from("land_points")
    .insert({ ...dbPayload, id, land_record_id: landRecordId, captured_by: capturedBy })
    .select(POINT_SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, error: toChildRepositoryError(error) };
  }

  return { ok: true, data: data as CloudLandPointRow };
}

/**
 * Looks up one point by id, scoped by RLS (linked via the parent
 * land_record's owner_id, or unlinked via captured_by). Used only to
 * resolve a 23505 retry -- same role as geometry-repository.ts's
 * getGeometryById. There is no update/delete counterpart in this file
 * (ADR-011/ADR-013).
 */
export async function getPointById(
  supabase: SupabaseClient,
  id: string,
): Promise<ChildRepositoryResult<CloudLandPointRow | null>> {
  const { data, error } = await supabase
    .from("land_points")
    .select(POINT_SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { ok: false, error: toChildRepositoryError(error) };
  }

  return { ok: true, data: (data ?? null) as CloudLandPointRow | null };
}
