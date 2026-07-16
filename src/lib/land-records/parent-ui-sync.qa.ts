// Sprint 02C-2 QA script for the parent land_records UI sync helper.
// Run via:
//   npx tsc -p src/lib/land-records/parent-ui-sync.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/parent-ui-sync.qa.js
// (same convention as land-records-write.qa.ts / geometry-write.qa.ts)
//
// Uses a fake Supabase client (no network). Only ever touches the
// "land_records" table -- the fake client's TableName union is
// deliberately restricted to that one table so any accidental
// geometry/points/parties/documents call would fail to compile, not
// just fail at runtime.

import {
  readCloudCache,
  syncParentLandRecordToCloud,
  type ParentSyncInput,
} from "./index";

// Sprint 02C-2 (independent-review fix): isCloudWriteEnabled() now also
// requires NEXT_PUBLIC_SUPABASE_URL to resolve to the sabahlot-dev
// project (see feature-gate.ts / feature-gate.qa.ts for the dedicated,
// exhaustive test of that check in isolation). A bare `node` run of
// this script has no such env var set at all, so every test below that
// expects a cloud call to actually happen must run with this set --
// otherwise every one of them would silently fail closed and this
// script would stop proving anything about create/update/conflict
// behaviour.
const DEV_SUPABASE_URL = "https://xsflrehitrmobiyfbfhk.supabase.co";
Object.assign(process.env, {
  NODE_ENV: "development",
  NEXT_PUBLIC_SUPABASE_URL: DEV_SUPABASE_URL,
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

// ---- Fake Supabase client (land_records only) ------------------------------

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

const USER_A = "33333333-3333-4333-8333-333333333333";
const RECORD_ID = "44444444-4444-4444-8444-444444444444";
const LEGACY_ID = "local-1720000000000-abc123";

function baseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: RECORD_ID,
    owner_id: USER_A,
    record_name: "QA Parent Sync Record",
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

const baseInput: ParentSyncInput = {
  localId: RECORD_ID,
  recordName: "QA Parent Sync Record",
};

// The cloud cache is namespaced per user id (local-cache.ts) and the
// in-memory localStorage double below persists for the whole script run --
// each test gets its own user id so an earlier test's cached record can
// never leak into a later test's create-vs-update decision.
let userSeq = 0;
function nextUserId(): string {
  userSeq += 1;
  return `qa-user-${userSeq}`;
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

// ---- 1: create produces a stable cloud UUID, matching the local id --------

async function testCreateProducesStableUuid() {
  const client = new FakeSupabaseClient();
  client.userId = nextUserId();
  client.insertQueue.push({ data: baseRow(), error: null });

  const result = await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    baseInput,
  );

  assert(result.status === "core_record_synced", "expected core_record_synced");
  assert(result.record?.id === RECORD_ID, "expected the cloud id to equal the local id (ADR-001)");
  const insertCalls = client.calls.filter((c) => c.op === "insert");
  assert(insertCalls.length === 1, "expected exactly one insert");
}

// ---- 2: server response's updated_at is carried through -------------------

async function testServerUpdatedAtIsCarriedThrough() {
  const client = new FakeSupabaseClient();
  client.userId = nextUserId();
  client.insertQueue.push({
    data: baseRow({ updated_at: "2026-02-02T02:02:02.000Z" }),
    error: null,
  });

  const result = await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    baseInput,
  );

  assert(result.status === "core_record_synced", "expected core_record_synced");
  assert(
    result.record?.updatedAt === "2026-02-02T02:02:02.000Z",
    "expected server updated_at to be carried through to the domain record",
  );
}

// ---- 3: update uses the cached id and last-known updated_at ---------------

async function testUpdateUsesCachedUuidAndUpdatedAt() {
  const client = new FakeSupabaseClient();
  const userId = nextUserId();
  client.userId = userId;

  // Seed the per-user cache the way a prior successful create would have.
  client.insertQueue.push({ data: baseRow(), error: null });
  await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    baseInput,
  );

  const cachedBefore = readCloudCache(userId)?.records.find((r) => r.id === RECORD_ID);
  assert(cachedBefore?.updatedAt === "2026-01-01T00:00:00.000Z", "expected cache seeded from create");

  client.updateQueue.push({
    data: baseRow({ record_name: "Updated Name", updated_at: "2026-03-03T03:03:03.000Z" }),
    error: null,
  });

  const result = await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    { ...baseInput, recordName: "Updated Name" },
  );

  assert(result.status === "core_record_synced", "expected update to succeed");
  const updateCalls = client.calls.filter((c) => c.op === "update");
  assert(updateCalls.length === 1, "expected exactly one update (no create attempted)");
  const updatedAtEqCall = client.eqCalls.find(
    (call) => call.column === "updated_at" && call.value === "2026-01-01T00:00:00.000Z",
  );
  assert(updatedAtEqCall !== undefined, "expected UPDATE to filter on the cached updated_at");
}

// ---- 4: retry create with identical payload is safe (idempotent) ----------

async function testRetryCreateSamePayloadIsSafe() {
  const client = new FakeSupabaseClient();
  const userId = nextUserId();
  client.userId = userId;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: baseRow({ owner_id: userId }), error: null });

  const result = await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    baseInput,
  );

  assert(result.status === "core_record_synced", "expected idempotent retry to resolve as success");
}

// ---- 5: duplicate id, different payload is NOT treated as success ---------

async function testDuplicateDifferentPayloadIsConflict() {
  const client = new FakeSupabaseClient();
  const userId = nextUserId();
  client.userId = userId;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({
    data: baseRow({ owner_id: userId, record_name: "Different On Server" }),
    error: null,
  });

  const cacheBefore = readCloudCache(userId);
  const result = await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    baseInput,
  );
  const cacheAfter = readCloudCache(userId);

  assert(result.status === "duplicate_conflict", "expected duplicate_conflict, not a silent overwrite");
  assert(
    JSON.stringify(cacheBefore) === JSON.stringify(cacheAfter),
    "cache must be unchanged on duplicate_conflict",
  );
}

// ---- 6: stale update produces a conflict, never a silent overwrite --------

async function testStaleUpdateIsConflict() {
  const client = new FakeSupabaseClient();
  client.userId = nextUserId();

  client.insertQueue.push({ data: baseRow(), error: null });
  await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    baseInput,
  );

  // Update fails to match any row (updated_at moved on elsewhere) -- single()
  // raises PGRST116, then the diagnosis read finds the row IS still owned
  // by this user (so it is a genuine stale conflict, not not-found).
  client.updateQueue.push({ data: null, error: { message: "no rows", code: "PGRST116" } });
  client.selectByIdQueue.push({
    data: baseRow({ updated_at: "2026-05-05T05:05:05.000Z" }),
    error: null,
  });

  const result = await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    { ...baseInput, recordName: "Locally Edited Name" },
  );

  assert(result.status === "stale_conflict", "expected stale_conflict");
  assert(result.serverRecord?.updatedAt === "2026-05-05T05:05:05.000Z", "expected serverRecord to carry the newer updated_at");
}

// ---- 7: production stays local-only, even with the correct dev URL -------

async function testProductionStaysLocalOnlyEvenWithCorrectDevUrl() {
  const originalEnv = process.env.NODE_ENV;
  // NODE_ENV is typed read-only in newer @types/node -- Object.assign
  // performs the same runtime mutation without tripping that check.
  // NEXT_PUBLIC_SUPABASE_URL is deliberately left at the correct
  // sabahlot-dev value (set once, above) for this test -- proving the
  // gate stays closed in production for a NODE_ENV reason alone, not
  // because the URL was also wrong.
  Object.assign(process.env, { NODE_ENV: "production" });

  try {
    const client = new FakeSupabaseClient();
    client.userId = nextUserId();

    const result = await syncParentLandRecordToCloud(
      client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
      baseInput,
    );

    assert(result.status === "local_only", "expected local_only when the cloud write gate is disabled");
    assert(result.localOnlyReason === "gate_disabled", "expected gate_disabled reason");
    assert(client.calls.length === 0, "expected no network calls at all when the gate is disabled");
  } finally {
    Object.assign(process.env, { NODE_ENV: originalEnv });
  }
}

// ---- 7b: a different project's URL stays local-only, zero cloud calls ----

async function testWrongProjectUrlStaysLocalOnly() {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://someotherproject.supabase.co",
  });

  try {
    const client = new FakeSupabaseClient();
    // A valid session is deliberately present here, so a failure can
    // only be attributed to the project-ref check, not to no_session.
    client.userId = nextUserId();

    const result = await syncParentLandRecordToCloud(
      client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
      baseInput,
    );

    assert(result.status === "local_only", "expected local_only for a non-sabahlot-dev project URL");
    assert(result.localOnlyReason === "gate_disabled", "expected gate_disabled reason");
    assert(client.calls.length === 0, "expected zero cloud calls when the configured project is not sabahlot-dev");
  } finally {
    Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: originalUrl });
  }
}

// ---- 7c: a missing/empty URL stays local-only, zero cloud calls ----------

async function testMissingUrlStaysLocalOnly() {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "" });

  try {
    const client = new FakeSupabaseClient();
    client.userId = nextUserId();

    const result = await syncParentLandRecordToCloud(
      client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
      baseInput,
    );

    assert(result.status === "local_only", "expected local_only for an empty/missing Supabase URL");
    assert(result.localOnlyReason === "gate_disabled", "expected gate_disabled reason");
    assert(client.calls.length === 0, "expected zero cloud calls when no Supabase URL is configured");
  } finally {
    Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: originalUrl });
  }
}

// ---- 8: no session never destroys local data (no network call at all) ----

async function testNoSessionMakesNoNetworkCall() {
  const client = new FakeSupabaseClient();
  client.userId = null;

  const result = await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    baseInput,
  );

  assert(result.status === "no_session", "expected no_session");
  assert(client.calls.length === 0, "expected no insert/update attempt without a session");
}

// ---- 9: a thrown network/database failure is caught, never propagated -----

async function testThrownFailureIsCaughtAsNetworkError() {
  const client = new FakeSupabaseClient();
  client.userId = nextUserId();
  client.throwOnSingle = true;

  const result = await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    baseInput,
  );

  assert(result.status === "network_error", "expected network_error, not a thrown exception");
}

// ---- 10: cache reflects server data after success, and a later save uses it ----

async function testCacheReflectsServerDataAfterSuccess() {
  const client = new FakeSupabaseClient();
  const userId = nextUserId();
  client.userId = userId;
  client.insertQueue.push({ data: baseRow({ village: "Kg. Example" }), error: null });

  await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    baseInput,
  );

  const cached = readCloudCache(userId)?.records.find((r) => r.id === RECORD_ID);
  assert(cached?.village === "Kg. Example", "expected cache to hold the server-confirmed value");

  // A second save for the same local id must now go through UPDATE, not
  // CREATE, because the cache proves a cloud row already exists.
  client.updateQueue.push({ data: baseRow({ village: "Kg. Example" }), error: null });
  await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    baseInput,
  );

  const insertCalls = client.calls.filter((c) => c.op === "insert");
  const updateCalls = client.calls.filter((c) => c.op === "update");
  assert(insertCalls.length === 1, "expected only the first save to insert");
  assert(updateCalls.length === 1, "expected the second save to update, using cached state");
}

// ---- 11: never writes to any table other than land_records ----------------

async function testNeverWritesOutsideLandRecords() {
  const client = new FakeSupabaseClient();
  client.userId = nextUserId();
  client.insertQueue.push({ data: baseRow(), error: null });

  await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    baseInput,
  );

  assert(
    client.calls.every((call) => call.table === "land_records"),
    "expected every call to target land_records only",
  );
}

// ---- 12: legacy (pre-UUID) local id is never uploaded automatically -------

async function testLegacyIdStaysLocalOnly() {
  const client = new FakeSupabaseClient();
  client.userId = nextUserId();

  const result = await syncParentLandRecordToCloud(
    client as unknown as Parameters<typeof syncParentLandRecordToCloud>[0],
    { ...baseInput, localId: LEGACY_ID },
  );

  assert(result.status === "local_only", "expected local_only for a legacy non-UUID id");
  assert(result.localOnlyReason === "legacy_id", "expected legacy_id reason");
  assert(client.calls.length === 0, "expected no network call for a legacy id");
}

async function main() {
  await run("Test 1 (create produces a stable cloud UUID matching the local id)", testCreateProducesStableUuid);
  await run("Test 2 (server updated_at is carried through)", testServerUpdatedAtIsCarriedThrough);
  await run("Test 3 (update uses cached UUID and last-known updated_at)", testUpdateUsesCachedUuidAndUpdatedAt);
  await run("Test 4 (retry create, identical payload, safe/idempotent)", testRetryCreateSamePayloadIsSafe);
  await run("Test 5 (duplicate id, different payload -> conflict, no overwrite)", testDuplicateDifferentPayloadIsConflict);
  await run("Test 6 (stale update -> conflict, no silent overwrite)", testStaleUpdateIsConflict);
  await run("Test 7 (production stays local-only even with the correct dev URL)", testProductionStaysLocalOnlyEvenWithCorrectDevUrl);
  await run("Test 7b (a different project's URL stays local-only, zero cloud calls)", testWrongProjectUrlStaysLocalOnly);
  await run("Test 7c (missing/empty URL stays local-only, zero cloud calls)", testMissingUrlStaysLocalOnly);
  await run("Test 8 (no session -> no_session, no network call)", testNoSessionMakesNoNetworkCall);
  await run("Test 9 (thrown failure -> network_error, never propagated)", testThrownFailureIsCaughtAsNetworkError);
  await run("Test 10 (cache reflects server data; later save updates using it)", testCacheReflectsServerDataAfterSuccess);
  await run("Test 11 (never writes outside land_records)", testNeverWritesOutsideLandRecords);
  await run("Test 12 (legacy id stays local-only)", testLegacyIdStaysLocalOnly);

  if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll parent-ui-sync QA tests PASSED.");
  }
}

// Minimal in-memory localStorage double, same pattern as the other .qa.ts
// files (land-records-write.qa.ts, geometry-write.qa.ts) -- readCloudCache /
// writeCloudCache are no-ops without a `window`, which would silently
// disable this script's cache-based create-vs-update assertions.
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
