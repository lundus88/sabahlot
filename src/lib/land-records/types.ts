// Sprint 02B: read-only domain types for the cloud `land_records` domain.
//
// Reuses existing frontend types where the shape already matches
// (DrawingObject for geometries, the enum unions from local-lots.ts for
// land_record fields) instead of redefining them. Points and parties get
// new types here because the cloud columns don't map losslessly onto
// ManualPointExport / LocalPdfIdentities without dropping data.

import type {
  ApplicantStatus,
  ApplicationAge,
  AvailableRecord,
  HeirLocationKnowledge,
  LandCaseType,
  LandIssueTag,
} from "@/lib/local-lots";
import type { DrawingObject } from "@/lib/drawing-types";

export type CloudLandRecordStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "archived";

export type CloudPartyRole =
  | "owner"
  | "original_applicant"
  | "main_heir"
  | "surveyor"
  | "witness"
  | "village_head";

export type CloudPointType =
  | "boundary_mark"
  | "control_point"
  | "found_point"
  | "track_point"
  | "target_point";

// Mirrors supabase/migrations/202607110004_create_land_records.sql exactly.
export interface CloudLandRecordRow {
  id: string;
  owner_id: string;
  record_name: string;
  lot_number: string | null;
  village: string | null;
  district: string | null;
  region: "sabah" | "sarawak" | "peninsular";
  land_case_type: LandCaseType | null;
  application_age: ApplicationAge | null;
  records_available: AvailableRecord[];
  issue_tags: LandIssueTag[];
  original_applicant_status: ApplicantStatus | null;
  heirs_can_identify_location: HeirLocationKnowledge | null;
  land_history_notes: string | null;
  status: CloudLandRecordStatus;
  created_at: string;
  updated_at: string;
}

// Mirrors supabase/migrations/202607110005_create_land_record_geometries.sql.
export interface CloudLandRecordGeometryRow {
  id: string;
  land_record_id: string;
  geometry_type: "polygon" | "line";
  category: string;
  name: string | null;
  coordinates: unknown;
  line_style: "solid" | "dashed" | "dotted" | null;
  color: string | null;
  weight: number | null;
  is_visible: boolean;
  area_m2: number | null;
  area_ha: number | null;
  area_acre: number | null;
  perimeter_m: number | null;
  length_m: number | null;
  start_bearing: number | null;
  end_bearing: number | null;
  created_at: string;
  updated_at: string;
}

// Mirrors supabase/migrations/202607110006_create_land_points.sql. Kept as
// its own type (not forced into ManualPointExport) because several columns
// here (accuracy, quality_grade, capture_method, source, sample_count, ...)
// have no frontend equivalent yet -- see Sprint 02A "penyatuan model titik"
// open item.
export interface CloudLandPointRow {
  id: string;
  land_record_id: string | null;
  captured_by: string | null;
  point_type: CloudPointType;
  label: string | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy_m: number | null;
  altitude_accuracy_m: number | null;
  heading: number | null;
  speed: number | null;
  quality_grade: string | null;
  capture_method: string | null;
  source: string | null;
  sample_count: number | null;
  occupation_seconds: number | null;
  distance_difference_m: number | null;
  bearing_degrees: number | null;
  note: string | null;
  captured_at: string;
  created_at: string;
}

// Mirrors supabase/migrations/202607110007_create_land_parties.sql.
export interface CloudLandPartyRow {
  id: string;
  land_record_id: string;
  party_role: CloudPartyRole;
  full_name: string;
  id_number: string | null;
  relationship_to_applicant: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type LandRecordSyncState =
  | "idle"
  | "loading"
  | "synced"
  | "offline"
  | "failed"
  | "conflict";

// Domain model produced by the mapper: cloud rows combined into one
// record, plus a small number of fields that are intentionally NOT
// sourced from the cloud schema (see mapper.ts for why).
export interface CloudLandRecord {
  id: string;
  recordName: string;
  lotNumber: string | null;
  village: string | null;
  district: string | null;
  landCaseType: LandCaseType | "";
  applicationAge: ApplicationAge | "";
  recordsAvailable: AvailableRecord[];
  issueTags: LandIssueTag[];
  heirsCanIdentifyLocation: HeirLocationKnowledge | "";
  landHistoryNotes: string | null;
  status: CloudLandRecordStatus;
  createdAt: string;
  updatedAt: string;

  geometries: DrawingObject[];
  points: CloudLandPoint[];
  parties: CloudLandParty[];

  // Derived, not a cloud column: full_name of the party with role
  // 'owner' if present, else 'original_applicant', else null. See
  // owner decision #4 (2026-07-xx): no duplicate owner_name column on
  // land_records.
  ownerName: string | null;

  // Deliberately NOT read from the cloud schema -- land_records has no
  // matching column (owner decision #5: deferred schema decision
  // before Sprint 02D). This field is only ever populated by carrying
  // it over from an existing local-only record passed into the
  // mapper; it is never fetched from or written to Supabase.
  originalApplicantStatus: ApplicantStatus | "";
}

export interface CloudLandPoint {
  id: string;
  pointType: CloudPointType;
  label: string | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracyM: number | null;
  note: string | null;
  capturedAt: string;
}

export interface CloudLandParty {
  id: string;
  partyRole: CloudPartyRole;
  fullName: string;
  idNumber: string | null;
  relationshipToApplicant: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
}

export interface CloudReadResult {
  state: LandRecordSyncState;
  records: CloudLandRecord[];
  lastSyncedAt: string | null;
  error?: string;
}

// ---------------------------------------------------------------------
// Idempotency invariant for Sprint 02C (save/insert), documented now so
// the write path is designed against it from the start:
//
//   ONE local record id = ONE cloud land_record id.
//
// A local record's `id` (see local-lots.ts createId()) is reused
// directly as the cloud `land_records.id` on insert -- never generated
// fresh per save/retry. This makes retrying a failed save safe (upsert
// on the same id) instead of producing duplicate rows, which is the
// bug already present in the legacy `lots` dual-write (see Sprint 02A
// report section 1).
//
// createId() prefers crypto.randomUUID() but falls back to a
// `local-<timestamp>-<random>` string when crypto is unavailable.
// Only UUID-shaped ids are safe to use as a Postgres uuid primary key.
// ---------------------------------------------------------------------
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isStableCloudId(id: string): boolean {
  return UUID_PATTERN.test(id);
}
