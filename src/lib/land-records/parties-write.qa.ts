// Sprint parties cloud write QA script for land_parties cloud
// create/update. Run via:
//   npx tsc -p src/lib/land-records/parties-write.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/src/lib/land-records/parties-write.qa.js
// (same convention as geometry-write.qa.ts / points-write.qa.ts)
//
// Uses a fake Supabase client (no network, no dependency added). Does
// not touch local-lots.ts, land-records.qa.ts, land-records-write.qa.ts,
// geometry-write.qa.ts, or points-write.qa.ts -- those are re-run
// unchanged as a separate regression step (see the sprint report), not
// modified by this sprint.
//
// Imports directly from the sibling parties-*.ts / existing shared
// files rather than through "./index" -- index.ts is a shared,
// Foundation/Integration-owned file outside this sprint's Allowed
// Files, and is deliberately NOT modified to barrel-export the new
// parties module (see the sprint report's Findings section).

import { createCloudParty, updateCloudParty } from "./parties-write-coordinator";
import {
  validateCreatePartyInput,
  type CreatePartyInput,
  type UpdatePartyInput,
} from "./parties-validation";
import { mapCloudParty } from "./mapper";
import { isStableCloudId } from "./types";
import { readCloudCache, writeCloudCache } from "./local-cache";
import type { CloudLandPartyRow, CloudLandRecord } from "./types";

// Sprint 02C-2 regression-fix pattern, reused here: isCloudWriteEnabled()
// requires NEXT_PUBLIC_SUPABASE_URL to resolve to the sabahlot-dev
// project. A bare `node` run has no such env var set, so every test
// below that expects a cloud call to actually happen must run with this
// set -- exactly like parent-ui-sync.qa.ts / geometry-write.qa.ts /
// points-write.qa.ts. Never written to any .env file and never read by
// production code.
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

type TableName =
  | "land_parties"
  | "land_record_geometries"
  | "land_points"
  | "land_records"
  | "documents";

interface FakeResponse {
  data: unknown;
  error: { message: string; code?: string } | null;
}

class FakeChain implements PromiseLike<FakeResponse> {
  public eqCalls: Array<{ column: string; value: unknown }> = [];

  constructor(
    private readonly client: FakeSupabaseClient,
    private readonly table: TableName,
    private readonly mode: "select" | "insert" | "update",
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.eqCalls.push({ column, value });
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
      this.client.lastUpdateEqCalls = this.eqCalls;
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
  updateQueue: FakeResponse[] = [];
  selectByIdQueue: FakeResponse[] = [];
  listQueue: FakeResponse[] = [];
  lastUpdateEqCalls: Array<{ column: string; value: unknown }> = [];
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
      update: (payload: unknown) => {
        this.calls.push({ op: "update", table, payload });
        return new FakeChain(this, table, "update");
      },
      select: () => {
        this.calls.push({ op: "select", table });
        return new FakeChain(this, table, "select");
      },
      delete: (): never => {
        throw new Error(`delete() must never be called on ${table} (delete is deferred, ADR-013)`);
      },
    };
  }
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "99999999-9999-4999-8999-999999999999";
const LAND_RECORD_ID = "22222222-2222-4222-8222-222222222222";
const PARTY_ID = "33333333-3333-4333-8333-333333333333";

function basePartyRow(overrides: Partial<CloudLandPartyRow> = {}): CloudLandPartyRow {
  return {
    id: PARTY_ID,
    land_record_id: LAND_RECORD_ID,
    party_role: "owner",
    full_name: "Ahmad bin Ali",
    id_number: null,
    relationship_to_applicant: null,
    contact_phone: null,
    contact_email: null,
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function basePartyInput(overrides: Partial<CreatePartyInput> = {}): CreatePartyInput {
  return {
    id: PARTY_ID,
    landRecordId: LAND_RECORD_ID,
    partyRole: "owner",
    fullName: "Ahmad bin Ali",
    ...overrides,
  };
}

// ==== Authentication and ownership ==========================================

async function test1_UserACreateParty() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: basePartyRow(), error: null });

  const result = await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    basePartyInput(),
  );

  assert(result.ok, "expected User A create to succeed");
  if (result.ok) {
    assert(result.state === "parties_synced", "expected parties_synced state");
  }
  console.log("Test 1 (User A create party): PASS [executed]");
}

async function test2_UserBRejectedOnParentUserA() {
  // RLS would filter the insert for a parent User B does not own --
  // simulated here as an insert-time RLS rejection (42501-shaped),
  // which is what a real RLS denial on INSERT ... WITH CHECK looks
  // like via PostgREST.
  const client = new FakeSupabaseClient();
  client.userId = USER_B;
  client.insertQueue.push({
    data: null,
    error: { message: "new row violates row-level security policy", code: "42501" },
  });

  const result = await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    basePartyInput(),
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

async function test3_UserBRejectedUpdatingPartyUserA() {
  const client = new FakeSupabaseClient();
  client.userId = USER_B;
  // UPDATE matches zero rows (RLS filters it out for userB).
  client.updateQueue.push({ data: null, error: { message: "no rows", code: "PGRST116" } });
  // Follow-up read is also RLS-filtered for userB -- row invisible.
  client.selectByIdQueue.push({ data: null, error: null });

  const result = await updateCloudParty(
    client as unknown as Parameters<typeof updateCloudParty>[0],
    PARTY_ID,
    { fullName: "Someone Else" },
    "2026-01-01T00:00:00.000Z",
  );

  assert(!result.ok, "expected User B update of User A's party to fail");
  if (!result.ok) {
    assert(
      result.code === "not_found_or_forbidden",
      "expected not_found_or_forbidden (RLS-invisible row, never a distinct forbidden)",
    );
  }
  console.log("Test 3 (User B rejected updating User A's party): PASS [executed]");
}

async function test4_AnonymousCreateRejected() {
  const client = new FakeSupabaseClient();
  client.userId = null;

  const result = await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    basePartyInput(),
  );

  assert(!result.ok, "expected anonymous create to fail");
  if (!result.ok) {
    assert(result.code === "unauthenticated", "expected unauthenticated");
  }
  assert(client.calls.length === 0, "no Supabase call should be made for an anonymous session");
  console.log("Test 4 (anonymous create rejected): PASS [executed]");
}

async function test5_AnonymousUpdateRejected() {
  const client = new FakeSupabaseClient();
  client.userId = null;

  const result = await updateCloudParty(
    client as unknown as Parameters<typeof updateCloudParty>[0],
    PARTY_ID,
    { fullName: "Someone" },
    "2026-01-01T00:00:00.000Z",
  );

  assert(!result.ok, "expected anonymous update to fail");
  if (!result.ok) {
    assert(result.code === "unauthenticated", "expected unauthenticated");
  }
  assert(client.calls.length === 0, "no Supabase call should be made for an anonymous session");
  console.log("Test 5 (anonymous update rejected): PASS [executed]");
}

async function test6_ParentIdOtherUserNotWritable() {
  // Even if a caller supplies a landRecordId belonging to another user,
  // this function never substitutes or "fixes" it -- it is passed
  // through verbatim to the INSERT, and RLS (not this code) is what
  // rejects it. Simulated as a 42501 exactly like Test 2.
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "new row violates row-level security policy", code: "42501" },
  });

  const result = await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    basePartyInput({ landRecordId: "44444444-4444-4444-8444-444444444444" }),
  );

  assert(!result.ok, "expected create against an unowned parent to fail");
  const insertCall = client.calls.find((call) => call.op === "insert");
  assert(!!insertCall, "expected an insert attempt to have been made");
  const payload = insertCall!.payload as Record<string, unknown>;
  assert(
    payload.land_record_id === "44444444-4444-4444-8444-444444444444",
    "landRecordId must be forwarded verbatim to Supabase, never silently substituted -- RLS is the authorization boundary, not this code",
  );
  console.log("Test 6 (parent id of another user forwarded verbatim, rejected by RLS not by silent substitution): PASS [executed]");
}

// ==== Validation =============================================================

async function test7_ValidFullPartyAccepted() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: basePartyRow({
      relationship_to_applicant: "Anak sulung",
      contact_phone: "+60123456789",
      contact_email: "ahmad@example.com",
      notes: "Contacted via phone",
    }),
    error: null,
  });

  const result = await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    basePartyInput({
      relationshipToApplicant: "Anak sulung",
      contactPhone: "+60123456789",
      contactEmail: "ahmad@example.com",
      notes: "Contacted via phone",
    }),
  );

  assert(result.ok, "expected full valid party to be accepted");
  console.log("Test 7 (valid full party with all optional fields accepted): PASS [executed]");
}

async function test8_EmptyFullNameRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    basePartyInput({ fullName: "   " }),
  );

  assert(!result.ok, "expected empty fullName to be rejected");
  if (!result.ok) {
    assert(result.code === "validation_failed", "expected validation_failed");
  }
  assert(client.calls.length === 0, "no Supabase call should be made for a validation failure");
  console.log("Test 8 (empty/whitespace-only fullName rejected): PASS [executed]");
}

async function test9_InvalidPartyRoleRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    basePartyInput({ partyRole: "grandparent" as CreatePartyInput["partyRole"] }),
  );

  assert(!result.ok, "expected invalid partyRole to be rejected");
  if (!result.ok) {
    assert(result.code === "validation_failed", "expected validation_failed");
  }
  console.log("Test 9 (invalid partyRole rejected): PASS [executed]");
}

async function test10_UnknownPayloadKeyStripped() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: basePartyRow(), error: null });

  const inputWithExtraKey = {
    ...basePartyInput(),
    someRandomField: "should never reach the database",
  } as unknown as CreatePartyInput;

  const result = await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    inputWithExtraKey,
  );

  assert(result.ok, "expected create to succeed despite an extra unknown key");
  const insertCall = client.calls.find((call) => call.op === "insert");
  const payload = insertCall!.payload as Record<string, unknown>;
  assert(
    !("someRandomField" in payload) && !("someRandomField" in (payload as Record<string, unknown>)),
    "unknown payload key must never reach the database",
  );
  console.log("Test 10 (unknown payload key never reaches the database): PASS [executed]");
}

// ==== ADR-014: id_number is NEVER cloud-writable (mandatory regression) =====

async function test11_IdNumberNeverInCreatePayload() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: basePartyRow(), error: null });

  // Simulate a malicious or buggy caller trying to smuggle id_number in
  // by constructing a raw object and casting past the type system --
  // CreatePartyInput has no id_number field, so this can only happen
  // via an unsafe cast, exactly like a real bug would look.
  const maliciousInput = {
    ...basePartyInput(),
    idNumber: "990101-12-1234",
    id_number: "990101-12-1234",
  } as unknown as CreatePartyInput;

  const result = await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    maliciousInput,
  );

  assert(result.ok, "expected create to still succeed (extra keys are stripped, not rejected)");
  const insertCall = client.calls.find((call) => call.op === "insert");
  assert(!!insertCall, "expected an insert attempt to have been made");
  const payload = insertCall!.payload as Record<string, unknown>;
  assert(
    !("id_number" in payload),
    "id_number must NEVER appear in the create payload sent to Supabase (ADR-014)",
  );
  assert(
    !("idNumber" in payload),
    "idNumber (camelCase) must NEVER appear in the create payload sent to Supabase either",
  );
  console.log("Test 11 (id_number never appears in CREATE payload sent to Supabase, ADR-014): PASS [executed]");
}

async function test12_IdNumberNeverInUpdatePayload() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({ data: basePartyRow({ full_name: "Updated Name" }), error: null });

  const maliciousPatch = {
    fullName: "Updated Name",
    idNumber: "990101-12-1234",
    id_number: "990101-12-1234",
  } as unknown as UpdatePartyInput;

  const result = await updateCloudParty(
    client as unknown as Parameters<typeof updateCloudParty>[0],
    PARTY_ID,
    maliciousPatch,
    "2026-01-01T00:00:00.000Z",
  );

  assert(result.ok, "expected update to still succeed (extra keys are stripped, not rejected)");
  const updateCall = client.calls.find((call) => call.op === "update");
  assert(!!updateCall, "expected an update attempt to have been made");
  const payload = updateCall!.payload as Record<string, unknown>;
  assert(
    !("id_number" in payload),
    "id_number must NEVER appear in the update payload sent to Supabase (ADR-014)",
  );
  assert(
    !("idNumber" in payload),
    "idNumber (camelCase) must NEVER appear in the update payload sent to Supabase either",
  );
  console.log("Test 12 (id_number never appears in UPDATE payload sent to Supabase, ADR-014): PASS [executed]");
}

async function test13_IdNumberNotInAllowlistedPayloadBuilder() {
  // Static/structural check, independent of the fake client: even a
  // fully-formed, validated CreatePartyInput -> mapPartyFieldsToDbPayload
  // pipeline cannot emit id_number, because PartyWritableFields has no
  // such field for the extraction logic to read.
  const validated = validateCreatePartyInput(basePartyInput());
  assert(validated.ok, "expected base input to validate");
  if (validated.ok) {
    assert(
      !("idNumber" in validated.payload) &&
        !("id_number" in (validated.payload as unknown as Record<string, unknown>)),
      "validated CreatePartyInput payload must never carry an id_number/idNumber key",
    );
  }
  console.log("Test 13 (validated payload never carries id_number, structural check): PASS [executed]");
}

// ==== Idempotency / duplicate-create resolution =============================

async function test14_FirstCreateSucceeds() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: basePartyRow(), error: null });

  const result = await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    basePartyInput(),
  );

  assert(result.ok, "expected first create to succeed");
  if (result.ok) {
    assert(result.data.id === PARTY_ID, "expected the client-supplied id to be reused, never regenerated");
  }
  console.log("Test 14 (first create succeeds, id reused not regenerated): PASS [executed]");
}

async function test15_SameUuidSamePayloadRetrySucceeds() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: basePartyRow(), error: null });

  const result = await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    basePartyInput(),
  );

  assert(result.ok, "expected same-UUID same-payload retry to succeed");
  if (result.ok) {
    assert(result.state === "parties_synced", "expected parties_synced on verified idempotent retry");
  }
  console.log("Test 15 (same UUID + same payload retry succeeds): PASS [executed]");
}

async function test16_ChangedContentIsDuplicateConflict() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: basePartyRow({ full_name: "Different Name" }), error: null });

  const result = await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    basePartyInput({ fullName: "Ahmad bin Ali" }),
  );

  assert(!result.ok, "expected same-UUID different-content retry to fail");
  if (!result.ok) {
    assert(result.code === "duplicate_conflict", "expected duplicate_conflict");
  }
  console.log("Test 16 (same UUID + changed content -> duplicate_conflict): PASS [executed]");
}

async function test17_DuplicateConflictCacheUnchanged() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: basePartyRow({ full_name: "Different Name" }), error: null });

  const cachedRecord: CloudLandRecord = {
    id: LAND_RECORD_ID,
    recordName: "Test",
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
  };
  (globalThis as unknown as { window?: unknown }).window = {
    localStorage: (() => {
      const store = new Map<string, string>();
      return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      };
    })(),
  };
  writeCloudCache(USER_A, [cachedRecord], "2026-01-01T00:00:00.000Z");

  await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    basePartyInput({ fullName: "Ahmad bin Ali" }),
  );

  const cacheAfter = readCloudCache(USER_A);
  assert(cacheAfter?.records[0].parties.length === 0, "duplicate conflict must not modify the cache");
  console.log("Test 17 (duplicate conflict does not change cache): PASS [executed]");
}

async function test18_InaccessibleDuplicateNotSuccess() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: null, error: null });

  const result = await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    basePartyInput(),
  );

  assert(!result.ok, "expected an inaccessible duplicate to never be treated as success");
  if (!result.ok) {
    assert(result.code === "not_found_or_forbidden", "expected not_found_or_forbidden");
  }
  console.log("Test 18 (inaccessible duplicate is not success): PASS [executed]");
}

async function test19_LegacyIdReturnsMappingCode() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    basePartyInput({ id: "local-1234-not-a-uuid" }),
  );

  assert(!result.ok, "expected legacy non-UUID party id to be rejected");
  if (!result.ok) {
    assert(
      result.code === "legacy_child_id_requires_mapping",
      "expected legacy_child_id_requires_mapping",
    );
  }
  assert(client.calls.length === 0, "no Supabase call should be made for a legacy id");
  console.log("Test 19 (legacy non-UUID party id rejected, no upload): PASS [executed]");
}

// ==== Update / optimistic concurrency =======================================

async function test20_CurrentTimestampUpdateSucceeds() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({ data: basePartyRow({ full_name: "Updated Name" }), error: null });

  const result = await updateCloudParty(
    client as unknown as Parameters<typeof updateCloudParty>[0],
    PARTY_ID,
    { fullName: "Updated Name" },
    "2026-01-01T00:00:00.000Z",
  );

  assert(result.ok, "expected update with current updated_at to succeed");
  if (result.ok) {
    assert(result.data.fullName === "Updated Name", "expected updated name reflected in result");
  }
  console.log("Test 20 (current updated_at update succeeds): PASS [executed]");
}

async function test21_StaleTimestampConflict() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({ data: null, error: { message: "no rows", code: "PGRST116" } });
  client.selectByIdQueue.push({ data: basePartyRow({ updated_at: "2026-02-01T00:00:00.000Z" }), error: null });

  const result = await updateCloudParty(
    client as unknown as Parameters<typeof updateCloudParty>[0],
    PARTY_ID,
    { fullName: "Updated Name" },
    "2026-01-01T00:00:00.000Z",
  );

  assert(!result.ok, "expected stale updated_at to produce a conflict, not an overwrite");
  if (!result.ok) {
    assert(result.code === "stale_conflict", "expected stale_conflict");
    assert(!!result.serverData, "expected serverData to carry the current server-side party");
  }
  console.log("Test 21 (stale updated_at produces conflict, not overwrite): PASS [executed]");
}

async function test22_AtomicTimestampFilterConfirmed() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({ data: basePartyRow(), error: null });

  await updateCloudParty(
    client as unknown as Parameters<typeof updateCloudParty>[0],
    PARTY_ID,
    { fullName: "Updated Name" },
    "2026-01-01T00:00:00.000Z",
  );

  const idFilter = client.lastUpdateEqCalls.find((call) => call.column === "id");
  const timestampFilter = client.lastUpdateEqCalls.find((call) => call.column === "updated_at");
  assert(idFilter?.value === PARTY_ID, "expected the UPDATE to filter on id");
  assert(
    timestampFilter?.value === "2026-01-01T00:00:00.000Z",
    "expected the UPDATE to filter on updated_at atomically, in the same call",
  );
  console.log("Test 22 (atomic id+updated_at filter confirmed on the actual UPDATE call): PASS [executed]");
}

async function test23_ParentIdCannotBeChangedViaUpdate() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({ data: basePartyRow(), error: null });

  const patchWithParentId = {
    fullName: "Updated Name",
    landRecordId: "55555555-5555-4555-8555-555555555555",
  } as unknown as UpdatePartyInput;

  await updateCloudParty(
    client as unknown as Parameters<typeof updateCloudParty>[0],
    PARTY_ID,
    patchWithParentId,
    "2026-01-01T00:00:00.000Z",
  );

  const updateCall = client.calls.find((call) => call.op === "update");
  const payload = updateCall!.payload as Record<string, unknown>;
  assert(
    !("land_record_id" in payload) && !("landRecordId" in payload),
    "land_record_id must never appear in an update payload -- a party's parent cannot change",
  );
  console.log("Test 23 (parent id cannot be changed via update): PASS [executed]");
}

async function test24_EmptyPatchHandled() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await updateCloudParty(
    client as unknown as Parameters<typeof updateCloudParty>[0],
    PARTY_ID,
    {},
    "2026-01-01T00:00:00.000Z",
  );

  assert(!result.ok, "expected an empty patch to be rejected");
  if (!result.ok) {
    assert(result.code === "validation_failed", "expected validation_failed");
  }
  assert(client.calls.length === 0, "no Supabase call should be made for an empty patch");
  console.log("Test 24 (empty patch handled without a database call): PASS [executed]");
}

// ==== Cache isolation ========================================================

function setUpFakeLocalStorage() {
  (globalThis as unknown as { window?: unknown }).window = {
    localStorage: (() => {
      const store = new Map<string, string>();
      return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      };
    })(),
  };
}

function emptyCachedRecord(): CloudLandRecord {
  return {
    id: LAND_RECORD_ID,
    recordName: "Test",
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
  };
}

async function test25_SuccessfulCreateChangesOnlyUserACache() {
  setUpFakeLocalStorage();
  writeCloudCache(USER_A, [emptyCachedRecord()], "2026-01-01T00:00:00.000Z");
  writeCloudCache(USER_B, [emptyCachedRecord()], "2026-01-01T00:00:00.000Z");

  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: basePartyRow(), error: null });

  await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    basePartyInput(),
  );

  const cacheA = readCloudCache(USER_A);
  const cacheB = readCloudCache(USER_B);
  assert(cacheA?.records[0].parties.length === 1, "expected User A's cache to gain the new party");
  assert(cacheB?.records[0].parties.length === 0, "expected User B's cache to be untouched");
  console.log("Test 25 (successful create changes only User A's cache): PASS [executed]");
}

async function test26_SuccessfulUpdateChangesOnlyUserACache() {
  setUpFakeLocalStorage();
  const recordWithParty: CloudLandRecord = {
    ...emptyCachedRecord(),
    parties: [
      {
        id: PARTY_ID,
        partyRole: "owner",
        fullName: "Old Name",
        idNumber: null,
        relationshipToApplicant: null,
        contactPhone: null,
        contactEmail: null,
      },
    ],
  };
  writeCloudCache(USER_A, [recordWithParty], "2026-01-01T00:00:00.000Z");
  writeCloudCache(USER_B, [recordWithParty], "2026-01-01T00:00:00.000Z");

  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({ data: basePartyRow({ full_name: "New Name" }), error: null });

  await updateCloudParty(
    client as unknown as Parameters<typeof updateCloudParty>[0],
    PARTY_ID,
    { fullName: "New Name" },
    "2026-01-01T00:00:00.000Z",
  );

  const cacheA = readCloudCache(USER_A);
  const cacheB = readCloudCache(USER_B);
  assert(cacheA?.records[0].parties[0].fullName === "New Name", "expected User A's cache to reflect the update");
  assert(cacheB?.records[0].parties[0].fullName === "Old Name", "expected User B's cache to be untouched");
  console.log("Test 26 (successful update changes only User A's cache): PASS [executed]");
}

async function test27_CloudFailureKeepsOldCache() {
  setUpFakeLocalStorage();
  writeCloudCache(USER_A, [emptyCachedRecord()], "2026-01-01T00:00:00.000Z");

  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: null, error: { message: "network error" } });

  await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    basePartyInput(),
  );

  const cache = readCloudCache(USER_A);
  assert(cache?.records[0].parties.length === 0, "expected cache to be unchanged after a failed cloud write");
  console.log("Test 27 (cloud failure keeps old cache): PASS [executed]");
}

// ==== Sync-state honesty (ADR-009/ADR-010) ==================================

async function test28_PartySuccessProducesPartiesSynced() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: basePartyRow(), error: null });

  const result = await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    basePartyInput(),
  );

  assert(result.ok, "expected create to succeed");
  if (result.ok) {
    assert(
      result.state === "parties_synced",
      "party success must produce parties_synced, never core_record_synced/record_synced/full_record_synced",
    );
    assert(
      (result.state as string) !== "full_record_synced",
      "full_record_synced must never be used (ADR-010 -- documents are not yet implemented)",
    );
  }
  console.log("Test 28 (party success produces parties_synced, never a broader state): PASS [executed]");
}

// ==== Table-write scope ======================================================

async function test29_NoOtherTableWriteOccurs() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: basePartyRow(), error: null });

  await createCloudParty(
    client as unknown as Parameters<typeof createCloudParty>[0],
    basePartyInput(),
  );

  const touchedTables = new Set(client.calls.map((call) => call.table));
  assert(touchedTables.size === 1 && touchedTables.has("land_parties"), "only land_parties may be touched by this sprint's write coordinator");
  console.log("Test 29 (no land_records/geometry/point/document write occurs): PASS [executed]");
}

// ==== mapCloudParty round-trip sanity (existing read-direction mapper) =====

async function test30_MapCloudPartyRoundTrip() {
  const row = basePartyRow({
    id_number: "990101-12-1234",
    relationship_to_applicant: "Anak sulung",
  });
  const mapped = mapCloudParty(row);
  assert(mapped.id === row.id, "expected id round-trip");
  assert(mapped.fullName === row.full_name, "expected fullName round-trip");
  assert(mapped.idNumber === row.id_number, "expected idNumber to be read back from an existing row (read direction, unaffected by this sprint's write-side exclusion)");
  console.log("Test 30 (mapCloudParty read-direction round-trip, unaffected by this sprint): PASS [executed]");
}

// ==== Run ====================================================================

async function main() {
  await test1_UserACreateParty();
  await test2_UserBRejectedOnParentUserA();
  await test3_UserBRejectedUpdatingPartyUserA();
  await test4_AnonymousCreateRejected();
  await test5_AnonymousUpdateRejected();
  await test6_ParentIdOtherUserNotWritable();
  await test7_ValidFullPartyAccepted();
  await test8_EmptyFullNameRejected();
  await test9_InvalidPartyRoleRejected();
  await test10_UnknownPayloadKeyStripped();
  await test11_IdNumberNeverInCreatePayload();
  await test12_IdNumberNeverInUpdatePayload();
  await test13_IdNumberNotInAllowlistedPayloadBuilder();
  await test14_FirstCreateSucceeds();
  await test15_SameUuidSamePayloadRetrySucceeds();
  await test16_ChangedContentIsDuplicateConflict();
  await test17_DuplicateConflictCacheUnchanged();
  await test18_InaccessibleDuplicateNotSuccess();
  await test19_LegacyIdReturnsMappingCode();
  await test20_CurrentTimestampUpdateSucceeds();
  await test21_StaleTimestampConflict();
  await test22_AtomicTimestampFilterConfirmed();
  await test23_ParentIdCannotBeChangedViaUpdate();
  await test24_EmptyPatchHandled();
  await test25_SuccessfulCreateChangesOnlyUserACache();
  await test26_SuccessfulUpdateChangesOnlyUserACache();
  await test27_CloudFailureKeepsOldCache();
  await test28_PartySuccessProducesPartiesSynced();
  await test29_NoOtherTableWriteOccurs();
  await test30_MapCloudPartyRoundTrip();

  console.log("Parties write QA: PASS (30/30)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

// isStableCloudId / validateCreatePartyInput imported above are exercised
// indirectly through createCloudParty/updateCloudParty in every test; this
// reference keeps the import from being flagged unused by a stricter lint
// config than this QA script's own tsconfig, mirroring the same pattern in
// geometry-write.qa.ts.
void isStableCloudId;
void validateCreatePartyInput;
