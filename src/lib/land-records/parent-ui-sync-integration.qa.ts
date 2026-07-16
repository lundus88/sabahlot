// Sprint 02C-2 QA script (independent-review fix #2): proves the actual
// WIRING CONTRACT between the local save path (src/lib/local-lots.ts,
// used unmodified and verbatim by src/app/page.tsx's saveLotRecord) and
// the new parent cloud sync helper (parent-ui-sync.ts), in the same
// order and with the same id-passing contract page.tsx's saveLotRecord
// actually uses:
//
//   1. localRecord = saveLocalLot({ ... })              (local save)
//   2. syncParentLandRecordToCloud(supabase, {
//        localId: localRecord.id, ...fields             (cloud sync,
//      })                                                 using the id
//                                                          local save
//                                                          just produced)
//
// Run via:
//   npx tsc -p src/lib/land-records/parent-ui-sync-integration.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/parent-ui-sync-integration.qa.js
//
// HONEST LIMITATION (see Sprint 02C-2 report): this script calls the two
// real, unmodified library functions in the exact sequence and with the
// exact argument contract src/app/page.tsx uses, but it does not render
// page.tsx itself, does not exercise React state/hooks, form validation,
// or the save button's click handler. It proves the local-save-then-
// cloud-sync data contract is correct; it does not prove page.tsx's JSX
// wiring calls these functions this way -- that remains a manual code-
// diff review (page.tsx's saveLotRecord is a two-line call of these same
// two functions, in this same order, passing this same id -- see the
// report for the exact line reference).

import type { PolygonResult } from "@/app/components/Map";
import {
  EMPTY_LAND_RECORD,
  getLocalLots,
  saveLocalLot,
  type LandRecordDetails,
  type LocalLotRecord,
} from "../local-lots";

import {
  readCloudCache,
  syncParentLandRecordToCloud,
  type ParentSyncInput,
} from "./index";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

// ---- Fake Supabase client (land_records only) -- same shape as
// parent-ui-sync.qa.ts, duplicated per existing repo convention
// (land-records-write.qa.ts / geometry-write.qa.ts each keep their own
// copy rather than sharing a test utility module). ------------------

type TableName = "land_records";

interface FakeResponse {
  data: unknown;
  error: { message: string; code?: string } | null;
}

class FakeChain {
  constructor(
    private readonly client: FakeSupabaseClient,
    private readonly mode: "select" | "insert" | "update",
  ) {}

  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.client.eqCalls.push({ column, value });
    return this;
  }
  order() {
    return this;
  }

  single(): Promise<FakeResponse> {
    if (this.client.throwOnSingle) {
      return Promise.reject(new Error("simulated network failure"));
    }
    if (this.mode === "insert") {
      return Promise.resolve(
        this.client.insertQueue.shift() ?? {
          data: null,
          error: { message: "no insert response configured" },
        },
      );
    }
    if (this.mode === "update") {
      return Promise.resolve(
        this.client.updateQueue.shift() ?? {
          data: null,
          error: { message: "no update response configured" },
        },
      );
    }
    return Promise.resolve({ data: null, error: { message: "unexpected single()" } });
  }

  maybeSingle(): Promise<FakeResponse> {
    return Promise.resolve(
      this.client.selectByIdQueue.shift() ?? { data: null, error: null },
    );
  }
}

class FakeSupabaseClient {
  calls: Array<{ op: string; table: TableName; payload?: unknown }> = [];
  eqCalls: Array<{ column: string; value: unknown }> = [];
  insertQueue: FakeResponse[] = [];
  updateQueue: FakeResponse[] = [];
  selectByIdQueue: FakeResponse[] = [];
  userId: string | null = null;
  throwOnSingle = false;

  auth = {
    getUser: async () => ({
      data: { user: this.userId ? { id: this.userId } : null },
      error: null,
    }),
  };

  from(table: TableName) {
    return {
      insert: (payload: unknown) => {
        this.calls.push({ op: "insert", table, payload });
        return new FakeChain(this, "insert");
      },
      update: (payload: unknown) => {
        this.calls.push({ op: "update", table, payload });
        return new FakeChain(this, "update");
      },
      select: () => {
        this.calls.push({ op: "select", table });
        return new FakeChain(this, "select");
      },
      delete: (): never => {
        throw new Error(`delete() must never be called on ${table} in Sprint 02C-2`);
      },
    };
  }
}

// ---- Shared fixtures --------------------------------------------------

const DEV_URL = "https://xsflrehitrmobiyfbfhk.supabase.co";
Object.assign(process.env, { NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: DEV_URL });

const polygon = {
  coordinates: [
    { lat: 5.98, lng: 116.07 },
    { lat: 5.98, lng: 116.08 },
    { lat: 5.99, lng: 116.08 },
  ],
  areaM2: 100,
  areaHa: 0.01,
  areaAcre: 0.0247,
  perimeterM: 40,
} as PolygonResult;

const landRecord: LandRecordDetails = {
  ...EMPTY_LAND_RECORD,
  landCaseType: "inheritance_land",
};

function baseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "00000000-0000-4000-8000-000000000000",
    owner_id: overrides.owner_id ?? "00000000-0000-4000-8000-000000000000",
    record_name: "QA Integration Lot",
    lot_number: null,
    village: null,
    district: null,
    region: "sabah",
    land_case_type: null,
    application_age: null,
    records_available: [],
    issue_tags: [],
    original_applicant_status: null,
    heirs_can_identify_location: null,
    land_history_notes: null,
    status: "draft",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Performs step 1 of the page.tsx contract: a local save, exactly the
 * shape saveLotRecord passes to saveLocalLot (lotName/lotNumber/etc.).
 */
function performLocalSave(lotName: string): LocalLotRecord {
  return saveLocalLot({
    lotName,
    lotNumber: lotName,
    ownerName: "Owner",
    village: "Village",
    district: "District",
    notes: "",
    landRecord,
    polygon,
  });
}

/** Mirrors exactly the field mapping saveLotRecord passes today. */
function toParentSyncInput(localRecord: LocalLotRecord): ParentSyncInput {
  return {
    localId: localRecord.id,
    recordName: localRecord.lot_name,
    lotNumber: localRecord.lot_number,
    village: localRecord.village,
    district: localRecord.district,
    region: "sabah",
    landCaseType: localRecord.land_record?.landCaseType || null,
    applicationAge: localRecord.land_record?.applicationAge || null,
    recordsAvailable: localRecord.land_record?.recordsAvailable ?? [],
    issueTags: localRecord.land_record?.issueTags ?? [],
    heirsCanIdentifyLocation: localRecord.land_record?.heirsCanIdentifyLocation || null,
    landHistoryNotes: localRecord.land_record?.landHistoryNotes || null,
  };
}

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

// ---- 1: local save completes, and is visible, before any cloud call ------

async function testLocalSaveHappensBeforeCloudCall() {
  const client = new FakeSupabaseClient();
  client.userId = "aaaaaaaa-1111-4111-8111-111111111111";

  const localRecord = performLocalSave("Integration Test Lot 1");

  // Checkpoint BEFORE the cloud step: local save is already durable, and
  // no cloud call has been made yet.
  const persistedBeforeCloudCall = getLocalLots().find((l) => l.id === localRecord.id);
  assert(persistedBeforeCloudCall, "expected the local record to be persisted before any cloud call");
  assert(client.calls.length === 0, "expected zero cloud calls before syncParentLandRecordToCloud is invoked");

  client.insertQueue.push({ data: baseRow({ id: localRecord.id, owner_id: client.userId }), error: null });

  const result = await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    toParentSyncInput(localRecord),
  );

  assert(result.status === "core_record_synced", "expected the cloud sync to succeed");
}

// ---- 2: the cloud call carries the exact id the local save produced ------

async function testCloudCallUsesTheJustSavedLocalId() {
  const client = new FakeSupabaseClient();
  client.userId = "aaaaaaaa-2222-4222-8222-222222222222";

  const localRecord = performLocalSave("Integration Test Lot 2");
  client.insertQueue.push({ data: baseRow({ id: localRecord.id, owner_id: client.userId }), error: null });

  await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    toParentSyncInput(localRecord),
  );

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(
    payload?.id === localRecord.id,
    "expected the cloud create payload's id to equal the id saveLocalLot just produced",
  );
}

// ---- 3: a thrown cloud failure never deletes or reverts the local record --

async function testCloudNetworkFailureNeverDeletesLocalRecord() {
  const client = new FakeSupabaseClient();
  client.userId = "aaaaaaaa-3333-4333-8333-333333333333";
  client.throwOnSingle = true;

  const localRecord = performLocalSave("Integration Test Lot 3");
  const result = await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    toParentSyncInput(localRecord),
  );

  assert(result.status === "network_error", "expected network_error");
  const stillLocal = getLocalLots().find((l) => l.id === localRecord.id);
  assert(stillLocal, "expected the local record to still exist after a cloud network failure");
  assert(stillLocal.lot_name === "Integration Test Lot 3", "expected local record content to be unchanged");
}

// ---- 4: no session never deletes or reverts the local record --------------

async function testNoSessionNeverDeletesLocalRecord() {
  const client = new FakeSupabaseClient();
  client.userId = null;

  const localRecord = performLocalSave("Integration Test Lot 4");
  const result = await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    toParentSyncInput(localRecord),
  );

  assert(result.status === "no_session", "expected no_session");
  const stillLocal = getLocalLots().find((l) => l.id === localRecord.id);
  assert(stillLocal, "expected the local record to still exist with no session");
}

// ---- 5: a duplicate_conflict never deletes or reverts the local record ----

async function testDuplicateConflictNeverDeletesLocalRecord() {
  const client = new FakeSupabaseClient();
  client.userId = "aaaaaaaa-5555-4555-8555-555555555555";

  const localRecord = performLocalSave("Integration Test Lot 5");
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({
    data: baseRow({ id: localRecord.id, owner_id: client.userId, record_name: "Different On Server" }),
    error: null,
  });

  const result = await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    toParentSyncInput(localRecord),
  );

  assert(result.status === "duplicate_conflict", "expected duplicate_conflict");
  const stillLocal = getLocalLots().find((l) => l.id === localRecord.id);
  assert(stillLocal, "expected the local record to still exist after a duplicate_conflict");
  assert(stillLocal.lot_name === "Integration Test Lot 5", "expected local record content to be unchanged");
}

// ---- 6: success caches UUID + server updated_at, used correctly next save -

async function testSuccessCachedStateUsedByNextSave() {
  const client = new FakeSupabaseClient();
  const userId = "aaaaaaaa-6666-4666-8666-666666666666";
  client.userId = userId;

  const firstLocalSave = performLocalSave("Integration Test Lot 6");
  client.insertQueue.push({
    data: baseRow({ id: firstLocalSave.id, owner_id: userId, updated_at: "2026-06-06T06:06:06.000Z" }),
    error: null,
  });

  const firstResult = await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    toParentSyncInput(firstLocalSave),
  );
  assert(firstResult.status === "core_record_synced", "expected first save to sync");
  assert(firstResult.record?.id === firstLocalSave.id, "expected the synced record's id to equal the local id");

  const cached = readCloudCache(userId)?.records.find((r) => r.id === firstLocalSave.id);
  assert(cached?.updatedAt === "2026-06-06T06:06:06.000Z", "expected the server updated_at to be cached");

  // Simulate the user editing and saving again -- same projectId, so
  // saveLocalLot updates the SAME local record in place (this is exactly
  // what page.tsx's saveLotRecord does on a second save of a loaded
  // record).
  const secondLocalSave = saveLocalLot({
    projectId: firstLocalSave.id,
    lotName: "Integration Test Lot 6 (edited)",
    landRecord,
    polygon,
  });
  assert(secondLocalSave.id === firstLocalSave.id, "expected the second save to reuse the same stable id");
  assert(
    getLocalLots().filter((l) => l.id === firstLocalSave.id).length === 1,
    "expected exactly one local record for this id after the second save (update, not duplicate)",
  );

  client.updateQueue.push({
    data: baseRow({ id: firstLocalSave.id, owner_id: userId, record_name: "Integration Test Lot 6 (edited)", updated_at: "2026-06-07T07:07:07.000Z" }),
    error: null,
  });

  const secondResult = await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    toParentSyncInput(secondLocalSave),
  );

  assert(secondResult.status === "core_record_synced", "expected second save to sync");
  const updateCalls = client.calls.filter((c) => c.op === "update");
  assert(updateCalls.length === 1, "expected the second save to UPDATE (cache proved a cloud row already exists)");
  const updatedAtEqCall = client.eqCalls.find(
    (call) => call.column === "updated_at" && call.value === "2026-06-06T06:06:06.000Z",
  );
  assert(
    updatedAtEqCall !== undefined,
    "expected the second save's UPDATE to filter on the first save's server-confirmed updated_at",
  );
}

// ---- 7: no write to any table other than land_records across the flow -----

async function testNoChildTableWritesAcrossTheFlow() {
  const client = new FakeSupabaseClient();
  client.userId = "aaaaaaaa-7777-4777-8777-777777777777";

  const localRecord = performLocalSave("Integration Test Lot 7");
  client.insertQueue.push({ data: baseRow({ id: localRecord.id, owner_id: client.userId }), error: null });

  await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    toParentSyncInput(localRecord),
  );

  assert(
    client.calls.every((call) => call.table === "land_records"),
    "expected every call in the local-save-then-cloud-sync flow to target land_records only",
  );
}

async function main() {
  await run("Test 1 (local save is durable before any cloud call is made)", testLocalSaveHappensBeforeCloudCall);
  await run("Test 2 (cloud call uses the id the local save just produced)", testCloudCallUsesTheJustSavedLocalId);
  await run("Test 3 (network failure never deletes the local record)", testCloudNetworkFailureNeverDeletesLocalRecord);
  await run("Test 4 (no session never deletes the local record)", testNoSessionNeverDeletesLocalRecord);
  await run("Test 5 (duplicate_conflict never deletes the local record)", testDuplicateConflictNeverDeletesLocalRecord);
  await run("Test 6 (success's cached UUID/updated_at is used correctly by the next save)", testSuccessCachedStateUsedByNextSave);
  await run("Test 7 (no write to any table other than land_records across the flow)", testNoChildTableWritesAcrossTheFlow);

  if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll parent-ui-sync-integration QA tests PASSED.");
  }
}

// Minimal in-memory localStorage double shared by BOTH local-lots.ts
// (key sabahlot_local_lots_v1) and land-records/local-cache.ts (key
// sabahlot_cloud_land_records_v1:<userId>) -- exactly like the real
// browser, both modules read/write the same `window.localStorage`.
class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

Object.defineProperty(globalThis, "window", {
  value: { localStorage: new MemoryStorage() },
  configurable: true,
});

void main();
