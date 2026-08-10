// Sprint admin-dashboard: profiles-based stats queries, plus pure
// aggregation helpers over that data and over the existing
// listing-partner/property-listing repository results. Reuses
// listAllListingPartnersRow/listActivePropertyListingsRow by import
// (Design decision 6) rather than duplicating those queries -- this
// file's own Supabase call is the profiles stats query only.
//
// Security invariant: selects only the columns actually needed for
// stats (created_at, region) -- never full profile rows (full_name,
// phone) even though profiles_select_admin's RLS would permit it.
// land_records is never queried, referenced, or aggregated here.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { RegionId } from "../region/regionStorage";
import type {
  ListingPartnerRow,
  ListingPartnerStatus,
} from "../listing-partners/types";

export interface AdminStatsRepositoryError {
  code?: string;
  message: string;
}

export type AdminStatsRepositoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AdminStatsRepositoryError };

function toRepositoryError(error: unknown): AdminStatsRepositoryError {
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

export interface ProfileStatsRow {
  created_at: string;
  region: RegionId | null;
}

/**
 * The only profiles query this sprint adds. Relies entirely on the new
 * profiles_select_admin RLS policy -- a non-admin caller's session gets
 * back only their own row (profiles_select_own), never every row;
 * Postgres combines multiple permissive policies with OR, this query
 * itself performs no role check of its own (ADR-006).
 */
export async function listProfilesForAdminStats(
  supabase: SupabaseClient,
): Promise<AdminStatsRepositoryResult<ProfileStatsRow[]>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("created_at, region");

  if (error) {
    return { ok: false, error: toRepositoryError(error) };
  }

  return { ok: true, data: (data ?? []) as ProfileStatsRow[] };
}

export interface DailyGrowthPoint {
  // YYYY-MM-DD, UTC.
  date: string;
  count: number;
}

/**
 * Fixed 30-day window ending "today" (UTC), oldest first (Design
 * decision 4 -- no date-range picker, no configurability). A day with
 * zero signups still appears as its own zero-count point rather than
 * being omitted, so the chart's x-axis is always a continuous span of
 * exactly `windowDays` days, never gapped.
 */
export function computeDailyGrowth(
  rows: ProfileStatsRow[],
  windowDays = 30,
  now: Date = new Date(),
): DailyGrowthPoint[] {
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);

  const endUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const buckets = new Map<string, number>();
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(endUtc);
    d.setUTCDate(d.getUTCDate() - i);
    buckets.set(dayKey(d), 0);
  }

  for (const row of rows) {
    const key = row.created_at.slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    // A created_at older than the window is intentionally not counted
    // here -- it is still part of the total member count, just not
    // this chart's 30-day span.
  }

  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}

// Design decision 5: profiles.region has no NOT NULL constraint -- a
// member who never set one lands in "unspecified" ("Tidak dinyatakan"
// in the UI), never silently dropped from the breakdown.
export type RegionBreakdownKey = RegionId | "unspecified";

export interface RegionBreakdownPoint {
  region: RegionBreakdownKey;
  count: number;
}

const REGION_BREAKDOWN_ORDER: readonly RegionBreakdownKey[] = [
  "sabah",
  "sarawak",
  "peninsular",
  "unspecified",
];

export function computeRegionBreakdown(
  rows: ProfileStatsRow[],
): RegionBreakdownPoint[] {
  const counts: Record<RegionBreakdownKey, number> = {
    sabah: 0,
    sarawak: 0,
    peninsular: 0,
    unspecified: 0,
  };

  for (const row of rows) {
    const key: RegionBreakdownKey = row.region ?? "unspecified";
    counts[key] += 1;
  }

  return REGION_BREAKDOWN_ORDER.map((region) => ({
    region,
    count: counts[region],
  }));
}

export type ListingPartnerStatusBreakdown = Record<ListingPartnerStatus, number>;

/**
 * Derived from listAllListingPartnersRow's already-fetched rows --
 * this sprint adds no listing_partners query of its own.
 */
export function computeListingPartnerStatusBreakdown(
  rows: ListingPartnerRow[],
): ListingPartnerStatusBreakdown {
  const counts: ListingPartnerStatusBreakdown = {
    pending: 0,
    approved: 0,
    suspended: 0,
    rejected: 0,
  };

  for (const row of rows) {
    counts[row.status] += 1;
  }

  return counts;
}
