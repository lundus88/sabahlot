// Sprint listing-partner-backend: authenticated cloud
// create/update/status-transition coordinator for listing_partners.
// listing_partners ONLY -- no property_listings write happens here (see
// docs/ai/SPRINT_BRIEF_listing-partner-backend.md's "Explicitly out of
// scope").
//
// Unlike every land-records child-table coordinator, this table's `id`
// IS the authenticated user's own `auth.uid()`, not a client-generated
// UUID (ADR-026 / the migration) -- createListingPartner never accepts
// an `id` field on its input at all; there is no `id` on
// CreateListingPartnerInput to accept.
//
// No optimistic-concurrency (`updated_at`-filtered UPDATE) is used for
// updateListingPartnerProfile -- the schema/RLS design for this table
// (sprint-listing-partner-schema) did not include an
// `expectedUpdatedAt`-style filter (unlike land_parties), so a plain
// RLS-scoped UPDATE-by-id is correct here, not an oversight.

import type { SupabaseClient } from "@supabase/supabase-js";

import { isListingPartnerCloudWriteEnabled } from "./feature-gate";
import { mapListingPartnerRow } from "./mapper";
import {
  createListingPartnerRow,
  getListingPartnerById,
  mapListingPartnerFieldsToDbPayload,
  updateListingPartnerOwnFieldsRow,
  updateListingPartnerStatusRow,
} from "./listing-partners-repository";
import {
  areListingPartnerPayloadsEquivalent,
  buildComparableListingPartnerPayload,
  extractComparableFieldsFromListingPartnerRow,
  validateCreateListingPartnerInput,
  validateUpdateListingPartnerProfileInput,
  type ComparableListingPartnerFieldName,
} from "./listing-partners-validation";
import type {
  CreateListingPartnerInput,
  ListingPartner,
  ListingPartnerStatus,
  UpdateListingPartnerProfileInput,
  WriteResult,
  WriteSyncState,
} from "./types";

function failure(
  state: WriteSyncState,
  code: Extract<WriteResult<ListingPartner>, { ok: false }>["code"],
  message: string,
): WriteResult<ListingPartner> {
  return { ok: false, state, code, message };
}

async function getAuthenticatedUserId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/**
 * Creates the caller's own listing_partners row. `id` is always the
 * caller's own `auth.uid()` -- never accepted from `input` (there is no
 * such field on CreateListingPartnerInput to accept). Every fresh
 * registration starts `status = 'pending'` (the DB column default; this
 * function never sends a `status` value on create at all).
 *
 * Only ever returns `partner_created` on success.
 */
export async function createListingPartner(
  supabase: SupabaseClient,
  input: CreateListingPartnerInput,
): Promise<WriteResult<ListingPartner>> {
  if (!isListingPartnerCloudWriteEnabled()) {
    return failure("local_only", "database_error", "Cloud write is disabled in this environment.");
  }

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) {
    return failure("failed", "unauthenticated", "No authenticated session.");
  }

  const validation = validateCreateListingPartnerInput(input);
  if (!validation.ok) {
    return failure("failed", "validation_failed", validation.error);
  }

  const dbPayload = mapListingPartnerFieldsToDbPayload(validation.payload);
  const result = await createListingPartnerRow(supabase, userId, dbPayload);

  if (!result.ok) {
    if (result.error.code === "23505") {
      return resolveDuplicateListingPartnerCreate(supabase, userId, validation.payload);
    }

    return failure(
      "failed",
      "database_error",
      "Cloud listing-partner create failed; no local state was changed.",
    );
  }

  return { ok: true, state: "partner_created", data: mapListingPartnerRow(result.data) };
}

/**
 * A 23505 on create means a row for this id (always the caller's own
 * auth.uid()) already exists -- realistically only a genuine
 * double-submit, since a caller can never target another user's id.
 * Same three-outcome pattern as every other child table (ADR-002):
 * unreadable -> not_found_or_forbidden; owned but different content ->
 * duplicate_conflict; owned and matching -> verified success.
 */
async function resolveDuplicateListingPartnerCreate(
  supabase: SupabaseClient,
  userId: string,
  requestedPayload: CreateListingPartnerInput,
): Promise<WriteResult<ListingPartner>> {
  const existing = await getListingPartnerById(supabase, userId);

  if (!existing.ok || !existing.data) {
    return failure(
      "failed",
      "not_found_or_forbidden",
      "Duplicate listing-partner registration could not be confirmed as accessible to the current user.",
    );
  }

  const requestedComparable = buildComparableListingPartnerPayload(requestedPayload);
  const existingComparable = extractComparableFieldsFromListingPartnerRow(
    existing.data,
    Object.keys(requestedComparable) as ComparableListingPartnerFieldName[],
  );

  if (!areListingPartnerPayloadsEquivalent(requestedComparable, existingComparable)) {
    return failure(
      "conflict",
      "duplicate_conflict",
      "A listing-partner registration already exists for this account with different content; this retry was not treated as a successful save.",
    );
  }

  return { ok: true, state: "partner_created", data: mapListingPartnerRow(existing.data) };
}

/**
 * Updates the caller's own profile fields. `patch` structurally cannot
 * contain `status`/`approvedBy`/`approvedAt`
 * (UpdateListingPartnerProfileInput has no such keys) -- there is no
 * runtime filtering step needed to strip them, because there is nothing
 * to strip.
 *
 * Only ever returns `partner_updated` on success.
 */
export async function updateListingPartnerProfile(
  supabase: SupabaseClient,
  patch: UpdateListingPartnerProfileInput,
): Promise<WriteResult<ListingPartner>> {
  if (!isListingPartnerCloudWriteEnabled()) {
    return failure("local_only", "database_error", "Cloud write is disabled in this environment.");
  }

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) {
    return failure("failed", "unauthenticated", "No authenticated session.");
  }

  const validation = validateUpdateListingPartnerProfileInput(patch);
  if (!validation.ok) {
    return failure("failed", "validation_failed", validation.error);
  }

  const dbPayload = mapListingPartnerFieldsToDbPayload(validation.payload);
  if (Object.keys(dbPayload).length === 0) {
    return failure("failed", "validation_failed", "Update patch contained no allowed fields.");
  }

  const result = await updateListingPartnerOwnFieldsRow(supabase, userId, dbPayload);

  if (!result.ok) {
    return failure(
      "failed",
      "not_found_or_forbidden",
      "Listing-partner profile was not found, or is not accessible to the current user.",
    );
  }

  return { ok: true, state: "partner_updated", data: mapListingPartnerRow(result.data) };
}

/**
 * Admin-only status transition (approve/reject/suspend). Does not
 * pre-check the caller's own admin status in application code at all
 * (ADR-006) -- it always just attempts the UPDATE and reports success or
 * a single, non-disclosing failure. Whether the underlying denial came
 * from RLS filtering the row to zero matches, or from
 * prevent_listing_partner_self_approval's trigger raising an exception
 * (a non-admin attempting this on their OWN row), both surface
 * identically here as `not_authorized_or_not_found` -- never revealing
 * which case occurred, matching ADR-004's non-disclosure reasoning
 * applied to authorization state rather than row existence.
 *
 * The admin id recorded on approval is always the CALLING user's own id
 * (derived server-side, see listing-partners-repository.ts) -- there is
 * no parameter on this function a caller could use to attribute the
 * approval to someone else.
 *
 * Only ever returns `partner_status_updated` on success.
 */
export async function updateListingPartnerStatus(
  supabase: SupabaseClient,
  partnerId: string,
  newStatus: ListingPartnerStatus,
): Promise<WriteResult<ListingPartner>> {
  if (!isListingPartnerCloudWriteEnabled()) {
    return failure("local_only", "database_error", "Cloud write is disabled in this environment.");
  }

  const adminUserId = await getAuthenticatedUserId(supabase);
  if (!adminUserId) {
    return failure("failed", "unauthenticated", "No authenticated session.");
  }

  const result = await updateListingPartnerStatusRow(supabase, partnerId, newStatus, adminUserId);

  if (!result.ok) {
    return failure(
      "failed",
      "not_authorized_or_not_found",
      "Could not update this partner's status -- it may not exist, or the current session may not have admin access.",
    );
  }

  return { ok: true, state: "partner_status_updated", data: mapListingPartnerRow(result.data) };
}
