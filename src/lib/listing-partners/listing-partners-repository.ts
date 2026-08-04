// Sprint listing-partner-backend: Supabase access for listing_partners
// ONLY. No property_listings table is ever touched here (that's a
// separate future sprint's repository file).
//
// RLS-reliant: this file never accepts or checks role/ownership itself
// (ADR-006) -- ADR-005-style, `id` is always derived server-side by the
// coordinator from the authenticated session, spread last, never
// caller-supplied.

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ListingPartnerRow,
  ListingPartnerStatus,
  ListingPartnerWritableFields,
} from "./types";

export interface ListingPartnerRepositoryError {
  code?: string;
  message: string;
}

export type ListingPartnerRepositoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ListingPartnerRepositoryError };

function toRepositoryError(error: unknown): ListingPartnerRepositoryError {
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

const LISTING_PARTNER_SELECT_COLUMNS =
  "id, company_name, display_name, phone, email, ren_number, bio, status, approved_by, approved_at, public_contact_consent, created_at, updated_at";

/**
 * Converts validated ListingPartnerWritableFields into the snake_case
 * columns listing_partners actually uses. Only fields present in
 * `fields` are included, so an UPDATE patch only touches columns the
 * caller intended to change. Never accepts or emits `id`, `status`,
 * `approved_by`, `approved_at`, `created_at`, or `updated_at` -- those
 * have no branch here at all (ListingPartnerWritableFields has no such
 * fields to read).
 */
export function mapListingPartnerFieldsToDbPayload(
  fields: Partial<ListingPartnerWritableFields>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if ("companyName" in fields) payload.company_name = fields.companyName;
  if ("displayName" in fields) payload.display_name = fields.displayName;
  if ("phone" in fields) payload.phone = fields.phone;
  if ("email" in fields) payload.email = fields.email;
  if ("renNumber" in fields) payload.ren_number = fields.renNumber;
  if ("bio" in fields) payload.bio = fields.bio;
  if ("publicContactConsent" in fields) {
    payload.public_contact_consent = fields.publicContactConsent;
  }

  return payload;
}

/**
 * Plain INSERT using the caller's own authenticated user id (never a
 * client-generated UUID -- listing_partners.id IS auth.uid(), unlike
 * every land-records child table). Uses INSERT, never upsert, so a
 * retry surfaces as Postgres 23505 on `error.code` rather than silently
 * overwriting -- the coordinator decides what to do with that.
 *
 * `id` is spread LAST so it always wins even if `dbPayload` ever gained
 * a same-named key.
 */
export async function createListingPartnerRow(
  supabase: SupabaseClient,
  id: string,
  dbPayload: Record<string, unknown>,
): Promise<ListingPartnerRepositoryResult<ListingPartnerRow>> {
  const { data, error } = await supabase
    .from("listing_partners")
    .insert({ ...dbPayload, id })
    .select(LISTING_PARTNER_SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, error: toRepositoryError(error) };
  }

  return { ok: true, data: data as ListingPartnerRow };
}

/**
 * Looks up one listing_partners row by id, scoped by RLS to the row's
 * own owner. Used to (a) resolve a 23505 duplicate-create retry, and
 * (b) diagnose a zero-row UPDATE result.
 */
export async function getListingPartnerById(
  supabase: SupabaseClient,
  id: string,
): Promise<ListingPartnerRepositoryResult<ListingPartnerRow | null>> {
  const { data, error } = await supabase
    .from("listing_partners")
    .select(LISTING_PARTNER_SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { ok: false, error: toRepositoryError(error) };
  }

  return { ok: true, data: (data as ListingPartnerRow | null) ?? null };
}

/**
 * Updates the caller's own profile fields. Never includes `status`,
 * `approved_by`, or `approved_at` in `dbPayload` --
 * mapListingPartnerFieldsToDbPayload has no branch that could produce
 * those keys. Scoped by RLS (listing_partners_update_own) to the
 * caller's own row; a mismatched id matches zero rows, surfaced by
 * `.single()` as PGRST116.
 */
export async function updateListingPartnerOwnFieldsRow(
  supabase: SupabaseClient,
  id: string,
  dbPayload: Record<string, unknown>,
): Promise<ListingPartnerRepositoryResult<ListingPartnerRow>> {
  const { data, error } = await supabase
    .from("listing_partners")
    .update(dbPayload)
    .eq("id", id)
    .select(LISTING_PARTNER_SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, error: toRepositoryError(error) };
  }

  return { ok: true, data: data as ListingPartnerRow };
}

/**
 * Admin-only status transition. Never accepts an "approvedBy" value from
 * a caller -- `approvedByUserId` is always the CALLING admin's own
 * `auth.uid()`, derived server-side by the coordinator, never a
 * caller-supplied admin id (ADR-005 pattern). `approved_by`/`approved_at`
 * are only set when transitioning TO 'approved' -- a reject/suspend
 * transition leaves them untouched, preserving the historical record of
 * who originally approved a partner even if later suspended.
 *
 * This function does not and cannot check whether the caller is
 * actually an admin -- that is entirely RLS's job
 * (listing_partners_update_admin) plus the
 * prevent_listing_partner_self_approval trigger (ADR-006: RLS is the
 * authorization boundary, not application code). A caller lacking admin
 * rights sees this fail (RLS: zero rows matched -> PGRST116 from
 * `.single()`; or, if attempted on their OWN row, the trigger raises a
 * Postgres exception instead) -- the coordinator maps EITHER shape of
 * failure to the same generic denial, never distinguishing them for the
 * caller (see listing-partners-write-coordinator.ts).
 */
export async function updateListingPartnerStatusRow(
  supabase: SupabaseClient,
  id: string,
  status: ListingPartnerStatus,
  approvedByUserId: string,
): Promise<ListingPartnerRepositoryResult<ListingPartnerRow>> {
  const dbPayload: Record<string, unknown> =
    status === "approved"
      ? { status, approved_by: approvedByUserId, approved_at: new Date().toISOString() }
      : { status };

  const { data, error } = await supabase
    .from("listing_partners")
    .update(dbPayload)
    .eq("id", id)
    .select(LISTING_PARTNER_SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, error: toRepositoryError(error) };
  }

  return { ok: true, data: data as ListingPartnerRow };
}
