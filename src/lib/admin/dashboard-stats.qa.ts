// Sprint admin-dashboard QA script for dashboard-stats-repository.ts's
// pure aggregation helpers (date-bucketing, region/status breakdowns).
// Run via:
//   npx tsc -p src/lib/admin/dashboard-stats.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/src/lib/admin/dashboard-stats.qa.js
//
// listProfilesForAdminStats() itself (the Supabase call) is a plain,
// unfiltered `.select()` with no business logic -- not covered here,
// same convention as listAllListingPartnersRow/
// listActivePropertyListingsRow, neither of which have a dedicated
// mock-client test either. This file covers the aggregation math only,
// which is the actual non-trivial logic this sprint adds.

import {
  computeDailyGrowth,
  computeListingPartnerStatusBreakdown,
  computeRegionBreakdown,
  type ProfileStatsRow,
} from "./dashboard-stats-repository";
import type { ListingPartnerRow } from "../listing-partners/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

let failures = 0;

async function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`${name}: PASS`);
  } catch (error) {
    failures += 1;
    console.error(`${name}: ${(error as Error).message}`);
  }
}

const FIXED_NOW = new Date("2026-08-10T12:00:00.000Z");

function profileRow(createdAt: string, region: ProfileStatsRow["region"] = null): ProfileStatsRow {
  return { created_at: createdAt, region };
}

async function main() {
  await run("Test 1 (computeDailyGrowth: zero rows -> N points, all zero, continuous span)", () => {
    const points = computeDailyGrowth([], 5, FIXED_NOW);
    assert(points.length === 5, "expected exactly 5 points for a 5-day window");
    assert(points.every((p) => p.count === 0), "expected every point to be zero with no rows");
    assert(points[0].date === "2026-08-06", "expected the oldest point to be 4 days before FIXED_NOW");
    assert(points[4].date === "2026-08-10", "expected the newest point to be FIXED_NOW's own day");
  });

  await run("Test 2 (computeDailyGrowth: rows within window counted on the correct day)", () => {
    const rows = [
      profileRow("2026-08-10T01:00:00.000Z"),
      profileRow("2026-08-10T23:59:59.000Z"),
      profileRow("2026-08-08T05:00:00.000Z"),
    ];
    const points = computeDailyGrowth(rows, 5, FIXED_NOW);
    const byDate = Object.fromEntries(points.map((p) => [p.date, p.count]));
    assert(byDate["2026-08-10"] === 2, "expected both 2026-08-10 signups to land on the same bucket");
    assert(byDate["2026-08-08"] === 1, "expected the 2026-08-08 signup to land on its own bucket");
    assert(byDate["2026-08-07"] === 0, "expected an untouched day to stay zero, not be omitted");
  });

  await run("Test 3 (computeDailyGrowth: a row older than the window is not counted, does not throw)", () => {
    const rows = [profileRow("2026-07-01T00:00:00.000Z")];
    const points = computeDailyGrowth(rows, 5, FIXED_NOW);
    const total = points.reduce((sum, p) => sum + p.count, 0);
    assert(total === 0, "expected a pre-window signup to be excluded from every bucket");
  });

  await run("Test 4 (computeDailyGrowth: default 30-day window)", () => {
    const points = computeDailyGrowth([], undefined, FIXED_NOW);
    assert(points.length === 30, "expected the default window to be 30 days");
  });

  await run("Test 5 (computeRegionBreakdown: null region lands in 'unspecified', never dropped)", () => {
    const rows = [
      profileRow("2026-08-01T00:00:00.000Z", "sabah"),
      profileRow("2026-08-01T00:00:00.000Z", null),
      profileRow("2026-08-01T00:00:00.000Z", null),
    ];
    const breakdown = computeRegionBreakdown(rows);
    const byRegion = Object.fromEntries(breakdown.map((p) => [p.region, p.count]));
    assert(byRegion.sabah === 1, "expected 1 sabah row");
    assert(byRegion.unspecified === 2, "expected both null-region rows in unspecified, not dropped");
    assert(byRegion.sarawak === 0 && byRegion.peninsular === 0, "expected untouched regions to stay zero, not be omitted");
  });

  await run("Test 6 (computeRegionBreakdown: all 4 buckets always present, fixed order, empty input)", () => {
    const breakdown = computeRegionBreakdown([]);
    assert(breakdown.length === 4, "expected exactly 4 buckets even with zero rows");
    assert(
      breakdown.map((p) => p.region).join(",") === "sabah,sarawak,peninsular,unspecified",
      "expected a fixed, stable bucket order",
    );
    assert(breakdown.every((p) => p.count === 0), "expected every bucket to be zero with no rows");
  });

  await run("Test 7 (computeListingPartnerStatusBreakdown: counts each status independently)", () => {
    const rows: ListingPartnerRow[] = [
      { status: "pending" } as ListingPartnerRow,
      { status: "pending" } as ListingPartnerRow,
      { status: "approved" } as ListingPartnerRow,
      { status: "rejected" } as ListingPartnerRow,
    ];
    const breakdown = computeListingPartnerStatusBreakdown(rows);
    assert(breakdown.pending === 2, "expected 2 pending");
    assert(breakdown.approved === 1, "expected 1 approved");
    assert(breakdown.suspended === 0, "expected 0 suspended, not omitted from the result shape");
    assert(breakdown.rejected === 1, "expected 1 rejected");
  });

  await run("Test 8 (computeListingPartnerStatusBreakdown: empty input -> all zero, all 4 keys present)", () => {
    const breakdown = computeListingPartnerStatusBreakdown([]);
    assert(
      breakdown.pending === 0 && breakdown.approved === 0 && breakdown.suspended === 0 && breakdown.rejected === 0,
      "expected all 4 status keys present and zero with no rows",
    );
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll dashboard-stats QA tests PASSED.");
  }
}

void main();
