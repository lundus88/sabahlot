// Sprint 02B/02C: Supabase access for the land_records domain.
//
// Every function here relies entirely on RLS (see
// supabase/migrations/202607110004_create_land_records.sql and
// siblings) to scope rows to the caller's own auth.uid(). None of them
// accept a user_id parameter from the caller -- passing one in would
// invite spoofing a different owner's id from the UI, which RLS would
// reject anyway, but it's not even offered as an option here.
//
// Sprint 02B added the read-only functions below. Sprint 02C adds
// createLandRecordRow/updateLandRecordRow -- both write to
// land_records ONLY. No child table (land_record_geometries,
// land_points, land_parties, documents) is written by anything in
// this file, and there is no delete function here at all.

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CloudLandPartyRow,
  CloudLandPointRow,
  CloudLandRecordGeometryRow,
  CloudLandRecordRow,
} from "./types";

export type RepositoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function toRepositoryError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unknown Supabase error";
}

// Sprint 02C: write result shape carries the Postgres error `code`
// (e.g. '23505' unique violation) alongside the message, so
// write-coordinator.ts can distinguish "duplicate insert retry" from
// any other database error without string-matching messages.
export interface WriteRepositoryError {
  code?: string;
  message: string;
}

export type WriteRepositoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: WriteRepositoryError };

function toWriteRepositoryError(error: unknown): WriteRepositoryError {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      code: typeof record.code === "string" ? record.code : undefined,
      message:
        typeof record.message === "string"
          ? record.message
          : "Unknown Supabase error",
    };
  }
  return { message: "Unknown Supabase error" };
}

const LAND_RECORD_SELECT_COLUMNS =
  "id, owner_id, record_name, lot_number, village, district, region, land_case_type, application_age, records_available, issue_tags, original_applicant_status, heirs_can_identify_location, land_history_notes, status, created_at, updated_at";

export async function listLandRecordsForCurrentUser(
  supabase: SupabaseClient,
): Promise<RepositoryResult<CloudLandRecordRow[]>> {
  const { data, error } = await supabase
    .from("land_records")
    .select(
      "id, owner_id, record_name, lot_number, village, district, region, land_case_type, application_age, records_available, issue_tags, original_applicant_status, heirs_can_identify_location, land_history_notes, status, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false, error: toRepositoryError(error) };
  }

  return { ok: true, data: (data ?? []) as CloudLandRecordRow[] };
}

export async function getLandRecordGeometries(
  supabase: SupabaseClient,
  landRecordId: string,
): Promise<RepositoryResult<CloudLandRecordGeometryRow[]>> {
  const { data, error } = await supabase
    .from("land_record_geometries")
    .select("*")
    .eq("land_record_id", landRecordId);

  if (error) {
    return { ok: false, error: toRepositoryError(error) };
  }

  return { ok: true, data: (data ?? []) as CloudLandRecordGeometryRow[] };
}

export async function getLandPoints(
  supabase: SupabaseClient,
  landRecordId: string,
): Promise<RepositoryResult<CloudLandPointRow[]>> {
  const { data, error } = await supabase
    .from("land_points")
    .select("*")
    .eq("land_record_id", landRecordId);

  if (error) {
    return { ok: false, error: toRepositoryError(error) };
  }

  return { ok: true, data: (data ?? []) as CloudLandPointRow[] };
}

export async function getLandParties(
  supabase: SupabaseClient,
  landRecordId: string,
): Promise<RepositoryResult<CloudLandPartyRow[]>> {
  const { data, error } = await supabase
    .from("land_parties")
    .select("*")
    .eq("land_record_id", landRecordId);

  if (error) {
    return { ok: false, error: toRepositoryError(error) };
  }

  return { ok: true, data: (data ?? []) as CloudLandPartyRow[] };
}

// ---------------------------------------------------------------------
// Sprint 02C: create/update. land_records ONLY -- no child table write
// exists anywhere in this file.
// ---------------------------------------------------------------------

/**
 * Plain INSERT using the caller-supplied stable id (see
 * validation.ts / write-coordinator.ts for where that id is validated
 * and where `ownerId` is derived from the session). Uses INSERT, never
 * upsert, so a retry with the same id surfaces as a Postgres 23505
 * unique-violation on `error.code` rather than silently overwriting --
 * write-coordinator.ts is what decides what to do with that.
 *
 * `status` is never part of `dbPayload` -- it is omitted entirely so
 * the column default ('draft') applies, and the
 * prevent_land_record_privileged_status trigger stays as the backstop
 * if it were ever added by mistake.
 */
export async function createLandRecordRow(
  supabase: SupabaseClient,
  id: string,
  ownerId: string,
  dbPayload: Record<string, unknown>,
): Promise<WriteRepositoryResult<CloudLandRecordRow>> {
  // Sprint 02C-1 Patch 1: `id` and `owner_id` are spread LAST so they
  // always win even if `dbPayload` ever gained a same-named key --
  // defense-in-depth against a future allowlist regression, even
  // though mapWritableFieldsToDbPayload never emits either key today.
  const { data, error } = await supabase
    .from("land_records")
    .insert({ ...dbPayload, id, owner_id: ownerId })
    .select(LAND_RECORD_SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, error: toWriteRepositoryError(error) };
  }

  return { ok: true, data: data as CloudLandRecordRow };
}

/**
 * Looks up one land_record by id, scoped by RLS to the caller's own
 * rows. Used by write-coordinator.ts to (a) resolve a 23505 retry by
 * confirming the existing row belongs to the current user, and (b)
 * distinguish "not found/not owned" from "stale updated_at" after an
 * UPDATE matches zero rows.
 */
export async function getLandRecordById(
  supabase: SupabaseClient,
  id: string,
): Promise<RepositoryResult<CloudLandRecordRow | null>> {
  const { data, error } = await supabase
    .from("land_records")
    .select(LAND_RECORD_SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { ok: false, error: toRepositoryError(error) };
  }

  return { ok: true, data: (data ?? null) as CloudLandRecordRow | null };
}

/**
 * UPDATE scoped by both `id` AND the caller's last-known `updated_at`
 * (optimistic concurrency in the WHERE clause itself, not a separate
 * read-then-write race). If the row's updated_at has moved on since
 * the caller last read it, this matches zero rows and `.single()`
 * raises PGRST116 ("no rows") -- write-coordinator.ts then calls
 * getLandRecordById to work out whether that's a stale conflict or
 * the row simply isn't (or no longer is) this user's.
 *
 * `dbPayload` must never contain `status`, `owner_id`, `id`,
 * `created_at`, or `updated_at` -- validation.ts guarantees this by
 * construction (it never emits those keys), not this function.
 */
export async function updateLandRecordRow(
  supabase: SupabaseClient,
  id: string,
  expectedUpdatedAt: string,
  dbPayload: Record<string, unknown>,
): Promise<WriteRepositoryResult<CloudLandRecordRow>> {
  const { data, error } = await supabase
    .from("land_records")
    .update(dbPayload)
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select(LAND_RECORD_SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, error: toWriteRepositoryError(error) };
  }

  return { ok: true, data: data as CloudLandRecordRow };
}
