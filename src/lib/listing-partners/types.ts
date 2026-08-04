// Sprint listing-partner-backend: shared types for the listing_partners
// TypeScript layer. Deliberately NOT importing from src/lib/land-records/ --
// listing_partners has no parent-ownership relationship to land_records at
// all (ADR-026 point 3), so this module defines its own result/error
// shapes rather than reusing land-records/child-types.ts's ChildSyncState/
// ChildWriteResult, which that file's own header comment scopes to rows
// with a land_records parent-ownership dimension this module doesn't have.
//
// Mirrors supabase/migrations/202608040001_create_listing_partner.sql
// exactly.

export type ListingPartnerStatus =
  | "pending"
  | "approved"
  | "suspended"
  | "rejected";

// Raw DB row shape (snake_case), as returned by Supabase.
export interface ListingPartnerRow {
  id: string;
  company_name: string | null;
  display_name: string;
  phone: string;
  email: string;
  ren_number: string | null;
  bio: string | null;
  status: ListingPartnerStatus;
  approved_by: string | null;
  approved_at: string | null;
  public_contact_consent: boolean;
  created_at: string;
  updated_at: string;
}

// Domain shape (camelCase), what the rest of the app consumes.
export interface ListingPartner {
  id: string;
  companyName: string | null;
  displayName: string;
  phone: string;
  email: string;
  renNumber: string | null;
  bio: string | null;
  status: ListingPartnerStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  publicContactConsent: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------
// Write-direction types.
// ---------------------------------------------------------------------

// Fields a partner may ever write about themself. Deliberately excludes
// `id` (always the caller's own auth.uid(), never client-supplied -- see
// listing-partners-write-coordinator.ts) and status/approvedBy/approvedAt
// (admin-only, via a wholly separate function -- see Design decision 5 in
// docs/ai/SPRINT_BRIEF_listing-partner-backend.md).
export interface ListingPartnerWritableFields {
  companyName?: string | null;
  displayName: string;
  phone: string;
  email: string;
  renNumber?: string | null;
  bio?: string | null;
  publicContactConsent?: boolean;
}

export type CreateListingPartnerInput = ListingPartnerWritableFields;

// A profile update patch. Every field optional (PATCH semantics), and
// structurally has no status/approvedBy/approvedAt key to leave out --
// not merely omitted at runtime.
export type UpdateListingPartnerProfileInput = Partial<ListingPartnerWritableFields>;

export type WriteErrorCode =
  | "unauthenticated"
  | "invalid_id"
  | "validation_failed"
  | "not_found_or_forbidden"
  | "not_authorized_or_not_found"
  | "duplicate_conflict"
  | "network_error"
  | "database_error";

export type WriteSyncState =
  | "local_only"
  | "saving"
  | "partner_created"
  | "partner_updated"
  | "partner_status_updated"
  | "failed"
  | "conflict";

export interface WriteSuccess<TDomain> {
  ok: true;
  state: WriteSyncState;
  data: TDomain;
}

export interface WriteFailure {
  ok: false;
  state: WriteSyncState;
  code: WriteErrorCode;
  message: string;
}

export type WriteResult<TDomain> = WriteSuccess<TDomain> | WriteFailure;

// ---------------------------------------------------------------------
// Validation result (mirrors land-records/validation.ts's shape, not
// imported -- see the module-header note above on why this module
// doesn't import from land-records).
// ---------------------------------------------------------------------

export interface ValidationSuccess<TPayload> {
  ok: true;
  payload: TPayload;
}

export interface ValidationFailure {
  ok: false;
  error: string;
}

export type ValidationResult<TPayload> = ValidationSuccess<TPayload> | ValidationFailure;
