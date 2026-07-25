// Sprint parties cloud write: Supabase access for land_parties ONLY.
//
// Same shape as geometry-repository.ts / points-repository.ts:
// RLS-reliant, no owner/parent id accepted from a UI caller beyond the
// landRecordId the caller is explicitly creating a party under (RLS
// still verifies that land_record_id's owner_id == auth.uid() -- this
// file does not and cannot bypass that check).
//
// ADR-014 / id_number: PARTY_SELECT_COLUMNS includes id_number so the
// row this file RETURNS satisfies the existing CloudLandPartyRow type
// (defined in types.ts, used unmodified by the existing read flow since
// Sprint 02B) -- reading back a column that may already hold a value
// from elsewhere is not the risk ADR-014 guards against. What matters,
// and what mapPartyFieldsToDbPayload below guarantees, is that
// id_number is NEVER a key `mapPartyFieldsToDbPayload` can produce --
// it is not in PartyWritableFields (parties-validation.ts) at all, so
// there is no branch here that could ever write it. createPartyRow /
// updatePartyRow never accept an id_number parameter either. See
// parties-write.qa.ts for the explicit regression test asserting the
// outbound insert/update payload never contains this key.
//
// No land record, geometry, point, or document table is ever touched
// by this file.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CloudLandPartyRow } from "./types";
import type { PartyWritableFields } from "./parties-validation";
// Reused rather than redefined here -- same generic repository-result
// shape geometry-repository.ts already established. Redefining an
// identically-shaped type under a different name would risk drift
// between child tables' repository files; importing the existing one
// keeps a single canonical shape across all of them.
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

const PARTY_SELECT_COLUMNS =
  "id, land_record_id, party_role, full_name, id_number, relationship_to_applicant, contact_phone, contact_email, notes, created_at, updated_at";

/**
 * Converts validated PartyWritableFields into the snake_case columns
 * land_parties actually uses. Only fields present in `fields` are
 * included, so an UPDATE patch only touches columns the caller intended
 * to change. Never accepts or emits `id`, `land_record_id`,
 * `created_at`, `updated_at`, or `id_number` -- id_number specifically
 * has no branch here at all (PartyWritableFields has no such field to
 * read), not merely an omitted one.
 */
export function mapPartyFieldsToDbPayload(
  fields: Partial<PartyWritableFields>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if ("partyRole" in fields) payload.party_role = fields.partyRole;
  if ("fullName" in fields) payload.full_name = fields.fullName;
  if ("relationshipToApplicant" in fields) {
    payload.relationship_to_applicant = fields.relationshipToApplicant;
  }
  if ("contactPhone" in fields) payload.contact_phone = fields.contactPhone;
  if ("contactEmail" in fields) payload.contact_email = fields.contactEmail;
  if ("notes" in fields) payload.notes = fields.notes;

  return payload;
}

/**
 * Plain INSERT using the caller-supplied stable id. Uses INSERT, never
 * upsert, so a retry with the same id surfaces as Postgres 23505 on
 * `error.code` rather than silently overwriting -- the coordinator
 * decides what to do with that (same pattern as
 * geometry-repository.ts's createGeometryRow).
 *
 * `id`/`land_record_id` are spread LAST so they always win even if
 * `dbPayload` ever gained a same-named key.
 */
export async function createPartyRow(
  supabase: SupabaseClient,
  id: string,
  landRecordId: string,
  dbPayload: Record<string, unknown>,
): Promise<ChildRepositoryResult<CloudLandPartyRow>> {
  const { data, error } = await supabase
    .from("land_parties")
    .insert({ ...dbPayload, id, land_record_id: landRecordId })
    .select(PARTY_SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, error: toChildRepositoryError(error) };
  }

  return { ok: true, data: data as CloudLandPartyRow };
}

/**
 * Looks up one party by id, scoped by RLS to rows whose parent
 * land_record is owned by the caller. Used to (a) resolve a 23505
 * retry, and (b) distinguish "not found/not owned" from "stale
 * updated_at" after an UPDATE matches zero rows.
 */
export async function getPartyById(
  supabase: SupabaseClient,
  id: string,
): Promise<ChildRepositoryResult<CloudLandPartyRow | null>> {
  const { data, error } = await supabase
    .from("land_parties")
    .select(PARTY_SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { ok: false, error: toChildRepositoryError(error) };
  }

  return { ok: true, data: (data ?? null) as CloudLandPartyRow | null };
}

/**
 * UPDATE scoped by both `id` AND the caller's last-known `updated_at`
 * (atomic optimistic concurrency in the WHERE clause, not a separate
 * read-then-write race) -- same pattern as
 * geometry-repository.ts's updateGeometryRow. Zero rows matched ->
 * PGRST116 -- the coordinator then calls getPartyById to work out
 * whether that's a stale conflict or the row simply isn't (or no longer
 * is) accessible to this user.
 *
 * `dbPayload` must never contain `land_record_id`, `id`, `created_at`,
 * `updated_at`, or `id_number` -- parties-validation.ts /
 * mapPartyFieldsToDbPayload above guarantee this by construction, not
 * this function.
 */
export async function updatePartyRow(
  supabase: SupabaseClient,
  id: string,
  expectedUpdatedAt: string,
  dbPayload: Record<string, unknown>,
): Promise<ChildRepositoryResult<CloudLandPartyRow>> {
  const { data, error } = await supabase
    .from("land_parties")
    .update(dbPayload)
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select(PARTY_SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, error: toChildRepositoryError(error) };
  }

  return { ok: true, data: data as CloudLandPartyRow };
}
