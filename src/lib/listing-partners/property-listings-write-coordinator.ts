// Sprint property-listings-backend: authenticated cloud
// create/update/delete coordinator for property_listings.
// property_listings ONLY -- no listing_partners write happens here (see
// listing-partners-write-coordinator.ts for that table).
//
// Every property listing is always created for the CALLER's own
// listing_partners row -- `partnerId` is never accepted as a field on
// CreatePropertyListingInput; it is always the authenticated session's
// own `auth.uid()` (same id space as listing_partners.id).
//
// `id` on CreatePropertyListingInput IS client-generated (ADR-001),
// unlike listing_partners.id -- see types.ts's comment on
// CreatePropertyListingInput for why the two tables differ here.

import type { SupabaseClient } from "@supabase/supabase-js";

import { getListingPartnerById } from "./listing-partners-repository";
import { mapListingPartnerRow, mapPropertyListingRow } from "./mapper";
import {
  createPropertyListingRow,
  deletePropertyListingRow,
  getPropertyListingById,
  mapPropertyListingFieldsToDbPayload,
  updatePropertyListingRow,
} from "./property-listings-repository";
import {
  arePropertyListingPayloadsEquivalent,
  buildComparablePropertyListingPayload,
  extractComparableFieldsFromPropertyListingRow,
  validateCreatePropertyListingInput,
  validateUpdatePropertyListingInput,
  type ComparablePropertyListingFieldName,
} from "./property-listings-validation";
import { isListingPartnerCloudWriteEnabled } from "./feature-gate";
import type {
  CreatePropertyListingInput,
  PropertyListing,
  UpdatePropertyListingInput,
  WriteResult,
  WriteSyncState,
} from "./types";

function failure(
  state: WriteSyncState,
  code: Extract<WriteResult<PropertyListing>, { ok: false }>["code"],
  message: string,
): WriteResult<PropertyListing> {
  return { ok: false, state, code, message };
}

async function getAuthenticatedUserId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/**
 * Creates one property listing for the caller's own, currently-approved
 * listing_partners row. Checks the caller's own partner status FIRST
 * (a plain informational read, not an authorization decision -- RLS's
 * property_listings_insert_approved_partner policy independently
 * enforces the real constraint regardless of what this check concludes,
 * per ADR-006) so a not-yet-approved partner gets a precise
 * `partner_not_approved` result instead of a generic, harder-to-explain
 * database error surfaced from a failed INSERT.
 *
 * Only ever returns `listing_created` on success.
 */
export async function createPropertyListing(
  supabase: SupabaseClient,
  input: CreatePropertyListingInput,
): Promise<WriteResult<PropertyListing>> {
  if (!isListingPartnerCloudWriteEnabled()) {
    return failure("local_only", "database_error", "Cloud write is disabled in this environment.");
  }

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) {
    return failure("failed", "unauthenticated", "No authenticated session.");
  }

  const validation = validateCreatePropertyListingInput(input);
  if (!validation.ok) {
    return failure("failed", "validation_failed", validation.error);
  }

  const partnerResult = await getListingPartnerById(supabase, userId);
  if (!partnerResult.ok || !partnerResult.data) {
    return failure(
      "failed",
      "partner_not_approved",
      "No listing-partner registration was found for the current user, or it is not approved.",
    );
  }
  if (mapListingPartnerRow(partnerResult.data).status !== "approved") {
    return failure(
      "failed",
      "partner_not_approved",
      "The current user's listing-partner registration is not approved; only an approved partner may create listings.",
    );
  }

  const dbPayload = mapPropertyListingFieldsToDbPayload(validation.payload);
  const result = await createPropertyListingRow(supabase, validation.payload.id, userId, dbPayload);

  if (!result.ok) {
    if (result.error.code === "23505") {
      return resolveDuplicatePropertyListingCreate(supabase, validation.payload);
    }

    return failure(
      "failed",
      "database_error",
      "Cloud property-listing create failed; no local state was changed.",
    );
  }

  return { ok: true, state: "listing_created", data: mapPropertyListingRow(result.data) };
}

/**
 * A 23505 on create means a row with this id already exists -- safe for
 * a genuine retry (double-click, or a request that succeeded but whose
 * response was lost) PROVIDED the existing row's content matches what
 * this attempt asked to create. Same three-outcome pattern as every
 * other child table (ADR-002).
 */
async function resolveDuplicatePropertyListingCreate(
  supabase: SupabaseClient,
  requestedPayload: CreatePropertyListingInput,
): Promise<WriteResult<PropertyListing>> {
  const existing = await getPropertyListingById(supabase, requestedPayload.id);

  if (!existing.ok || !existing.data) {
    return failure(
      "failed",
      "not_found_or_forbidden",
      "Duplicate property listing could not be confirmed as accessible to the current user.",
    );
  }

  const requestedComparable = buildComparablePropertyListingPayload(requestedPayload);
  const existingComparable = extractComparableFieldsFromPropertyListingRow(
    existing.data,
    Object.keys(requestedComparable) as ComparablePropertyListingFieldName[],
  );

  if (!arePropertyListingPayloadsEquivalent(requestedComparable, existingComparable)) {
    return failure(
      "conflict",
      "duplicate_conflict",
      "A property listing with this id already exists with different content; this retry was not treated as a successful save.",
    );
  }

  return { ok: true, state: "listing_created", data: mapPropertyListingRow(existing.data) };
}

/**
 * Updates one of the caller's own listings. `status` IS an ordinary
 * writable field here (unlike listing_partners.status) -- see the
 * comment on PropertyListingWritableFields in types.ts. RLS
 * (property_listings_update_approved_partner) is what actually enforces
 * ownership + the caller's own partner approval status; a denied or
 * not-found update surfaces identically here (never distinguishing
 * "not yours" from "doesn't exist" from "your partner status changed
 * since your last successful write" -- same non-disclosure reasoning as
 * ADR-004).
 *
 * Only ever returns `listing_updated` on success.
 */
export async function updatePropertyListing(
  supabase: SupabaseClient,
  id: string,
  patch: UpdatePropertyListingInput,
): Promise<WriteResult<PropertyListing>> {
  if (!isListingPartnerCloudWriteEnabled()) {
    return failure("local_only", "database_error", "Cloud write is disabled in this environment.");
  }

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) {
    return failure("failed", "unauthenticated", "No authenticated session.");
  }

  const validation = validateUpdatePropertyListingInput(patch);
  if (!validation.ok) {
    return failure("failed", "validation_failed", validation.error);
  }

  const dbPayload = mapPropertyListingFieldsToDbPayload(validation.payload);
  if (Object.keys(dbPayload).length === 0) {
    return failure("failed", "validation_failed", "Update patch contained no allowed fields.");
  }

  const result = await updatePropertyListingRow(supabase, id, dbPayload);

  if (!result.ok) {
    return failure(
      "failed",
      "not_found_or_forbidden",
      "Property listing was not found, is not owned by the current user, or the current user's partner status no longer permits this write.",
    );
  }

  return { ok: true, state: "listing_updated", data: mapPropertyListingRow(result.data) };
}

/**
 * Deletes one of the caller's own listings. Same RLS-scoped,
 * non-disclosing-failure posture as updatePropertyListing above.
 *
 * Only ever returns `listing_deleted` on success.
 */
export async function deletePropertyListing(
  supabase: SupabaseClient,
  id: string,
): Promise<WriteResult<PropertyListing>> {
  if (!isListingPartnerCloudWriteEnabled()) {
    return failure("local_only", "database_error", "Cloud write is disabled in this environment.");
  }

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) {
    return failure("failed", "unauthenticated", "No authenticated session.");
  }

  const result = await deletePropertyListingRow(supabase, id);

  if (!result.ok) {
    return failure(
      "failed",
      "not_found_or_forbidden",
      "Property listing was not found, is not owned by the current user, or the current user's partner status no longer permits this write.",
    );
  }

  return { ok: true, state: "listing_deleted", data: mapPropertyListingRow(result.data) };
}
