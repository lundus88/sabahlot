// Sprint 02D-1B QA script for land_points cloud create. Run via:
//   npx tsc -p src/lib/land-records/points-write.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/points-write.qa.js
// (same convention as geometry-write.qa.ts)
//
// Uses a fake Supabase client (no network, no dependency added). Does
// not touch local-lots.ts, land-records.qa.ts, land-records-write.qa.ts,
// or geometry-write.qa.ts -- those are re-run unchanged as a separate
// regression step, not modified by this sprint.
//
// CREATE-ONLY (ADR-011): there is no updateCloudPoint to test, and this
// file asserts that no such export exists. Delete is separately
// deferred (ADR-013) -- asserted the same way.

import {
  createCloudPoint,
  isStableCloudId,
  mapCloudPoint,
  readCloudCache,
  validateCreatePointInput,
  writeCloudCache,
  type CloudLandPoint,
  type CloudLandPointRow,
  type CloudLandRecord,
  type CreatePointInput,
} from "./index";

// Sprint 02C-2 regression-fix pattern, reused here: isCloudWriteEnabled()
// requires NEXT_PUBLIC_SUPABASE_URL to resolve to the sabahlot-dev
// project. A bare `node` run has no such env var set, so every test
// below that expects a cloud call to actually happen must run with
// this set -- exactly like parent-ui-sync.qa.ts / geometry-write.qa.ts.
// Never written to any .env file and never read by production code.
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

// ---- Static assertions: create-only scope (ADR-011 / ADR-013) -------------

import * as LandRecordsIndex from "./index";

assert(
  !("updateCloudPoint" in LandRecordsIndex),
  "updateCloudPoint must not exist this sprint (ADR-011 -- no updated_at column on land_points)",
);
assert(
  !("deleteCloudPoint" in LandRecordsIndex),
  "deleteCloudPoint must not exist this sprint (ADR-013 -- delete deferred)",
);
console.log("Test 0 (create-only scope: no updateCloudPoint/deleteCloudPoint exported): PASS [static]");

// ---- Fake Supabase client ---------------------------------------------------

type TableName =
  | "land_points"
  | "land_record_geometries"
  | "land_parties"
  | "land_records"
  | "documents";

interface FakeResponse {
  data: unknown;
  error: { message: string; code?: string } | null;
}

class FakeChain implements PromiseLike<FakeResponse> {
  constructor(
    private readonly client: FakeSupabaseClient,
    private readonly table: TableName,
    private readonly mode: "select" | "insert",
  ) {}

  select() {
    return this;
  }

  eq() {
    return this;
  }

  single(): Promise<FakeResponse> {
    if (this.mode === "insert") {
      return Promise.resolve(
        this.client.insertQueue.shift() ?? {
          data: null,
          error: { message: "no insert response configured" },
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

  then<TResult1 = FakeResponse, TResult2 = never>(
    onfulfilled?: ((value: FakeResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const response = this.client.listQueue.shift() ?? { data: [], error: null };
    return Promise.resolve(response).then(onfulfilled, onrejected);
  }
}

class FakeSupabaseClient {
  calls: Array<{ op: string; table: TableName; payload?: unknown }> = [];
  insertQueue: FakeResponse[] = [];
  selectByIdQueue: FakeResponse[] = [];
  listQueue: FakeResponse[] = [];
  userId: string | null = null;

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
        return new FakeChain(this, table, "insert");
      },
      update: (): never => {
        throw new Error(`update() must never be called on ${table} in Sprint 02D-1B (points are create-only)`);
      },
      select: () => {
        this.calls.push({ op: "select", table });
        return new FakeChain(this, table, "select");
      },
      delete: (): never => {
        throw new Error(`delete() must never be called on ${table} in Sprint 02D-1B`);
      },
    };
  }
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "99999999-9999-4999-8999-999999999999";
const LAND_RECORD_ID = "22222222-2222-4222-8222-222222222222";
const POINT_ID = "33333333-3333-4333-8333-333333333333";

function basePointRow(overrides: Partial<CloudLandPointRow> = {}): CloudLandPointRow {
  return {
    id: POINT_ID,
    land_record_id: LAND_RECORD_ID,
    captured_by: USER_A,
    point_type: "boundary_mark",
    label: "Corner 1",
    latitude: 5.98,
    longitude: 116.07,
    altitude: null,
    accuracy_m: 3.2,
    altitude_accuracy_m: null,
    heading: null,
    speed: null,
    quality_grade: "B",
    capture_method: "averaged",
    source: "phone-gps",
    sample_count: 12,
    occupation_seconds: 30,
    distance_difference_m: null,
    bearing_degrees: null,
    note: null,
    captured_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function basePointInput(overrides: Partial<CreatePointInput> = {}): CreatePointInput {
  return {
    id: POINT_ID,
    landRecordId: LAND_RECORD_ID,
    pointType: "boundary_mark",
    label: "Corner 1",
    latitude: 5.98,
    longitude: 116.07,
    accuracyM: 3.2,
    qualityGrade: "B",
    captureMethod: "averaged",
    source: "phone-gps",
    sampleCount: 12,
    occupationSeconds: 30,
    capturedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseCachedRecord(overrides: Partial<CloudLandRecord> = {}): CloudLandRecord {
  return {
    id: LAND_RECORD_ID,
    recordName: "Test Lot",
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
    points: [],
    parties: [],
    ownerName: null,
    originalApplicantStatus: "",
    ...overrides,
  };
}

// ==== Authentication and ownership ==========================================

async function test1_UserACreateLinkedPoint() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: basePointRow(), error: null });

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput(),
  );

  assert(result.ok, "expected User A create to succeed");
  if (result.ok) {
    assert(result.state === "points_synced", "expected points_synced state");
  }
  console.log("Test 1 (User A create linked point): PASS [executed]");
}

async function test2_UserBRejectedOnParentUserA() {
  const client = new FakeSupabaseClient();
  client.userId = USER_B;
  client.insertQueue.push({
    data: null,
    error: { message: "new row violates row-level security policy", code: "42501" },
  });

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput(),
  );

  assert(!result.ok, "expected User B create for User A's parent to fail");
  if (!result.ok) {
    assert(
      result.code === "database_error",
      "expected database_error (RLS denial surfaces as a generic database error, not swallowed as success)",
    );
  }
  console.log("Test 2 (User B rejected on User A's parent): PASS [executed]");
}

async function test3_AnonymousCreateRejected() {
  const client = new FakeSupabaseClient();
  client.userId = null;

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput(),
  );

  assert(!result.ok, "expected anonymous create to fail");
  if (!result.ok) {
    assert(result.code === "unauthenticated", "expected unauthenticated");
  }
  const insertCalls = client.calls.filter((c) => c.op === "insert");
  assert(insertCalls.length === 0, "no insert should be attempted without a session");
  console.log("Test 3 (anonymous create rejected, no session): PASS [executed]");
}

async function test4_CapturedByInjectionNotUsed() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: basePointRow(), error: null });

  const maliciousInput = {
    ...basePointInput(),
    capturedBy: USER_B,
    captured_by: USER_B,
    owner_id: USER_B,
  } as unknown as CreatePointInput;

  await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    maliciousInput,
  );

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(
    payload?.captured_by === USER_A,
    "captured_by in the insert payload must always be the session user, never caller-supplied",
  );
  console.log("Test 4 (captured_by injection not used, session user always wins): PASS [executed]");
}

async function test5_UnlinkedPointOwnedByCapturedBy() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: basePointRow({ land_record_id: null }),
    error: null,
  });

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput({ landRecordId: null }),
  );

  assert(result.ok, "expected unlinked point create to succeed");
  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(payload?.land_record_id === null, "land_record_id must be null for an unlinked point");
  assert(payload?.captured_by === USER_A, "captured_by must be set for an unlinked point (RLS requires it)");
  console.log("Test 5 (unlinked point owned via captured_by): PASS [executed]");
}

// ==== Validation =============================================================

async function test6_ValidPointAccepted() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: basePointRow(), error: null });

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput(),
  );
  assert(result.ok, "expected a valid point to be accepted");
  console.log("Test 6 (valid point accepted): PASS [executed]");
}

async function test7_InvalidPointTypeRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput({ pointType: "not_a_real_type" as unknown as CreatePointInput["pointType"] }),
  );
  assert(!result.ok && result.code === "validation_failed", "expected invalid pointType to be rejected");
  assert(client.calls.every((c) => c.op !== "insert"), "no insert should be attempted for invalid input");
  console.log("Test 7 (invalid pointType rejected): PASS [executed]");
}

async function test8_InvalidLatitudeRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput({ latitude: 95 }),
  );
  assert(!result.ok && result.code === "validation_failed", "expected out-of-range latitude to be rejected");
  console.log("Test 8 (invalid latitude rejected): PASS [executed]");
}

async function test9_InvalidLongitudeRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput({ longitude: 200 }),
  );
  assert(!result.ok && result.code === "validation_failed", "expected out-of-range longitude to be rejected");
  console.log("Test 9 (invalid longitude rejected): PASS [executed]");
}

async function test10_NaNInfinityRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result1 = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput({ latitude: Number.NaN }),
  );
  assert(!result1.ok && result1.code === "validation_failed", "expected NaN latitude to be rejected");

  const result2 = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput({ longitude: Number.POSITIVE_INFINITY }),
  );
  assert(!result2.ok && result2.code === "validation_failed", "expected Infinity longitude to be rejected");
  console.log("Test 10 (NaN/Infinity rejected): PASS [executed]");
}

async function test11_InvalidQualityGradeRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput({ qualityGrade: "Z" as unknown as CreatePointInput["qualityGrade"] }),
  );
  assert(!result.ok && result.code === "validation_failed", "expected invalid qualityGrade to be rejected");
  console.log("Test 11 (invalid qualityGrade rejected): PASS [executed]");
}

async function test12_InvalidCaptureMethodRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput({ captureMethod: "guessed" as unknown as CreatePointInput["captureMethod"] }),
  );
  assert(!result.ok && result.code === "validation_failed", "expected invalid captureMethod to be rejected");
  console.log("Test 12 (invalid captureMethod rejected): PASS [executed]");
}

async function test13_InvalidSourceRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput({ source: "satellite" as unknown as CreatePointInput["source"] }),
  );
  assert(!result.ok && result.code === "validation_failed", "expected invalid source to be rejected");
  console.log("Test 13 (invalid source rejected): PASS [executed]");
}

async function test14_InvalidCapturedAtRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput({ capturedAt: "not-a-date" }),
  );
  assert(!result.ok && result.code === "validation_failed", "expected invalid capturedAt to be rejected");
  console.log("Test 14 (invalid capturedAt rejected): PASS [executed]");
}

async function test15_InvalidParentIdRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput({ landRecordId: "not-a-uuid" }),
  );
  assert(!result.ok && result.code === "invalid_parent_id", "expected non-UUID landRecordId to be rejected");
  assert(client.calls.every((c) => c.op !== "insert"), "no insert should be attempted for an invalid parent id");
  console.log("Test 15 (invalid landRecordId rejected): PASS [executed]");
}

async function test16_LegacyPointIdRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput({ id: "local-1234567-abc" }),
  );
  assert(
    !result.ok && result.code === "legacy_child_id_requires_mapping",
    "expected a non-UUID legacy point id to be rejected without an upload attempt",
  );
  assert(client.calls.every((c) => c.op !== "insert"), "no insert should be attempted for a legacy id");
  console.log("Test 16 (legacy non-UUID point id rejected): PASS [executed]");
}

async function test17_UnknownPayloadKeyStripped() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: basePointRow(), error: null });

  const inputWithExtra = {
    ...basePointInput(),
    someRandomField: "should never reach the database",
  } as unknown as CreatePointInput;

  await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    inputWithExtra,
  );

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(
    !("someRandomField" in (payload ?? {})) && !("some_random_field" in (payload ?? {})),
    "unknown payload key must never reach the database",
  );
  console.log("Test 17 (unknown payload key never reaches the database): PASS [executed]");
}

async function test18_CapturedAtOmittedNotInvented() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: basePointRow(), error: null });

  const fullInput = basePointInput();
  const inputWithoutCapturedAt = Object.fromEntries(
    Object.entries(fullInput).filter(([key]) => key !== "capturedAt"),
  );

  await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    inputWithoutCapturedAt as CreatePointInput,
  );

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(
    !("captured_at" in (payload ?? {})),
    "captured_at must be omitted (letting the column default apply), not invented client-side",
  );
  console.log("Test 18 (capturedAt omitted -> not invented, column default applies): PASS [executed]");
}

// ==== Idempotency / duplicate resolution ====================================

async function test19_RetryIdenticalPayloadSucceeds() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: basePointRow(), error: null });

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput(),
  );

  assert(result.ok, "expected identical-payload retry to be treated as verified success");
  if (result.ok) {
    assert(result.state === "points_synced", "expected points_synced on verified retry");
  }
  console.log("Test 19 (retry, identical payload, verified success): PASS [executed]");
}

async function test20_RetryDifferentPayloadConflicts() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: basePointRow({ note: "original note" }), error: null });

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput({ note: "a different note" }),
  );

  assert(!result.ok, "expected different-payload retry to be a conflict, not a false success");
  if (!result.ok) {
    assert(result.code === "duplicate_conflict", "expected duplicate_conflict");
  }
  console.log("Test 20 (retry, different payload, duplicate_conflict): PASS [executed]");
}

async function test21_InaccessibleDuplicateNotTreatedAsSuccess() {
  const client = new FakeSupabaseClient();
  client.userId = USER_B;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  // RLS filters the follow-up read for User B -- row invisible.
  client.selectByIdQueue.push({ data: null, error: null });

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput(),
  );

  assert(!result.ok, "expected an inaccessible duplicate to never be reported as success");
  if (!result.ok) {
    assert(result.code === "not_found_or_forbidden", "expected not_found_or_forbidden (no ownership leak)");
  }
  console.log("Test 21 (inaccessible duplicate is not success, no ownership leak): PASS [executed]");
}

async function test22_ConcurrentSamePayloadBothSucceed() {
  // Conceptual/mock: single-threaded event loop, same pattern used by
  // geometry-write.qa.ts for its equivalent test.
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: basePointRow(), error: null });
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: basePointRow(), error: null });

  const [result1, result2] = await Promise.all([
    createCloudPoint(client as unknown as Parameters<typeof createCloudPoint>[0], basePointInput()),
    createCloudPoint(client as unknown as Parameters<typeof createCloudPoint>[0], basePointInput()),
  ]);

  assert(result1.ok && result2.ok, "expected both concurrent identical-payload creates to report success");
  console.log("Test 22 (concurrent same payload -> one row, both succeed) [conceptual/mock]: PASS");
}

async function test23_ConcurrentDifferentPayloadOneConflicts() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: basePointRow({ note: "first" }), error: null });
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: basePointRow({ note: "first" }), error: null });

  const [result1, result2] = await Promise.all([
    createCloudPoint(
      client as unknown as Parameters<typeof createCloudPoint>[0],
      basePointInput({ note: "first" }),
    ),
    createCloudPoint(
      client as unknown as Parameters<typeof createCloudPoint>[0],
      basePointInput({ note: "second" }),
    ),
  ]);

  const outcomes = [result1, result2];
  const successes = outcomes.filter((r) => r.ok);
  const conflicts = outcomes.filter((r) => !r.ok && r.code === "duplicate_conflict");
  assert(successes.length === 1, "expected exactly one success");
  assert(conflicts.length === 1, "expected exactly one duplicate_conflict");
  console.log(
    "Test 23 (concurrent different payload -> one success, one duplicate_conflict) [conceptual/mock]: PASS",
  );
}

// ==== Cache isolation ========================================================

function withCloudCacheStorage<T>(fn: () => T): T {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  (globalThis as unknown as { window: Window }).window = globalThis as unknown as Window;
  return fn();
}

async function test24_SuccessfulCreateUpdatesOnlyCreatingUsersCache() {
  await withCloudCacheStorage(async () => {
    writeCloudCache(USER_A, [baseCachedRecord()], "2026-01-01T00:00:00.000Z");
    writeCloudCache(
      USER_B,
      [baseCachedRecord({ id: "44444444-4444-4444-8444-444444444444" })],
      "2026-01-01T00:00:00.000Z",
    );

    const client = new FakeSupabaseClient();
    client.userId = USER_A;
    client.insertQueue.push({ data: basePointRow(), error: null });

    await createCloudPoint(
      client as unknown as Parameters<typeof createCloudPoint>[0],
      basePointInput(),
    );

    const cacheA = readCloudCache(USER_A);
    const cacheB = readCloudCache(USER_B);
    assert(
      cacheA?.records[0]?.points.some((p) => p.id === POINT_ID),
      "User A's cache must contain the newly created point",
    );
    assert(
      !cacheB?.records[0]?.points.some((p) => p.id === POINT_ID),
      "User B's cache must never be touched by User A's write",
    );
  });
  console.log("Test 24 (successful create changes only the creating user's cache): PASS [executed]");
}

async function test25_CloudFailureKeepsOldCache() {
  await withCloudCacheStorage(async () => {
    writeCloudCache(USER_A, [baseCachedRecord()], "2026-01-01T00:00:00.000Z");

    const client = new FakeSupabaseClient();
    client.userId = USER_A;
    client.insertQueue.push({
      data: null,
      error: { message: "connection reset", code: "08006" },
    });

    await createCloudPoint(
      client as unknown as Parameters<typeof createCloudPoint>[0],
      basePointInput(),
    );

    const cache = readCloudCache(USER_A);
    assert(
      cache?.records[0]?.points.length === 0,
      "a failed cloud create must leave the existing cache unchanged",
    );
  });
  console.log("Test 25 (cloud failure keeps old cache unchanged): PASS [executed]");
}

async function test26_UnlinkedPointCacheIsNoOp() {
  await withCloudCacheStorage(async () => {
    writeCloudCache(USER_A, [baseCachedRecord()], "2026-01-01T00:00:00.000Z");

    const client = new FakeSupabaseClient();
    client.userId = USER_A;
    client.insertQueue.push({ data: basePointRow({ land_record_id: null }), error: null });

    const result = await createCloudPoint(
      client as unknown as Parameters<typeof createCloudPoint>[0],
      basePointInput({ landRecordId: null }),
    );

    assert(result.ok, "expected the unlinked create itself to still succeed");
    const cache = readCloudCache(USER_A);
    assert(
      cache?.records[0]?.points.length === 0,
      "an unlinked point has no cached parent to attach to -- this must be a documented no-op, not a crash",
    );
  });
  console.log("Test 26 (unlinked point cache update is a documented no-op): PASS [executed]");
}

async function test27_ConflictDoesNotChangeCache() {
  await withCloudCacheStorage(async () => {
    writeCloudCache(USER_A, [baseCachedRecord()], "2026-01-01T00:00:00.000Z");

    const client = new FakeSupabaseClient();
    client.userId = USER_A;
    client.insertQueue.push({
      data: null,
      error: { message: "duplicate key value violates unique constraint", code: "23505" },
    });
    client.selectByIdQueue.push({ data: basePointRow({ note: "different" }), error: null });

    await createCloudPoint(
      client as unknown as Parameters<typeof createCloudPoint>[0],
      basePointInput({ note: "attempted" }),
    );

    const cache = readCloudCache(USER_A);
    assert(cache?.records[0]?.points.length === 0, "a duplicate_conflict must never touch the cache");
  });
  console.log("Test 27 (duplicate conflict does not change cache): PASS [executed]");
}

// ==== Sync-state / scope invariants =========================================

async function test28_PointSuccessProducesPointsSynced() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: basePointRow(), error: null });

  const result = await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput(),
  );
  assert(result.ok && result.state === "points_synced", "point success must report points_synced");
  assert(
    !(result as { state: string }).state.includes("core_record_synced"),
    "point success must never claim core_record_synced",
  );
  console.log("Test 28 (point success produces points_synced, not core_record_synced): PASS [executed]");
}

async function test29_NoWriteToAnyOtherTable() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: basePointRow(), error: null });

  await createCloudPoint(
    client as unknown as Parameters<typeof createCloudPoint>[0],
    basePointInput(),
  );

  const nonPointWrites = client.calls.filter(
    (c) => c.table !== "land_points" && (c.op === "insert" || c.op === "update" || c.op === "delete"),
  );
  assert(nonPointWrites.length === 0, "no write to any table other than land_points may occur");
  console.log("Test 29 (no write to any other table): PASS [executed]");
}

async function test30_ReloadPersistenceTest() {
  await withCloudCacheStorage(async () => {
    writeCloudCache(USER_A, [baseCachedRecord()], "2026-01-01T00:00:00.000Z");

    const client = new FakeSupabaseClient();
    client.userId = USER_A;
    client.insertQueue.push({ data: basePointRow(), error: null });

    const createResult = await createCloudPoint(
      client as unknown as Parameters<typeof createCloudPoint>[0],
      basePointInput(),
    );
    assert(createResult.ok, "setup: create must succeed for the reload test to be meaningful");

    // Simulate a page reload: a fresh read of the cache (not the
    // in-memory result of the create call) must already reflect the
    // point that was just synced.
    const reloadedCache = readCloudCache(USER_A);
    const reloadedPoint = reloadedCache?.records[0]?.points.find((p) => p.id === POINT_ID);

    assert(reloadedPoint !== undefined, "point must be present in the cache after a simulated reload");
    assert(
      reloadedPoint?.latitude === 5.98 && reloadedPoint?.longitude === 116.07,
      "reloaded point must match the originally synced coordinates",
    );
  });
  console.log("Test 30 (reload persistence: point survives a simulated reload via cache): PASS [executed]");
}

// ==== Direct validation/mapping sanity (no coordinator involved) ===========

async function test31_ValidateCreatePointInputDirectly() {
  const valid = validateCreatePointInput(basePointInput());
  assert(valid.ok, "a well-formed CreatePointInput must pass validateCreatePointInput directly");

  const invalid = validateCreatePointInput(basePointInput({ pointType: "bogus" as unknown as CreatePointInput["pointType"] }));
  assert(!invalid.ok, "an invalid pointType must fail validateCreatePointInput directly");
  console.log("Test 31 (validateCreatePointInput direct sanity check): PASS [executed]");
}

async function test32_MapCloudPointRoundTrip() {
  const row = basePointRow();
  const mapped: CloudLandPoint = mapCloudPoint(row);
  assert(mapped.id === row.id, "mapCloudPoint must preserve id");
  assert(mapped.pointType === row.point_type, "mapCloudPoint must preserve pointType");
  assert(mapped.latitude === row.latitude && mapped.longitude === row.longitude, "mapCloudPoint must preserve coordinates");
  console.log("Test 32 (mapCloudPoint round-trip sanity check, pre-existing mapper reused unmodified): PASS [executed]");
}

async function test33_IsStableCloudIdSanity() {
  assert(isStableCloudId(POINT_ID), "a well-formed UUID must be recognized as a stable cloud id");
  assert(!isStableCloudId("local-123-abc"), "a legacy local id must not be recognized as a stable cloud id");
  console.log("Test 33 (isStableCloudId sanity check, pre-existing helper reused unmodified): PASS [executed]");
}

// ---- Runner -----------------------------------------------------------------

async function main() {
  await test1_UserACreateLinkedPoint();
  await test2_UserBRejectedOnParentUserA();
  await test3_AnonymousCreateRejected();
  await test4_CapturedByInjectionNotUsed();
  await test5_UnlinkedPointOwnedByCapturedBy();
  await test6_ValidPointAccepted();
  await test7_InvalidPointTypeRejected();
  await test8_InvalidLatitudeRejected();
  await test9_InvalidLongitudeRejected();
  await test10_NaNInfinityRejected();
  await test11_InvalidQualityGradeRejected();
  await test12_InvalidCaptureMethodRejected();
  await test13_InvalidSourceRejected();
  await test14_InvalidCapturedAtRejected();
  await test15_InvalidParentIdRejected();
  await test16_LegacyPointIdRejected();
  await test17_UnknownPayloadKeyStripped();
  await test18_CapturedAtOmittedNotInvented();
  await test19_RetryIdenticalPayloadSucceeds();
  await test20_RetryDifferentPayloadConflicts();
  await test21_InaccessibleDuplicateNotTreatedAsSuccess();
  await test22_ConcurrentSamePayloadBothSucceed();
  await test23_ConcurrentDifferentPayloadOneConflicts();
  await test24_SuccessfulCreateUpdatesOnlyCreatingUsersCache();
  await test25_CloudFailureKeepsOldCache();
  await test26_UnlinkedPointCacheIsNoOp();
  await test27_ConflictDoesNotChangeCache();
  await test28_PointSuccessProducesPointsSynced();
  await test29_NoWriteToAnyOtherTable();
  await test30_ReloadPersistenceTest();
  await test31_ValidateCreatePointInputDirectly();
  await test32_MapCloudPointRoundTrip();
  await test33_IsStableCloudIdSanity();

  console.log("\nSprint 02D-1B points cloud-write (create-only) QA: ALL PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
