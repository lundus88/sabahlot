// Sprint 02D-1A: Supabase access for land_record_geometries ONLY.
//
// Same shape as cloud-repository.ts's land_records write functions:
// RLS-reliant, no owner/parent parameter accepted from a UI caller
// beyond the landRecordId the caller is explicitly creating a geometry
// under (RLS still verifies that land_record_id's owner_id ==
// auth.uid() -- this file does not and cannot bypass that check).
//
// No point, party, or document table is ever touched by this file.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CloudLandRecordGeometryRow } from "./types";
import type { GeometryWritableFields } from "./child-types";

export interface ChildRepositoryError {
  code?: string;
  message: string;
}

export type ChildRepositoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ChildRepositoryError };

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

const GEOMETRY_SELECT_COLUMNS =
  "id, land_record_id, geometry_type, category, name, coordinates, line_style, color, weight, is_visible, area_m2, area_ha, area_acre, perimeter_m, length_m, start_bearing, end_bearing, created_at, updated_at";

/**
 * Converts validated GeometryWritableFields into the snake_case
 * columns land_record_geometries actually uses. Only fields present in
 * `fields` are included, so an UPDATE patch only touches columns the
 * caller intended to change. Never accepts or emits `id`,
 * `land_record_id`, `created_at`, or `updated_at` -- those are
 * controlled entirely by the functions below, never by this mapping.
 */
export function mapGeometryFieldsToDbPayload(
  fields: Partial<GeometryWritableFields>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if ("geometryType" in fields) payload.geometry_type = fields.geometryType;
  if ("category" in fields) payload.category = fields.category;
  if ("name" in fields) payload.name = fields.name;
  if ("coordinates" in fields) payload.coordinates = fields.coordinates;
  if ("lineStyle" in fields) payload.line_style = fields.lineStyle;
  if ("color" in fields) payload.color = fields.color;
  if ("weight" in fields) payload.weight = fields.weight;
  if ("isVisible" in fields) payload.is_visible = fields.isVisible;
  if ("areaSqm" in fields) payload.area_m2 = fields.areaSqm;
  if ("areaHa" in fields) payload.area_ha = fields.areaHa;
  if ("areaAcre" in fields) payload.area_acre = fields.areaAcre;
  if ("perimeterM" in fields) payload.perimeter_m = fields.perimeterM;
  if ("lengthM" in fields) payload.length_m = fields.lengthM;
  if ("startBearing" in fields) payload.start_bearing = fields.startBearing;
  if ("endBearing" in fields) payload.end_bearing = fields.endBearing;

  return payload;
}

/**
 * Plain INSERT using the caller-supplied stable id. Uses INSERT, never
 * upsert, so a retry with the same id surfaces as Postgres 23505 on
 * `error.code` rather than silently overwriting -- the coordinator
 * decides what to do with that (same pattern as
 * cloud-repository.ts's createLandRecordRow).
 *
 * `id`/`land_record_id` are spread LAST so they always win even if
 * `dbPayload` ever gained a same-named key (Sprint 02C-1 Patch 1
 * lesson applied from the start here, not retrofitted).
 */
export async function createGeometryRow(
  supabase: SupabaseClient,
  id: string,
  landRecordId: string,
  dbPayload: Record<string, unknown>,
): Promise<ChildRepositoryResult<CloudLandRecordGeometryRow>> {
  const { data, error } = await supabase
    .from("land_record_geometries")
    .insert({ ...dbPayload, id, land_record_id: landRecordId })
    .select(GEOMETRY_SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, error: toChildRepositoryError(error) };
  }

  return { ok: true, data: data as CloudLandRecordGeometryRow };
}

/**
 * Looks up one geometry by id, scoped by RLS to rows whose parent
 * land_record is owned by the caller. Used to (a) resolve a 23505
 * retry, and (b) distinguish "not found/not owned" from "stale
 * updated_at" after an UPDATE matches zero rows.
 */
export async function getGeometryById(
  supabase: SupabaseClient,
  id: string,
): Promise<ChildRepositoryResult<CloudLandRecordGeometryRow | null>> {
  const { data, error } = await supabase
    .from("land_record_geometries")
    .select(GEOMETRY_SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { ok: false, error: toChildRepositoryError(error) };
  }

  return { ok: true, data: (data ?? null) as CloudLandRecordGeometryRow | null };
}

/**
 * Lists geometries for one parent land_record, scoped by RLS. Read-only
 * helper for the "one active geometry per parent" application-level
 * check (see geometry-write-coordinator.ts) -- there is no unique
 * constraint enforcing this at the database level (confirmed: no such
 * constraint exists on land_record_geometries).
 */
export async function listGeometriesForLandRecord(
  supabase: SupabaseClient,
  landRecordId: string,
): Promise<ChildRepositoryResult<CloudLandRecordGeometryRow[]>> {
  const { data, error } = await supabase
    .from("land_record_geometries")
    .select(GEOMETRY_SELECT_COLUMNS)
    .eq("land_record_id", landRecordId);

  if (error) {
    return { ok: false, error: toChildRepositoryError(error) };
  }

  return { ok: true, data: (data ?? []) as CloudLandRecordGeometryRow[] };
}

/**
 * UPDATE scoped by both `id` AND the caller's last-known `updated_at`
 * (atomic optimistic concurrency in the WHERE clause, not a separate
 * read-then-write race). Zero rows matched -> PGRST116 -- the
 * coordinator then calls getGeometryById to work out whether that's a
 * stale conflict or the row simply isn't (or no longer is) accessible
 * to this user.
 *
 * `dbPayload` must never contain `land_record_id`, `id`, `created_at`,
 * or `updated_at` -- geometry-validation.ts guarantees this by
 * construction, not this function.
 */
export async function updateGeometryRow(
  supabase: SupabaseClient,
  id: string,
  expectedUpdatedAt: string,
  dbPayload: Record<string, unknown>,
): Promise<ChildRepositoryResult<CloudLandRecordGeometryRow>> {
  const { data, error } = await supabase
    .from("land_record_geometries")
    .update(dbPayload)
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select(GEOMETRY_SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, error: toChildRepositoryError(error) };
  }

  return { ok: true, data: data as CloudLandRecordGeometryRow };
}
