// Sprint points cloud-write UI wiring QA script for
// points-ui-sync.ts. Run via:
//   npx tsc -p src/lib/land-records/points-ui-sync.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/src/lib/land-records/points-ui-sync.qa.js
// (same convention as parties-ui-sync.qa.ts / child-ui-sync.qa.ts)

import * as fs from "node:fs";
import * as path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  syncFieldGpsPointsToCloud,
  type PointCaptureInput,
} from "./points-ui-sync";
import type { CloudLandPoint } from "./types";
import type { ParentSyncResult } from "./parent-ui-sync";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

const PARENT_ID = "11111111-1111-4111-8111-111111111111";
const POINT_ID = "33333333-3333-4333-8333-333333333333";
const LEGACY_POINT_ID = "field-gps-1234567890-abc123";

function parentRecord(points: CloudLandPoint[] = []): NonNullable<ParentSyncResult["record"]> {
  return {
    id: PARENT_ID,
    recordName: "QA record",
    lotNumber: null,
    village: null,
    district: null,
    landCaseType: "",
    applicationAge: "",
    recordsAvailable: [],
    issueTags: [],
    heirsCanIdentifyLocation: "",
    landHistoryNotes: null,
    status: "draft",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    geometries: [],
    points,
    parties: [],
    documents: [],
    ownerName: null,
    originalApplicantStatus: "",
  };
}

function cloudPoint(overrides: Partial<CloudLandPoint> = {}): CloudLandPoint {
  return {
    id: POINT_ID,
    pointType: "boundary_mark",
    label: "P1",
    latitude: 5.978,
    longitude: 116.072,
    altitude: null,
    accuracyM: 3.2,
    note: null,
    capturedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function point(overrides: Partial<PointCaptureInput> = {}): PointCaptureInput {
  return {
    id: POINT_ID,
    pointType: "boundary_mark",
    label: "P1",
    latitude: 5.978,
    longitude: 116.072,
    accuracyM: 3.2,
    source: "phone-gps",
    captureMethod: "single",
    sampleCount: 1,
    occupationSeconds: 0,
    qualityGrade: "B",
    capturedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const supabase = {} as SupabaseClient;
let failures = 0;

async function run(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`${name}: PASS`);
  } catch (error) {
    failures += 1;
    console.error(`${name}: ${(error as Error).message}`);
  }
}

async function main() {
  // ---- Static check: points-ui-sync.ts only reaches land_points via
  // points-write-coordinator.ts, never points-repository.ts directly ----
  await run(
    "Test 0 (points-repository.ts is never imported/called in points-ui-sync.ts -- must go through points-write-coordinator.ts only)",
    async () => {
      // __dirname at runtime points into the compiled scratch outDir, not
      // the source tree -- this QA script is always run from the repo
      // root (see the run convention in the header comment above), so
      // resolve the real .ts source relative to process.cwd() instead.
      const source = fs.readFileSync(
        path.join(process.cwd(), "src/lib/land-records/points-ui-sync.ts"),
        "utf8",
      );
      assert(
        !/from\s+["']\.\/points-repository["']/.test(source),
        "points-ui-sync.ts must not import from points-repository.ts directly",
      );
      assert(
        !/\bpoints-repository\b/.test(source.replace(/\/\/.*$/gm, "")),
        "points-ui-sync.ts must not reference points-repository outside of comments",
      );
    },
  );

  await run("Test 1 (parent must sync first -- zero cloud calls)", async () => {
    let calls = 0;
    const points: PointCaptureInput[] = [point()];
    const results = await syncFieldGpsPointsToCloud(
      supabase,
      { status: "failed" },
      points,
      {
        create: async () => {
          calls += 1;
          throw new Error("unexpected");
        },
      },
    );
    assert(results.length === 1, "expected one result for the one point");
    assert(results[0].status === "local_only", "expected local_only");
    assert(results[0].localOnlyReason === "parent_not_synced", "expected parent_not_synced reason");
    assert(results[0].id === POINT_ID, "expected the local point id to be echoed back");
    assert(calls === 0, "expected zero cloud calls when parent is not synced");
  });

  await run("Test 2 (fresh point with no existing cloud row -> points_synced, id unchanged)", async () => {
    let capturedInput: unknown = null;
    const results = await syncFieldGpsPointsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [point()],
      {
        create: async (_client, input) => {
          capturedInput = input;
          return { ok: true, state: "points_synced", data: cloudPoint({ id: input.id }) };
        },
      },
    );
    assert(results[0].status === "points_synced", "expected points_synced");
    assert(results[0].id === POINT_ID, "expected the result id to match the local point's own id");
    assert(
      (capturedInput as { id: string }).id === POINT_ID,
      "expected the point's existing local id to be reused verbatim, never regenerated (ADR-001)",
    );
  });

  await run("Test 3 (landRecordId used is the synced parent's own id)", async () => {
    let capturedLandRecordId = "";
    await syncFieldGpsPointsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [point()],
      {
        create: async (_client, input) => {
          capturedLandRecordId = input.landRecordId as string;
          return { ok: true, state: "points_synced", data: cloudPoint({ id: input.id }) };
        },
      },
    );
    assert(capturedLandRecordId === PARENT_ID, "expected the create call's landRecordId to be the synced parent's id");
  });

  await run("Test 4 (same id + same content retry -> verified points_synced, not a false failure)", async () => {
    const results = await syncFieldGpsPointsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord([cloudPoint()]) },
      [point()],
      {
        // Simulates points-write-coordinator.ts's own 23505-retry path
        // resolving to a verified idempotent success (ADR-002) --
        // points-ui-sync.ts does not re-implement that logic, it only
        // has to pass the settled result through correctly.
        create: async (_client, input) => ({
          ok: true,
          state: "points_synced",
          data: cloudPoint({ id: input.id }),
        }),
      },
    );
    assert(results[0].status === "points_synced", "expected points_synced on a matching-content retry");
  });

  await run(
    "Test 5 (same id + changed content -> points_out_of_sync, never a silent no-op or a false points_synced)",
    async () => {
      const results = await syncFieldGpsPointsToCloud(
        supabase,
        { status: "core_record_synced", record: parentRecord([cloudPoint({ label: "P1 (edited)" })]) },
        [point({ label: "P1 (edited locally)" })],
        {
          create: async () => ({
            ok: false,
            state: "conflict",
            code: "duplicate_conflict",
            message: "A point with this id already exists with different content; this retry was not treated as a successful save.",
          }),
        },
      );
      assert(results[0].status === "points_out_of_sync", "expected points_out_of_sync (ADR-011), not duplicate_conflict verbatim and not points_synced");
      assert(results[0].id === POINT_ID, "expected the id to still be reported for the caller's reference");
    },
  );

  await run(
    "Test 6 (legacy non-UUID point id -> invalid_input, never uploaded)",
    async () => {
      let calls = 0;
      const results = await syncFieldGpsPointsToCloud(
        supabase,
        { status: "core_record_synced", record: parentRecord() },
        [point({ id: LEGACY_POINT_ID })],
        {
          create: async () => {
            calls += 1;
            return {
              ok: false,
              state: "failed",
              code: "legacy_child_id_requires_mapping",
              message: "Point id is not a stable UUID; legacy local point ids are not uploaded automatically.",
            };
          },
        },
      );
      assert(results[0].status === "invalid_input", "expected legacy_child_id_requires_mapping to map to invalid_input");
      assert(results[0].id === LEGACY_POINT_ID, "expected the legacy id to still be reported for the caller's reference");
      assert(calls === 1, "expected the coordinator to have been invoked once (rejection happens inside it, not skipped silently)");
    },
  );

  await run(
    "Test 7 (validation_failed/invalid_parent_id map to invalid_input)",
    async () => {
      const cases: Array<"validation_failed" | "invalid_parent_id"> = [
        "validation_failed",
        "invalid_parent_id",
      ];
      for (const code of cases) {
        const results = await syncFieldGpsPointsToCloud(
          supabase,
          { status: "core_record_synced", record: parentRecord() },
          [point()],
          {
            create: async () => ({
              ok: false,
              state: "failed",
              code,
              message: "simulated",
            }),
          },
        );
        assert(results[0].status === "invalid_input", `expected ${code} to map to invalid_input`);
      }
    },
  );

  await run("Test 8 (thrown network error is contained per-point, never propagated)", async () => {
    const results = await syncFieldGpsPointsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [point()],
      {
        create: async () => {
          throw new Error("offline");
        },
      },
    );
    assert(results[0].status === "network_error", "expected network_error");
  });

  await run(
    "Test 9 (multiple points are processed independently; one failure does not block others)",
    async () => {
      const points: PointCaptureInput[] = [
        point({ id: "44444444-4444-4444-8444-444444444444", label: "P1" }),
        point({ id: "55555555-5555-4555-8555-555555555555", label: "P2" }),
        point({ id: "66666666-6666-4666-8666-666666666666", label: "P3" }),
      ];
      const results = await syncFieldGpsPointsToCloud(
        supabase,
        { status: "core_record_synced", record: parentRecord() },
        points,
        {
          create: async (_client, input) => {
            if (input.label === "P2") {
              throw new Error("offline");
            }
            return { ok: true, state: "points_synced", data: cloudPoint({ id: input.id, label: input.label ?? null }) };
          },
        },
      );
      assert(results.length === 3, "expected all three points to produce a result");
      const p2Result = results.find((r) => r.id === "55555555-5555-4555-8555-555555555555");
      const others = results.filter((r) => r.id !== "55555555-5555-4555-8555-555555555555");
      assert(p2Result?.status === "network_error", "expected P2 to report network_error");
      assert(others.every((r) => r.status === "points_synced"), "expected P1 and P3 to succeed independently of P2's failure");
    },
  );

  await run("Test 10 (empty point list settles with zero results and zero cloud calls)", async () => {
    let calls = 0;
    const results = await syncFieldGpsPointsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [],
      {
        create: async () => {
          calls += 1;
          throw new Error("unexpected");
        },
      },
    );
    assert(results.length === 0, "expected zero results for an empty point list");
    assert(calls === 0, "expected zero cloud calls for an empty point list");
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll points-ui-sync QA tests PASSED.");
  }
}

void main();
