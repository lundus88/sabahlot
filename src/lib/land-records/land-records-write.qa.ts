// Sprint 02C QA script for cloud create/update. Run via:
//   npx tsc -p src/lib/land-records/land-records-write.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/land-records-write.qa.js
// (same convention as land-records.qa.ts / local-lots.qa.ts)
//
// Uses a fake Supabase client (no network). Does not touch
// src/lib/local-lots.ts or land-records.qa.ts -- those are re-run
// unchanged as a separate verification step (see Sprint 02C report).

import {
  createCloudLandRecord,
  isStableCloudId,
  mapCloudGeometryToDrawingObject,
  MapperError,
  readCloudCache,
  updateCloudLandRecord,
  type CloudLandRecordGeometryRow,
  type CreateLandRecordInput,
} from "./index";

// Sprint 02C-2 QA regression fix: isCloudWriteEnabled() now also
// requires NEXT_PUBLIC_SUPABASE_URL to resolve to the sabahlot-dev
// project (see feature-gate.ts / feature-gate.qa.ts for the dedicated
// test of that check in isolation). This script predates that change
// and never set the var, so every create/update below was silently
// short-circuited to "gate disabled" before ever reaching the fake
// Supabase client -- this sets it for this QA process only, exactly
// like parent-ui-sync.qa.ts already does. Never written to any .env
// file and never read by production code paths.
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

// ---- Fake Supabase client -------------------------------------------------

type TableName = "land_records" | "land_record_geometries" | "land_points" | "land_parties" | "documents";

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
  eq() {
    return this;
  }
  order() {
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
  insertQueue: FakeResponse[] = [];
  updateQueue: FakeResponse[] = [];
  selectByIdQueue: FakeResponse[] = [];
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
        throw new Error(`delete() must never be called on ${table} in Sprint 02C`);
      },
    };
  }
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "99999999-9999-4999-8999-999999999999";
const RECORD_ID = "22222222-2222-4222-8222-222222222222";

function baseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: RECORD_ID,
    owner_id: USER_A,
    record_name: "QA Write Record",
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

const baseInput: CreateLandRecordInput = {
  id: RECORD_ID,
  recordName: "QA Write Record",
};

// ---- 1: authenticated create succeeds --------------------------------------

async function testAuthenticatedCreate() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: baseRow(), error: null });

  const result = await createCloudLandRecord(
    client as unknown as Parameters<typeof createCloudLandRecord>[0],
    baseInput,
  );

  assert(result.ok, "expected create to succeed");
  if (result.ok) {
    assert(result.state === "record_synced", "expected record_synced state, not a bare 'synced'");
  }
  console.log("Test 1 (authenticated create succeeds, record_synced): PASS");
}

// ---- 2/3: retry / double invocation with same id resolves as success, no duplicate row ----

async function testDuplicateRetryResolvesAsSuccess() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  // First attempt: simulate the insert already having succeeded server-side
  // (e.g. a timed-out first request) -- the retry hits 23505.
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: baseRow(), error: null });

  const result = await createCloudLandRecord(
    client as unknown as Parameters<typeof createCloudLandRecord>[0],
    baseInput,
  );

  assert(result.ok, "expected duplicate retry to resolve as success, not an error");
  if (result.ok) {
    assert(result.state === "record_synced", "expected record_synced on resolved duplicate");
  }
  const insertCalls = client.calls.filter((c) => c.op === "insert" && c.table === "land_records");
  assert(insertCalls.length === 1, "expected exactly one insert attempt to have been made this call");
  console.log("Test 2/3 (duplicate retry, identical payload, resolves as success): PASS");
}

// ---- Patch 1: retry with different content is a duplicate_conflict, not success ----

async function testDuplicateRetryOneFieldDifferentIsConflict() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  // Server row has a DIFFERENT recordName than this retry is requesting.
  client.selectByIdQueue.push({ data: baseRow({ record_name: "Different Name On Server" }), error: null });

  const cacheBefore = readCloudCache(USER_A);
  const result = await createCloudLandRecord(
    client as unknown as Parameters<typeof createCloudLandRecord>[0],
    baseInput,
  );
  const cacheAfter = readCloudCache(USER_A);

  assert(!result.ok, "expected retry with different content to fail, not succeed");
  if (!result.ok) {
    assert(result.code === "duplicate_conflict", "expected duplicate_conflict error code");
    assert(result.state === "conflict", "expected conflict state");
  }
  assert(
    JSON.stringify(cacheBefore) === JSON.stringify(cacheAfter),
    "cache must be unchanged when a duplicate_conflict is reported",
  );
  console.log("Test (retry, one field different -> duplicate_conflict, cache unchanged): PASS");
}

async function testDuplicateRetryMultipleFieldsDifferentIsConflict() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({
    data: baseRow({ record_name: "Different Name", village: "Different Village", district: "Different District" }),
    error: null,
  });

  const result = await createCloudLandRecord(
    client as unknown as Parameters<typeof createCloudLandRecord>[0],
    { ...baseInput, village: "Original Village", district: "Original District" },
  );

  assert(!result.ok, "expected retry with multiple different fields to fail");
  if (!result.ok) {
    assert(result.code === "duplicate_conflict", "expected duplicate_conflict for multiple field mismatch");
  }
  console.log("Test (retry, several fields different -> duplicate_conflict): PASS");
}

// ---- Patch 1: a difference in created_at/updated_at alone is not a payload conflict ----

async function testTimestampDifferenceAloneIsNotAConflict() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  // Same allowlisted content, but a totally different created_at/updated_at
  // (as would genuinely happen: the row was actually created earlier by the
  // original, non-timed-out request).
  client.selectByIdQueue.push({
    data: baseRow({
      created_at: "2020-01-01T00:00:00.000Z",
      updated_at: "2025-06-15T12:34:56.000Z",
    }),
    error: null,
  });

  const result = await createCloudLandRecord(
    client as unknown as Parameters<typeof createCloudLandRecord>[0],
    baseInput,
  );

  assert(result.ok, "a created_at/updated_at difference alone must not be treated as a payload conflict");
  if (result.ok) {
    assert(result.state === "record_synced", "expected record_synced despite differing timestamps");
  }
  console.log("Test (timestamp-only difference is not a payload conflict): PASS");
}

// ---- Patch 1: duplicate id that cannot be read back is not treated as success --------

async function testUnreadableDuplicateIsNotSuccess() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  // The follow-up read finds nothing -- either genuinely gone, or (more
  // realistically) RLS-filtered because it belongs to someone else.
  client.selectByIdQueue.push({ data: null, error: null });

  const result = await createCloudLandRecord(
    client as unknown as Parameters<typeof createCloudLandRecord>[0],
    baseInput,
  );

  assert(!result.ok, "an unreadable duplicate must never be treated as success");
  if (!result.ok) {
    assert(result.code === "not_found", "expected not_found (safe messaging, no ownership leak)");
    assert(
      !result.message.toLowerCase().includes("owner") && !result.message.toLowerCase().includes("another user"),
      "error message must not reveal whether the id belongs to another user",
    );
  }
  console.log("Test (unreadable duplicate is not treated as success, no ownership leak): PASS");
}

// ---- Patch 1: unknown payload keys never reach the database -----------------

async function testUnknownPayloadKeyStripped() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: baseRow(), error: null });

  const inputWithUnknownKey = {
    ...baseInput,
    thisFieldDoesNotExistInSchema: "malicious value",
  } as CreateLandRecordInput;

  await createCloudLandRecord(
    client as unknown as Parameters<typeof createCloudLandRecord>[0],
    inputWithUnknownKey,
  );

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(
    !("thisFieldDoesNotExistInSchema" in (payload ?? {})),
    "unknown payload keys must never reach the database insert payload",
  );
  console.log("Test (unknown payload key never reaches the database): PASS");
}

// ---- Patch 1: two "concurrent" requests, same payload -> one row, one verified duplicate ----

async function testConcurrentRequestsSamePayload() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  // Request A: the insert succeeds outright.
  client.insertQueue.push({ data: baseRow(), error: null });
  // Request B: arrives "at the same time", hits 23505 against the row
  // Request A just created, with identical content.
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: baseRow(), error: null });

  const [resultA, resultB] = await Promise.all([
    createCloudLandRecord(client as unknown as Parameters<typeof createCloudLandRecord>[0], baseInput),
    createCloudLandRecord(client as unknown as Parameters<typeof createCloudLandRecord>[0], baseInput),
  ]);

  assert(resultA.ok && resultB.ok, "both concurrent requests with identical content must report success");
  const insertCalls = client.calls.filter((c) => c.op === "insert");
  assert(insertCalls.length === 2, "expected two insert attempts (one real, one that hit 23505)");
  console.log("Test (two concurrent requests, same payload -> one row, both report success): PASS");
}

// ---- Patch 1: two "concurrent" requests, different payload -> one success, one conflict ----

async function testConcurrentRequestsDifferentPayload() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: baseRow({ record_name: "First Writer Wins" }), error: null });
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: baseRow({ record_name: "First Writer Wins" }), error: null });

  const [resultA, resultB] = await Promise.all([
    createCloudLandRecord(
      client as unknown as Parameters<typeof createCloudLandRecord>[0],
      { ...baseInput, recordName: "First Writer Wins" },
    ),
    createCloudLandRecord(
      client as unknown as Parameters<typeof createCloudLandRecord>[0],
      { ...baseInput, recordName: "Second Writer Loses" },
    ),
  ]);

  assert(resultA.ok, "the request whose content matches the committed row must succeed");
  assert(!resultB.ok && resultB.code === "duplicate_conflict", "the request whose content differs from the committed row must report duplicate_conflict");
  console.log("Test (two concurrent requests, different payload -> one success, one duplicate_conflict): PASS");
}

// ---- Patch 1: invalid category / line_style are rejected, not silently passed through ----

function baseGeometryRow(overrides: Partial<CloudLandRecordGeometryRow> = {}): CloudLandRecordGeometryRow {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    land_record_id: RECORD_ID,
    geometry_type: "polygon",
    category: "parent_lot",
    name: null,
    coordinates: [{ lat: 5.98, lng: 116.07 }, { lat: 5.99, lng: 116.08 }, { lat: 5.97, lng: 116.09 }],
    line_style: null,
    color: null,
    weight: null,
    is_visible: true,
    area_m2: null,
    area_ha: null,
    area_acre: null,
    perimeter_m: null,
    length_m: null,
    start_bearing: null,
    end_bearing: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function testInvalidCategoryRejected() {
  let threw = false;
  try {
    mapCloudGeometryToDrawingObject(
      baseGeometryRow({ category: "not_a_real_category" as CloudLandRecordGeometryRow["category"] }),
    );
  } catch (error) {
    threw = error instanceof MapperError;
  }
  assert(threw, "an invalid category value must throw MapperError, not pass through silently");
  console.log("Test (invalid category rejected by mapper): PASS");
}

function testInvalidLineStyleRejected() {
  let threw = false;
  try {
    mapCloudGeometryToDrawingObject(
      baseGeometryRow({
        geometry_type: "line",
        category: "standard_line",
        line_style: "not_a_real_line_style" as CloudLandRecordGeometryRow["line_style"],
      }),
    );
  } catch (error) {
    threw = error instanceof MapperError;
  }
  assert(threw, "an invalid line_style value must throw MapperError, not pass through silently");
  console.log("Test (invalid line_style rejected by mapper): PASS");
}

// ---- 4: User B cannot update User A's record -------------------------------

async function testUserBCannotUpdateUserARecord() {
  const client = new FakeSupabaseClient();
  client.userId = USER_B;
  // UPDATE matches zero rows (RLS filters it out for userB).
  client.updateQueue.push({ data: null, error: { message: "no rows", code: "PGRST116" } });
  // Follow-up read is also RLS-filtered for userB -- row is invisible.
  client.selectByIdQueue.push({ data: null, error: null });

  const result = await updateCloudLandRecord(
    client as unknown as Parameters<typeof updateCloudLandRecord>[0],
    RECORD_ID,
    { recordName: "Hijacked" },
    "2026-01-01T00:00:00.000Z",
  );

  assert(!result.ok, "expected update to fail for a non-owner");
  if (!result.ok) {
    assert(result.code === "not_found", "expected not_found (not forbidden, to avoid existence leak) for non-owner update attempt");
  }
  console.log("Test 4 (User B cannot update User A's record): PASS");
}

// ---- 5/6: anonymous / no session create is rejected ------------------------

async function testAnonymousCreateRejected() {
  const client = new FakeSupabaseClient();
  client.userId = null;

  const result = await createCloudLandRecord(
    client as unknown as Parameters<typeof createCloudLandRecord>[0],
    baseInput,
  );

  assert(!result.ok, "expected anonymous create to fail");
  if (!result.ok) {
    assert(result.code === "unauthenticated", "expected unauthenticated error code");
  }
  const insertCalls = client.calls.filter((c) => c.op === "insert");
  assert(insertCalls.length === 0, "no insert should ever be attempted without a session");
  console.log("Test 5/6 (anonymous/no-session create rejected, no insert attempted): PASS");
}

// ---- 7/9: owner id cannot be spoofed ---------------------------------------

async function testOwnerIdCannotBeSpoofed() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: baseRow(), error: null });

  // CreateLandRecordInput has no ownerId field at all -- an attacker
  // would have to bypass TypeScript entirely to attempt this, which is
  // exactly the point being verified: there is no field to spoof.
  const maliciousInput = {
    ...baseInput,
    ownerId: USER_B,
    owner_id: USER_B,
  } as CreateLandRecordInput;

  await createCloudLandRecord(
    client as unknown as Parameters<typeof createCloudLandRecord>[0],
    maliciousInput,
  );

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(payload?.owner_id === USER_A, "owner_id sent to the database must always be the session's own id, regardless of any extra fields on the input object");
  console.log("Test 7/9 (owner id cannot be spoofed): PASS");
}

// ---- 8: privileged status field is stripped, never sent --------------------

async function testPrivilegedStatusStripped() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: baseRow(), error: null });

  const maliciousInput = {
    ...baseInput,
    status: "approved",
  } as CreateLandRecordInput;

  await createCloudLandRecord(
    client as unknown as Parameters<typeof createCloudLandRecord>[0],
    maliciousInput,
  );

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(!("status" in (payload ?? {})), "status must never be present in the insert payload sent to the database");
  console.log("Test 8 (privileged status field stripped from payload): PASS");
}

// ---- 10/11/12: cache behaviour on success and failure ----------------------

async function testCacheBehaviour() {
  // 10: cloud failure leaves old cache untouched.
  const clientFail = new FakeSupabaseClient();
  clientFail.userId = USER_A;
  clientFail.insertQueue.push({
    data: null,
    error: { message: "simulated database error" },
  });

  const beforeCache = readCloudCache(USER_A);
  const failResult = await createCloudLandRecord(
    clientFail as unknown as Parameters<typeof createCloudLandRecord>[0],
    baseInput,
  );
  assert(!failResult.ok, "expected create to fail on simulated database error");
  const afterFailCache = readCloudCache(USER_A);
  assert(
    JSON.stringify(beforeCache) === JSON.stringify(afterFailCache),
    "cache must be unchanged after a failed cloud create",
  );
  console.log("Test 10 (cloud failure leaves cache unchanged): PASS");

  // 11/12: successful create updates only userA's cache, not userB's.
  const clientOk = new FakeSupabaseClient();
  clientOk.userId = USER_A;
  clientOk.insertQueue.push({ data: baseRow(), error: null });

  await createCloudLandRecord(
    clientOk as unknown as Parameters<typeof createCloudLandRecord>[0],
    baseInput,
  );

  const cacheA = readCloudCache(USER_A);
  assert(cacheA !== null, "expected userA's cache to be written after successful create");
  assert(
    cacheA!.records.some((r) => r.id === RECORD_ID),
    "expected the newly created record to be present in userA's cache",
  );

  const cacheB = readCloudCache(USER_B);
  assert(cacheB === null, "userB's cache must remain untouched by userA's create");
  console.log("Test 11/12 (successful create updates only the creating user's cache): PASS");
}

// ---- 13: update with current timestamp succeeds ----------------------------

async function testUpdateWithCurrentTimestampSucceeds() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({
    data: baseRow({ record_name: "Updated Name", updated_at: "2026-01-02T00:00:00.000Z" }),
    error: null,
  });

  const result = await updateCloudLandRecord(
    client as unknown as Parameters<typeof updateCloudLandRecord>[0],
    RECORD_ID,
    { recordName: "Updated Name" },
    "2026-01-01T00:00:00.000Z",
  );

  assert(result.ok, "expected update with correct expectedUpdatedAt to succeed");
  if (result.ok) {
    assert(result.state === "record_synced", "expected record_synced after successful update");
  }
  console.log("Test 13 (update with current timestamp succeeds): PASS");
}

// ---- 14: update with stale timestamp reports conflict ----------------------

async function testUpdateWithStaleTimestampReportsConflict() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({ data: null, error: { message: "no rows", code: "PGRST116" } });
  // Follow-up read confirms the row exists and IS owned by this user --
  // the zero-row update was therefore a stale timestamp, not not-found.
  client.selectByIdQueue.push({
    data: baseRow({ updated_at: "2026-01-05T00:00:00.000Z" }),
    error: null,
  });

  const result = await updateCloudLandRecord(
    client as unknown as Parameters<typeof updateCloudLandRecord>[0],
    RECORD_ID,
    { recordName: "Stale Update" },
    "2026-01-01T00:00:00.000Z",
  );

  assert(!result.ok, "expected stale update to fail");
  if (!result.ok) {
    assert(result.state === "conflict", "expected conflict state for stale updated_at");
    assert(result.code === "stale_conflict", "expected stale_conflict error code");
    assert(result.serverRecord?.id === RECORD_ID, "expected the current server record to be attached for a future conflict UI");
  }
  console.log("Test 14 (update with stale timestamp reports conflict, not overwrite): PASS");
}

// ---- 15: non-UUID legacy id is never uploaded ------------------------------

async function testLegacyIdNotUploaded() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const legacyInput: CreateLandRecordInput = {
    id: "local-1699999999-abc123",
    recordName: "Legacy record",
  };

  const result = await createCloudLandRecord(
    client as unknown as Parameters<typeof createCloudLandRecord>[0],
    legacyInput,
  );

  assert(!result.ok, "expected legacy non-UUID id to be rejected");
  if (!result.ok) {
    assert(
      result.code === "legacy_id_requires_migration_mapping",
      "expected legacy_id_requires_migration_mapping error code",
    );
  }
  assert(!isStableCloudId(legacyInput.id), "sanity: legacy id must not be considered a stable UUID");
  const insertCalls = client.calls.filter((c) => c.op === "insert");
  assert(insertCalls.length === 0, "no insert should ever be attempted for a non-UUID legacy id");
  console.log("Test 15 (non-UUID legacy id never uploaded): PASS");
}

// ---- 16: no child-table write ever occurs ----------------------------------

async function testNoChildTableWrites() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: baseRow(), error: null });

  await createCloudLandRecord(
    client as unknown as Parameters<typeof createCloudLandRecord>[0],
    baseInput,
  );

  const childTableCalls = client.calls.filter((c) =>
    ["land_record_geometries", "land_points", "land_parties", "documents"].includes(c.table),
  );
  assert(childTableCalls.length === 0, "no child table should ever be touched by Sprint 02C write flow");
  console.log("Test 16 (no child-table write occurs): PASS");
}

// ---- 17 note: state naming is exercised throughout (see Tests 1, 2/3, 13) --
// ---- 18 note: partial-child-data false-synced risk does not apply -- no
// child write path exists at all in this sprint (Test 16 proves this).

async function main() {
  await testAuthenticatedCreate();
  await testDuplicateRetryResolvesAsSuccess();
  await testDuplicateRetryOneFieldDifferentIsConflict();
  await testDuplicateRetryMultipleFieldsDifferentIsConflict();
  await testTimestampDifferenceAloneIsNotAConflict();
  await testUnreadableDuplicateIsNotSuccess();
  await testUnknownPayloadKeyStripped();
  await testConcurrentRequestsSamePayload();
  await testConcurrentRequestsDifferentPayload();
  testInvalidCategoryRejected();
  testInvalidLineStyleRejected();
  await testUserBCannotUpdateUserARecord();
  await testAnonymousCreateRejected();
  await testOwnerIdCannotBeSpoofed();
  await testPrivilegedStatusStripped();
  await testCacheBehaviour();
  await testUpdateWithCurrentTimestampSucceeds();
  await testUpdateWithStaleTimestampReportsConflict();
  await testLegacyIdNotUploaded();
  await testNoChildTableWrites();
  console.log("Sprint 02C land-records write QA: ALL PASS");
}

// Minimal in-memory localStorage double, same pattern as the other .qa.ts files.
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
