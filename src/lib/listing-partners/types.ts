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
  | "partner_not_approved"
  | "network_error"
  | "database_error";

export type WriteSyncState =
  | "local_only"
  | "saving"
  | "partner_created"
  | "partner_updated"
  | "partner_status_updated"
  | "listing_created"
  | "listing_updated"
  | "listing_deleted"
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

// ---------------------------------------------------------------------
// property_listings. Standalone from land_records (ADR-026 point 3),
// but owned by (foreign-keyed to) listing_partners -- part of the same
// module/domain, unlike listing_partners' relationship to land_records.
// Mirrors supabase/migrations/202608040001_create_listing_partner.sql
// exactly.
// ---------------------------------------------------------------------

export type PropertyListingStatus =
  | "draft"
  | "pending_review"
  | "active"
  | "under_offer"
  | "sold"
  | "leased"
  | "expired"
  | "removed";

export type PropertyListingType = "for_sale" | "for_lease";

// Mirrors public.region_id (supabase/migrations/202607110002_create_land_domain_enums.sql).
// Defined locally rather than imported from land-records/types.ts --
// same standalone-module posture as the rest of this file; region_id is
// a small, stable, already-shipped enum unlikely to drift, and this
// avoids adding a second cross-module import beyond the one already
// justified in feature-gate.ts.
export type PropertyListingRegion = "sabah" | "sarawak" | "peninsular";

// Raw DB row shape (snake_case), as returned by Supabase.
export interface PropertyListingRow {
  id: string;
  partner_id: string;
  title: string;
  description: string | null;
  listing_type: PropertyListingType;
  price: number | null;
  district: string | null;
  village: string | null;
  region: PropertyListingRegion | null;
  status: PropertyListingStatus;
  created_at: string;
  updated_at: string;
}

// Domain shape (camelCase), what the rest of the app consumes.
export interface PropertyListing {
  id: string;
  partnerId: string;
  title: string;
  description: string | null;
  listingType: PropertyListingType;
  price: number | null;
  district: string | null;
  village: string | null;
  region: PropertyListingRegion | null;
  status: PropertyListingStatus;
  createdAt: string;
  updatedAt: string;
}

// Fields a partner may write about one of their own listings. Unlike
// listing_partners.status (admin-only, ADR-026 point 2),
// property_listings.status IS an ordinary partner-writable field here --
// the schema/RLS (sprint-listing-partner-schema) gives the owning
// approved partner full UPDATE rights on every column, with no separate
// admin-only status policy or trigger for this table. `partnerId` is
// deliberately absent -- always the caller's own auth.uid(), never
// client-supplied (see property-listings-write-coordinator.ts).
export interface PropertyListingWritableFields {
  title: string;
  description?: string | null;
  listingType: PropertyListingType;
  price?: number | null;
  district?: string | null;
  village?: string | null;
  region?: PropertyListingRegion | null;
  status?: PropertyListingStatus;
}

// `id` IS required and client-generated here (ADR-001 pattern, unlike
// ListingPartnerWritableFields/CreateListingPartnerInput above where
// `id` is always auth.uid()) -- a property_listings row has no
// auth.users identity of its own to be keyed to, so this table follows
// the same stable-client-id-for-idempotent-retry convention every
// land-records child table already uses, not the listing_partners
// exception.
export interface CreatePropertyListingInput extends PropertyListingWritableFields {
  id: string;
}

export type UpdatePropertyListingInput = Partial<PropertyListingWritableFields>;
