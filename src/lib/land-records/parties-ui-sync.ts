// Sprint parties UI wiring: UI-facing orchestration for syncing the
// existing PdfIdentityFields (surveyor/witness/villageHead/applicant,
// src/app/page.tsx) to land_parties after a successful parent +
// geometry save. Follows the same overall shape as child-ui-sync.ts's
// syncParentGeometryToCloud: the parent row must already be
// core_record_synced before any child write is attempted, and every
// path reports a settled outcome rather than throwing.
//
// CREATE-ONLY this sprint (owner decision, sprint report 2026-07-25):
// CloudLandParty (types.ts) -- the cached domain type this file reads
// via parentResult.record.parties -- carries no updatedAt/createdAt at
// all, unlike DrawingObject (which child-ui-sync.ts relies on for
// cachedGeometry.updatedAt). Without that concurrency token there is no
// safe value to pass as updateCloudParty's expectedUpdatedAt, so
// updateCloudParty is deliberately never imported or called here.
//
// A person who was already synced before (has an existingId) is
// CREATEd again with the same id on every subsequent save. This is
// safe, not a silent overwrite: parties-write-coordinator.ts's already
// PASS-verified 23505-retry logic (ADR-002) resolves it structurally --
// identical content -> verified success (parties_synced); changed
// content -> duplicate_conflict, the cloud row is left untouched and
// the changed name is never silently applied. This sprint does not
// modify parties-repository.ts / parties-write-coordinator.ts /
// parties-validation.ts / parties-cache.ts in any way.
//
// land_parties ONLY. Never reads or writes land_records,
// land_record_geometries, land_points, or documents, and never touches
// src/lib/local-lots.ts or its storage key.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChildWriteResult } from "./child-types";
import type { CloudLandParty, CloudPartyRole } from "./types";
import { createCloudParty } from "./parties-write-coordinator";
import type { CreatePartyInput } from "./parties-validation";
import type { ParentSyncResult } from "./parent-ui-sync";

export type PartyUiSyncStatus =
  | "local_only"
  | "parties_synced"
  | "invalid_input"
  | "duplicate_conflict"
  | "failed"
  | "network_error";

// Distinguishes the one reason a party stays local-only without
// attempting a cloud write at all -- not an error. (Unlike
// ParentSyncLocalOnlyReason, there is no "gate_disabled"/"legacy_id"
// counterpart here: the gate check and id generation happen inside the
// per-identity loop below, where they're reported as the identity's own
// settled status rather than a shared local-only reason.)
export type PartyUiLocalOnlyReason = "parent_not_synced";

export interface PartyIdentityInput {
  // Which of the four fixed PdfIdentityFields slots this is. Mapping
  // from PdfIdentityFields keys to CloudPartyRole (decided in
  // src/app/page.tsx, not here): surveyor -> "surveyor", witness ->
  // "witness", villageHead -> "village_head", applicant ->
  // "original_applicant". There is no "owner" slot in PdfIdentityFields
  // today, so that CloudPartyRole value is never produced by this sync
  // path.
  role: CloudPartyRole;
  // PdfIdentityPerson.name. Never idNo -- this function's input type
  // structurally has no field for it, so id_number/idNo cannot reach
  // land_parties through this path (matching ADR-014, enforced one
  // layer deeper by parties-validation.ts's PartyWritableFields, which
  // also has no id_number field).
  name: string;
  // The client-generated UUID from a previous successful sync, if any
  // (persisted locally by the caller after a prior parties_synced
  // result). Undefined means this identity has never been synced
  // before -- a fresh one is generated below.
  existingId?: string;
}

export interface PartyUiSyncResult {
  role: CloudPartyRole;
  status: PartyUiSyncStatus;
  // The id to persist locally: the pre-existing id reused, or a
  // freshly-generated one for a first-time sync. Always present when a
  // cloud call was attempted (i.e. status is not local_only); the
  // caller (page.tsx) is responsible for writing this back into
  // PdfIdentityPerson.id and local storage.
  id?: string;
  party?: CloudLandParty;
  message?: string;
  localOnlyReason?: PartyUiLocalOnlyReason;
}

interface PartyOperations {
  create(
    supabase: SupabaseClient,
    input: CreatePartyInput,
  ): Promise<ChildWriteResult<CloudLandParty>>;
}

const DEFAULT_OPERATIONS: PartyOperations = {
  create: createCloudParty,
};

function generatePartyId(): string {
  return crypto.randomUUID();
}

function mapWriteResult(
  role: CloudPartyRole,
  id: string,
  result: ChildWriteResult<CloudLandParty>,
): PartyUiSyncResult {
  if (result.ok) {
    return { role, status: "parties_synced", id, party: result.data };
  }

  switch (result.code) {
    case "duplicate_conflict":
      return { role, status: "duplicate_conflict", id, message: result.message };
    case "validation_failed":
    case "invalid_parent_id":
    case "legacy_child_id_requires_mapping":
      return { role, status: "invalid_input", id, message: result.message };
    case "network_error":
      return { role, status: "network_error", id, message: result.message };
    default:
      return { role, status: "failed", id, message: result.message };
  }
}

/**
 * Syncs each filled-in PdfIdentityFields entry to land_parties after a
 * successful parent (+ geometry) save. Never invents a party for an
 * identity whose name is empty/whitespace-only -- those are filtered
 * out before anything else runs, and produce no result entry at all
 * (never a cloud call, never a "skipped" placeholder to persist).
 *
 * Never writes a child under an unsettled parent, matching
 * syncParentGeometryToCloud's ordering guarantee: if parentResult is
 * not core_record_synced, every filled-in identity reports local_only
 * with zero cloud calls.
 */
export async function syncPdfIdentitiesToCloud(
  supabase: SupabaseClient,
  parentResult: ParentSyncResult,
  identities: PartyIdentityInput[],
  operations: PartyOperations = DEFAULT_OPERATIONS,
): Promise<PartyUiSyncResult[]> {
  const filled = identities.filter(
    (identity) => identity.name.trim().length > 0,
  );

  if (parentResult.status !== "core_record_synced" || !parentResult.record) {
    return filled.map((identity) => ({
      role: identity.role,
      status: "local_only",
      localOnlyReason: "parent_not_synced",
      id: identity.existingId,
    }));
  }

  const landRecordId = parentResult.record.id;
  const results: PartyUiSyncResult[] = [];

  for (const identity of filled) {
    const id = identity.existingId ?? generatePartyId();

    try {
      const result = await operations.create(supabase, {
        id,
        landRecordId,
        partyRole: identity.role,
        fullName: identity.name.trim(),
      });

      results.push(mapWriteResult(identity.role, id, result));
    } catch (error) {
      results.push({
        role: identity.role,
        status: "network_error",
        id,
        message: error instanceof Error ? error.message : "Unknown party sync error.",
      });
    }
  }

  return results;
}
