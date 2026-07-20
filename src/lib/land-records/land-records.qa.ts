// Sprint 02B QA script. Run via:
//   npx tsc -p src/lib/land-records/land-records.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/land-records.qa.js
// (same convention as src/lib/local-lots.qa.ts)
//
// Uses a fake Supabase client (no network) so this can run standalone
// like the rest of the .qa.ts scripts in this repo -- no test
// framework dependency added.

// The read gate fails closed unless the QA process explicitly targets the
// approved sabahlot-dev project. This value is public project metadata, not a
// credential, and the fake client below ensures no network request is made.
Object.assign(process.env, {
  NODE_ENV: "development",
  NEXT_PUBLIC_SUPABASE_URL: "https://xsflrehitrmobiyfbfhk.supabase.co",
});

import {
  getCloudCacheKey,
  isStableCloudId,
  loadCloudLandRecords,
  mapCloudRecordToDomain,
  readCloudCache,
  type CloudLandPartyRow,
  type CloudLandRecordRow,
} from "./index";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

// ---- Fake Supabase client -------------------------------------------------

type TableName =
  | "land_records"
  | "land_record_geometries"
  | "land_points"
  | "land_parties";

interface FakeResponse {
  data: unknown[] | null;
  error: { message: string } | null;
}

class FakeQueryBuilder {
  constructor(
    private readonly table: TableName,
    private readonly client: FakeSupabaseClient,
  ) {}

  select() {
    return this;
  }

  order() {
    return this.resolve();
  }

  eq() {
    return this.resolve();
  }

  insert(): never {
    throw new Error("insert() must never be called in Sprint 02B read flow");
  }

  update(): never {
    throw new Error("update() must never be called in Sprint 02B read flow");
  }

  delete(): never {
    throw new Error("delete() must never be called in Sprint 02B read flow");
  }

  private resolve(): Promise<FakeResponse> {
    this.client.calls.push(this.table);
    return Promise.resolve(this.client.responses[this.table]);
  }
}

class FakeSupabaseClient {
  calls: TableName[] = [];
  responses: Record<TableName, FakeResponse> = {
    land_records: { data: [], error: null },
    land_record_geometries: { data: [], error: null },
    land_points: { data: [], error: null },
    land_parties: { data: [], error: null },
  };
  userId: string | null = null;

  auth = {
    getUser: async () => ({
      data: { user: this.userId ? { id: this.userId } : null },
      error: null,
    }),
  };

  from(table: TableName) {
    return new FakeQueryBuilder(table, this);
  }
}

// ---- 1 & 11: authenticated list + no write calls --------------------------

async function testAuthenticatedListNoWrites() {
  const client = new FakeSupabaseClient();
  client.userId = "11111111-1111-4111-8111-111111111111";

  const recordRow: CloudLandRecordRow = {
    id: "22222222-2222-4222-8222-222222222222",
    owner_id: client.userId,
    record_name: "QA Record",
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
  };

  client.responses.land_records = { data: [recordRow], error: null };

  const result = await loadCloudLandRecords(
    client as unknown as Parameters<typeof loadCloudLandRecords>[0],
  );

  assert(result.state === "synced", "expected synced state for authenticated list");
  assert(result.records.length === 1, "expected exactly one mapped record");
  // FakeQueryBuilder.insert/update/delete throw if ever called -- reaching
  // this line without a thrown error is itself the proof that Sprint 02B's
  // read flow never calls them.
  console.log("Test 1/11 (authenticated list, no writes): PASS");
}

// ---- 2: no session -> no cloud query ---------------------------------------

async function testNoSessionNoQuery() {
  const client = new FakeSupabaseClient();
  client.userId = null;

  const result = await loadCloudLandRecords(
    client as unknown as Parameters<typeof loadCloudLandRecords>[0],
  );

  assert(result.state === "offline", "expected offline state with no session");
  assert(client.calls.length === 0, "no table must be queried without a session");
  console.log("Test 2 (no session, no cloud query): PASS");
}

// ---- 3: cache key differs per user ----------------------------------------

function testCacheKeyIsolation() {
  const keyA = getCloudCacheKey("11111111-1111-4111-8111-111111111111");
  const keyB = getCloudCacheKey("99999999-9999-4999-8999-999999999999");
  assert(keyA !== keyB, "cache keys for two different users must differ");
  console.log("Test 3 (cache key isolation): PASS");
}

// ---- 4 & 5 & 6: cache updated on success, cache-only on failure, no cross-user read ----

async function testCacheUpdateAndFailureIsolation() {
  const userA = "11111111-1111-4111-8111-111111111111";
  const userB = "99999999-9999-4999-8999-999999999999";

  const client = new FakeSupabaseClient();
  client.userId = userA;

  const recordRow: CloudLandRecordRow = {
    id: "33333333-3333-4333-8333-333333333333",
    owner_id: userA,
    record_name: "QA Record A",
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
  };
  client.responses.land_records = { data: [recordRow], error: null };

  const okResult = await loadCloudLandRecords(
    client as unknown as Parameters<typeof loadCloudLandRecords>[0],
  );
  assert(okResult.state === "synced", "expected synced on first successful read");

  const cachedA = readCloudCache(userA);
  assert(cachedA !== null, "cache must be written for userA after success");
  assert(cachedA!.records.length === 1, "cache must contain the synced record");
  console.log("Test 4 (cache updated on cloud success): PASS");

  // Now simulate a failure for userA and confirm it falls back to
  // userA's own cache, not userB's (which has never been written).
  client.responses.land_records = {
    data: null,
    error: { message: "simulated network failure" },
  };

  const failResult = await loadCloudLandRecords(
    client as unknown as Parameters<typeof loadCloudLandRecords>[0],
  );
  assert(failResult.state === "offline", "expected offline state on cloud failure with cache present");
  assert(failResult.records.length === 1, "expected cached record to be returned on failure");
  console.log("Test 5 (cloud failure falls back to same-user cache): PASS");

  // userB has no cache at all -- failure for userB must not surface
  // userA's cached records.
  const clientB = new FakeSupabaseClient();
  clientB.userId = userB;
  clientB.responses.land_records = {
    data: null,
    error: { message: "simulated network failure" },
  };

  const bResult = await loadCloudLandRecords(
    clientB as unknown as Parameters<typeof loadCloudLandRecords>[0],
  );
  assert(bResult.state === "failed", "expected failed state for userB with no cache");
  assert(bResult.records.length === 0, "userB must never see userA's cached records");
  console.log("Test 6 (no cross-user cache leak on failure): PASS");
}

// ---- 7: mapper handles null/empty child rows -------------------------------

function testMapperHandlesEmptyChildren() {
  const row: CloudLandRecordRow = {
    id: "44444444-4444-4444-8444-444444444444",
    owner_id: "11111111-1111-4111-8111-111111111111",
    record_name: "Empty children record",
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
  };

  const mapped = mapCloudRecordToDomain(row, {
    geometries: [],
    points: [],
    parties: [],
  });

  assert(mapped.geometries.length === 0, "expected empty geometries array, not a throw");
  assert(mapped.points.length === 0, "expected empty points array");
  assert(mapped.ownerName === null, "expected null ownerName with no parties");
  console.log("Test 7 (mapper handles null/empty child rows): PASS");
}

// ---- 8: owner_name derived from primary party ------------------------------

function testOwnerNameDerivation() {
  const row: CloudLandRecordRow = {
    id: "55555555-5555-4555-8555-555555555555",
    owner_id: "11111111-1111-4111-8111-111111111111",
    record_name: "Owner derivation record",
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
  };

  const parties: CloudLandPartyRow[] = [
    {
      id: "66666666-6666-4666-8666-666666666666",
      land_record_id: row.id,
      party_role: "original_applicant",
      full_name: "Fallback Applicant",
      id_number: null,
      relationship_to_applicant: null,
      contact_phone: null,
      contact_email: null,
      notes: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "77777777-7777-4777-8777-777777777777",
      land_record_id: row.id,
      party_role: "owner",
      full_name: "RLS_TEST Primary Owner",
      id_number: null,
      relationship_to_applicant: null,
      contact_phone: null,
      contact_email: null,
      notes: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ];

  const mapped = mapCloudRecordToDomain(row, {
    geometries: [],
    points: [],
    parties,
  });

  assert(
    mapped.ownerName === "RLS_TEST Primary Owner",
    "expected ownerName to prefer the 'owner' role party over 'original_applicant'",
  );
  console.log("Test 8 (owner_name derived from primary party): PASS");
}

// ---- 9: originalApplicantStatus preserved from legacy cache ----------------

function testOriginalApplicantStatusPreserved() {
  const row: CloudLandRecordRow = {
    id: "88888888-8888-4888-8888-888888888888",
    owner_id: "11111111-1111-4111-8111-111111111111",
    record_name: "Legacy status record",
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
  };

  const mapped = mapCloudRecordToDomain(
    row,
    { geometries: [], points: [], parties: [] },
    "deceased",
  );

  assert(
    mapped.originalApplicantStatus === "deceased",
    "expected originalApplicantStatus to be carried over from the passed-in legacy value, not read from the cloud row",
  );
  console.log("Test 9 (originalApplicantStatus preserved from cache): PASS");
}

// ---- 10: stable id invariant ------------------------------------------------

function testStableIdInvariant() {
  assert(
    isStableCloudId("11111111-1111-4111-8111-111111111111"),
    "a real UUID must be recognised as a stable cloud id",
  );
  assert(
    !isStableCloudId("local-1234567890-abc123"),
    "a legacy non-UUID local id must NOT be treated as a stable cloud id (LEGACY ID REQUIRES MIGRATION MAPPING)",
  );
  console.log("Test 10 (stable cloud id invariant): PASS");
}

// ---- 12 note ----------------------------------------------------------------
// "Existing local workflow masih berfungsi" is covered by re-running the
// existing, untouched src/lib/local-lots.qa.ts as part of Sprint 02B
// verification (see final report section 9) rather than duplicated here.

async function main() {
  await testAuthenticatedListNoWrites();
  await testNoSessionNoQuery();
  testCacheKeyIsolation();
  await testCacheUpdateAndFailureIsolation();
  testMapperHandlesEmptyChildren();
  testOwnerNameDerivation();
  testOriginalApplicantStatusPreserved();
  testStableIdInvariant();
  console.log("Sprint 02B land-records QA: ALL PASS");
}

// Minimal in-memory localStorage double, same pattern as local-lots.qa.ts.
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
