// Sprint property-listings-backend: Supabase access for
// property_listings ONLY. No listing_partners write happens here (see
// listing-partners-repository.ts for that table).
//
// RLS-reliant: this file never accepts or checks partner ownership/
// approval status itself (ADR-006) -- `partnerId` is always derived
// server-side by the coordinator from the authenticated session,
// spread last, never caller-supplied (ADR-005 pattern).

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PropertyListingRow, PropertyListingWritableFields } from "./types";

export interface PropertyListingRepositoryError {
  code?: string;
  message: string;
}

export type PropertyListingRepositoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: PropertyListingRepositoryError };

function toRepositoryError(error: unknown): PropertyListingRepositoryError {
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

const PROPERTY_LISTING_SELECT_COLUMNS =
  "id, partner_id, title, description, listing_type, price, district, village, region, status, created_at, updated_at";

/**
 * Converts validated PropertyListingWritableFields into the snake_case
 * columns property_listings actually uses. Only fields present in
 * `fields` are included, so an UPDATE patch only touches columns the
 * caller intended to change. Never accepts or emits `id`, `partner_id`,
 * `created_at`, or `updated_at` -- those have no branch here at all.
 */
export function mapPropertyListingFieldsToDbPayload(
  fields: Partial<PropertyListingWritableFields>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if ("title" in fields) payload.title = fields.title;
  if ("listingType" in fields) payload.listing_type = fields.listingType;
  if ("status" in fields) payload.status = fields.status;
  if ("description" in fields) payload.description = fields.description;
  if ("price" in fields) payload.price = fields.price;
  if ("district" in fields) payload.district = fields.district;
  if ("village" in fields) payload.village = fields.village;
  if ("region" in fields) payload.region = fields.region;

  return payload;
}

/**
 * Plain INSERT using the caller-supplied stable id (ADR-001 -- unlike
 * listing_partners, a property listing has no auth.users identity of
 * its own to be keyed to, so it follows the same client-generated-id
 * convention every land-records child table uses). Uses INSERT, never
 * upsert, so a retry surfaces as Postgres 23505 on `error.code` rather
 * than silently overwriting -- the coordinator decides what to do with
 * that.
 *
 * `id`/`partner_id` are spread LAST so they always win even if
 * `dbPayload` ever gained a same-named key. RLS
 * (property_listings_insert_approved_partner) is what actually enforces
 * that `partnerId` is an approved partner matching the caller -- this
 * function does not and cannot bypass that.
 */
export async function createPropertyListingRow(
  supabase: SupabaseClient,
  id: string,
  partnerId: string,
  dbPayload: Record<string, unknown>,
): Promise<PropertyListingRepositoryResult<PropertyListingRow>> {
  const { data, error } = await supabase
    .from("property_listings")
    .insert({ ...dbPayload, id, partner_id: partnerId })
    .select(PROPERTY_LISTING_SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, error: toRepositoryError(error) };
  }

  return { ok: true, data: data as PropertyListingRow };
}

/**
 * Looks up one property_listings row by id, scoped by RLS to rows the
 * caller may see (their own, of any status, or any public active one).
 * Used to (a) resolve a 23505 duplicate-create retry, and (b) diagnose
 * a zero-row UPDATE/DELETE result.
 */
export async function getPropertyListingById(
  supabase: SupabaseClient,
  id: string,
): Promise<PropertyListingRepositoryResult<PropertyListingRow | null>> {
  const { data, error } = await supabase
    .from("property_listings")
    .select(PROPERTY_LISTING_SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { ok: false, error: toRepositoryError(error) };
  }

  return { ok: true, data: (data as PropertyListingRow | null) ?? null };
}

/**
 * Updates one of the caller's own listings (RLS:
 * property_listings_update_approved_partner -- scoped to the caller's
 * own approved-partner-owned rows only). A mismatched id, a listing the
 * caller doesn't own, or a caller whose partner status is no longer
 * 'approved' all match zero rows, surfaced by `.single()` as PGRST116 --
 * this function does not and cannot distinguish those cases from each
 * other.
 */
export async function updatePropertyListingRow(
  supabase: SupabaseClient,
  id: string,
  dbPayload: Record<string, unknown>,
): Promise<PropertyListingRepositoryResult<PropertyListingRow>> {
  const { data, error } = await supabase
    .from("property_listings")
    .update(dbPayload)
    .eq("id", id)
    .select(PROPERTY_LISTING_SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, error: toRepositoryError(error) };
  }

  return { ok: true, data: data as PropertyListingRow };
}

/**
 * Deletes one of the caller's own listings (RLS:
 * property_listings_delete_approved_partner). Returns the deleted row
 * (via `.select().single()` on the DELETE) so the coordinator can
 * confirm what was actually removed, same as every other delete-capable
 * repository in this codebase would.
 */
export async function deletePropertyListingRow(
  supabase: SupabaseClient,
  id: string,
): Promise<PropertyListingRepositoryResult<PropertyListingRow>> {
  const { data, error } = await supabase
    .from("property_listings")
    .delete()
    .eq("id", id)
    .select(PROPERTY_LISTING_SELECT_COLUMNS)
    .single();

  if (error) {
    return { ok: false, error: toRepositoryError(error) };
  }

  return { ok: true, data: data as PropertyListingRow };
}
