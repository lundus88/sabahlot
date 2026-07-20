import type { SupabaseClient } from "@supabase/supabase-js";

import type { DrawingObject, PolygonDrawingObject } from "@/lib/drawing-types";
import {
  syncParentGeometryToCloud,
  type CloudLandRecord,
} from "./index";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

const PARENT_ID = "11111111-1111-4111-8111-111111111111";
const GEOMETRY_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";

function polygon(id = GEOMETRY_ID): PolygonDrawingObject {
  return {
    id,
    geometryType: "polygon",
    name: "Parent boundary",
    category: "parent_lot",
    coordinates: [
      { lat: 5, lng: 116 },
      { lat: 5.1, lng: 116 },
      { lat: 5, lng: 116.1 },
      { lat: 5, lng: 116 },
    ],
    lineStyle: "solid",
    color: "#0f766e",
    weight: 3,
    isVisible: true,
    areaSqm: 100,
    areaHa: 0.01,
    areaAcre: 0.0247,
    perimeterM: 42,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function parentRecord(geometries: DrawingObject[] = []): CloudLandRecord {
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
    geometries,
    points: [],
    parties: [],
    ownerName: null,
    originalApplicantStatus: "",
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
  await run("Test 1 (parent must sync first)", async () => {
    let calls = 0;
    const result = await syncParentGeometryToCloud(
      supabase,
      { status: "failed" },
      [polygon()],
      {
        create: async () => { calls += 1; throw new Error("unexpected"); },
        update: async () => { calls += 1; throw new Error("unexpected"); },
      },
    );
    assert(result.status === "local_only", "expected local_only");
    assert(calls === 0, "expected zero child writes");
  });

  await run("Test 2 (only parent_lot polygon is created)", async () => {
    let createdParentId = "";
    const line: DrawingObject = {
      id: OTHER_ID,
      geometryType: "line",
      name: "Reference",
      category: "reference_line",
      coordinates: [{ lat: 5, lng: 116 }, { lat: 5.1, lng: 116.1 }],
      lineStyle: "dashed",
      color: "#000000",
      weight: 2,
      isVisible: true,
      lengthM: 10,
      startBearing: null,
      endBearing: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const result = await syncParentGeometryToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [line, polygon()],
      {
        create: async (_client, input) => {
          createdParentId = input.landRecordId;
          return { ok: true, state: "geometry_synced", data: polygon(input.id) };
        },
        update: async () => { throw new Error("unexpected update"); },
      },
    );
    assert(result.status === "geometry_synced", "expected geometry_synced");
    assert(createdParentId === PARENT_ID, "expected stable synced parent id");
  });

  await run("Test 3 (cached geometry updates with server timestamp)", async () => {
    const cached = { ...polygon(), updatedAt: "2026-05-05T05:05:05.000Z" };
    let expectedUpdatedAt = "";
    const result = await syncParentGeometryToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord([cached]) },
      [polygon()],
      {
        create: async () => { throw new Error("unexpected create"); },
        update: async (_client, id, _patch, expected) => {
          assert(id === GEOMETRY_ID, "expected stable geometry id");
          expectedUpdatedAt = expected;
          return { ok: true, state: "geometry_synced", data: polygon() };
        },
      },
    );
    assert(result.status === "geometry_synced", "expected update success");
    assert(expectedUpdatedAt === cached.updatedAt, "expected cached server updatedAt");
  });

  await run("Test 4 (no parent polygon stays local)", async () => {
    const result = await syncParentGeometryToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [],
    );
    assert(result.status === "local_only", "expected local_only");
    assert(result.localOnlyReason === "no_parent_geometry", "expected explicit reason");
  });

  await run("Test 5 (multiple parent polygons are rejected)", async () => {
    const result = await syncParentGeometryToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [polygon(), polygon(OTHER_ID)],
    );
    assert(result.status === "invalid_input", "expected invalid_input");
  });

  await run("Test 6 (different cached geometry is never replaced)", async () => {
    const result = await syncParentGeometryToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord([polygon(OTHER_ID)]) },
      [polygon()],
    );
    assert(result.status === "invalid_input", "expected invalid_input");
  });

  await run("Test 7 (stale conflict is surfaced)", async () => {
    const cached = polygon();
    const server = { ...polygon(), updatedAt: "2026-07-07T07:07:07.000Z" };
    const result = await syncParentGeometryToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord([cached]) },
      [polygon()],
      {
        create: async () => { throw new Error("unexpected create"); },
        update: async () => ({
          ok: false,
          state: "conflict",
          code: "stale_conflict",
          message: "stale",
          serverData: server,
        }),
      },
    );
    assert(result.status === "stale_conflict", "expected stale_conflict");
    assert(result.serverGeometry?.updatedAt === server.updatedAt, "expected server geometry");
  });

  await run("Test 8 (thrown network error is contained)", async () => {
    const result = await syncParentGeometryToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [polygon()],
      {
        create: async () => { throw new Error("offline"); },
        update: async () => { throw new Error("unexpected update"); },
      },
    );
    assert(result.status === "network_error", "expected network_error");
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll child-ui-sync QA tests PASSED.");
  }
}

void main();
