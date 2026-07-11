// Sprint 02B: read-only Supabase access for the land_records domain.
//
// Every function here relies entirely on RLS (see
// supabase/migrations/202607110004_create_land_records.sql and
// siblings) to scope rows to the caller's own auth.uid(). None of them
// accept a user_id parameter from the caller -- passing one in would
// invite spoofing a different owner's id from the UI, which RLS would
// reject anyway, but it's not even offered as an option here.
//
// No create/update/delete function exists in this file. That is
// intentional scope for Sprint 02B, not an oversight.

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
