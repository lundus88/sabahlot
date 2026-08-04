// Sprint listing-partner-backend QA script for listing_partners cloud
// create/update/status-transition. Run via:
//   npx tsc -p src/lib/listing-partners/listing-partners-write.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/src/lib/listing-partners/listing-partners-write.qa.js
// (same convention as parties-write.qa.ts / documents-write.qa.ts)
//
// Uses a fake Supabase client (no network, no dependency added), built
// locally in this file rather than imported from land-records' QA
// harnesses -- keeps this module's tests dependency-free of
// land-records test infrastructure too, matching the module's own
// standalone-domain design (see docs/ai/SPRINT_BRIEF_listing-partner-backend.md).
//
// Does not touch any land-records QA file or any other pre-existing
// `.qa.ts` -- those are re-run unchanged as a separate regression step.
//
// isListingPartnerCloudWriteEnabled() requires NEXT_PUBLIC_SUPABASE_URL
// to resolve to the sabahlot-dev project, same pattern as every other
// coordinator QA file in this repo. Never written to any .env file and
// never read by production code.

import {
  createListingPartner,
  updateListingPartnerProfile,
  updateListingPartnerStatus,
} from "./listing-partners-write-coordinator";
import { isListingPartnerCloudWriteEnabled } from "./feature-gate";
import { validateCreateListingPartnerInput } from "./listing-partners-validation";
import { mapListingPartnerRow } from "./mapper";
import type {
  CreateListingPartnerInput,
  ListingPartnerRow,
  UpdateListingPartnerProfileInput,
} from "./types";

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

// ---- Static assertions: structural exclusions ------------------------------

type AssertNoIdOnCreateInput = "id" extends keyof CreateListingPartnerInput ? never : true;
const _noIdOnCreate: AssertNoIdOnCreateInput = true;
void _noIdOnCreate;
console.log("Test 0a (CreateListingPartnerInput has no `id` field): PASS [static]");

type AssertNoStatusFieldsOnUpdateInput = "status" extends keyof UpdateListingPartnerProfileInput
  ? never
  : "approvedBy" extends keyof UpdateListingPartnerProfileInput
    ? never
    : "approvedAt" extends keyof UpdateListingPartnerProfileInput
      ? never
      : true;
const _noStatusOnUpdate: AssertNoStatusFieldsOnUpdateInput = true;
void _noStatusOnUpdate;
console.log("Test 0b (UpdateListingPartnerProfileInput has no status/approvedBy/approvedAt fields): PASS [static]");

// ---- Fake Supabase client ---------------------------------------------------

type TableName = "listing_partners" | "property_listings" | "profiles";

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
        throw new Error(`delete() must never be called on ${table} (no delete policy exists)`);
      },
    };
  }
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "99999999-9999-4999-8999-999999999999";
const ADMIN_ID = "55555555-5555-4555-8555-555555555555";

function baseListingPartnerRow(overrides: Partial<ListingPartnerRow> = {}): ListingPartnerRow {
  return {
    id: USER_A,
    company_name: null,
    display_name: "Test Partner A",
    phone: "+60123456789",
    email: "a@example.com",
    ren_number: null,
    bio: null,
    status: "pending",
    approved_by: null,
    approved_at: null,
    public_contact_consent: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseCreateInput(overrides: Partial<CreateListingPartnerInput> = {}): CreateListingPartnerInput {
  return {
    displayName: "Test Partner A",
    phone: "+60123456789",
    email: "a@example.com",
    ...overrides,
  };
}

// ==== Create ==================================================================

async function test1_FreshCreateSucceedsUsingSessionUserId() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: baseListingPartnerRow(), error: null });

  const result = await createListingPartner(
    client as unknown as Parameters<typeof createListingPartner>[0],
    baseCreateInput(),
  );

  assert(result.ok, "expected a fresh registration to succeed");
  if (result.ok) {
    assert(result.state === "partner_created", "expected partner_created state");
    assert(result.data.id === USER_A, "expected the created partner's id to be the session user's id");
  }
  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(payload?.id === USER_A, "insert payload id must be the session user's id");
  console.log("Test 1 (fresh registration succeeds, id = session user's own auth.uid()): PASS [executed]");
}

async function test2_IdInjectionOnCreateIgnored() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: baseListingPartnerRow(), error: null });

  const maliciousInput = {
    ...baseCreateInput(),
    id: USER_B,
  } as unknown as CreateListingPartnerInput;

  await createListingPartner(
    client as unknown as Parameters<typeof createListingPartner>[0],
    maliciousInput,
  );

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(
    payload?.id === USER_A,
    "id in the insert payload must always be the session user's own id, never a caller-supplied value",
  );
  console.log("Test 2 (id injection on create ignored, session user always wins): PASS [executed]");
}

async function test3_AnonymousCreateRejected() {
  const client = new FakeSupabaseClient();
  client.userId = null;

  const result = await createListingPartner(
    client as unknown as Parameters<typeof createListingPartner>[0],
    baseCreateInput(),
  );

  assert(!result.ok, "expected anonymous create to fail");
  if (!result.ok) {
    assert(result.code === "unauthenticated", "expected unauthenticated");
  }
  assert(client.calls.every((c) => c.op !== "insert"), "no insert should be attempted without a session");
  console.log("Test 3 (anonymous create rejected, no session): PASS [executed]");
}

async function test4_BlankDisplayNameRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createListingPartner(
    client as unknown as Parameters<typeof createListingPartner>[0],
    baseCreateInput({ displayName: "   " }),
  );

  assert(!result.ok && result.code === "validation_failed", "expected a blank displayName to be rejected");
  assert(client.calls.length === 0, "no Supabase call should be attempted for invalid input");
  console.log("Test 4 (blank displayName rejected before any Supabase call): PASS [executed]");
}

async function test5_BlankPhoneRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createListingPartner(
    client as unknown as Parameters<typeof createListingPartner>[0],
    baseCreateInput({ phone: "" }),
  );

  assert(!result.ok && result.code === "validation_failed", "expected a blank phone to be rejected");
  console.log("Test 5 (blank phone rejected): PASS [executed]");
}

async function test6_BlankEmailRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createListingPartner(
    client as unknown as Parameters<typeof createListingPartner>[0],
    baseCreateInput({ email: "" }),
  );

  assert(!result.ok && result.code === "validation_failed", "expected a blank email to be rejected");
  console.log("Test 6 (blank email rejected): PASS [executed]");
}

async function test7_ValidateCreateInputDirectSanityCheck() {
  const result = validateCreateListingPartnerInput(baseCreateInput());
  assert(result.ok, "expected the base create input to validate directly");
  console.log("Test 7 (validateCreateListingPartnerInput direct sanity check): PASS [executed]");
}

// ==== Duplicate-create resolution (ADR-002) ==================================

async function test8_RetrySameContentVerifiedSuccess() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: null, error: { message: "duplicate key value", code: "23505" } });
  client.selectByIdQueue.push({ data: baseListingPartnerRow(), error: null });

  const result = await createListingPartner(
    client as unknown as Parameters<typeof createListingPartner>[0],
    baseCreateInput(),
  );

  assert(result.ok, "expected a same-content retry to be verified as a safe idempotent success");
  if (result.ok) {
    assert(result.state === "partner_created", "expected partner_created on verified retry");
  }
  console.log("Test 8 (retry, same content -> verified success, no re-insert): PASS [executed]");
}

async function test9_RetryDifferentContentConflict() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: null, error: { message: "duplicate key value", code: "23505" } });
  client.selectByIdQueue.push({ data: baseListingPartnerRow({ display_name: "Different Name" }), error: null });

  const result = await createListingPartner(
    client as unknown as Parameters<typeof createListingPartner>[0],
    baseCreateInput(),
  );

  assert(!result.ok, "expected a different-content retry to be rejected, not silently applied");
  if (!result.ok) {
    assert(result.code === "duplicate_conflict", "expected duplicate_conflict");
  }
  console.log("Test 9 (retry, different content -> duplicate_conflict, row untouched): PASS [executed]");
}

// ==== Update own profile ======================================================

async function test10_ProfileUpdateSucceedsAndNeverSendsStatus() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({ data: baseListingPartnerRow({ bio: "Updated bio" }), error: null });

  const patch = { bio: "Updated bio" } as unknown as Record<string, unknown>;
  patch.status = "approved"; // simulate a malicious/buggy caller trying to sneak this in

  const result = await updateListingPartnerProfile(
    client as unknown as Parameters<typeof updateListingPartnerProfile>[0],
    patch as unknown as Parameters<typeof updateListingPartnerProfile>[1],
  );

  assert(result.ok, "expected a valid own-profile update to succeed");
  if (result.ok) {
    assert(result.state === "partner_updated", "expected partner_updated state");
  }
  const updateCall = client.calls.find((c) => c.op === "update");
  const payload = updateCall?.payload as Record<string, unknown> | undefined;
  assert(payload !== undefined && !("status" in payload), "the outbound UPDATE payload must never contain `status`, even if the caller's raw object had one");
  assert(payload !== undefined && !("approved_by" in payload), "the outbound UPDATE payload must never contain `approved_by`");
  assert(payload !== undefined && !("approved_at" in payload), "the outbound UPDATE payload must never contain `approved_at`");
  console.log("Test 10 (profile update succeeds, status/approved_by/approved_at never in outbound payload): PASS [executed]");
}

async function test11_ProfileUpdateScopedToOwnRow() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({ data: baseListingPartnerRow(), error: null });

  await updateListingPartnerProfile(
    client as unknown as Parameters<typeof updateListingPartnerProfile>[0],
    { bio: "hello" },
  );

  const eqCall = client.lastUpdateEqCalls.find((c) => c.column === "id");
  assert(eqCall?.value === USER_A, "the UPDATE must be scoped to the session user's own id, never any other id");
  console.log("Test 11 (profile update is scoped to the session user's own id): PASS [executed]");
}

async function test12_EmptyPatchRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await updateListingPartnerProfile(
    client as unknown as Parameters<typeof updateListingPartnerProfile>[0],
    {},
  );

  assert(!result.ok && result.code === "validation_failed", "expected an empty patch to be rejected");
  assert(client.calls.length === 0, "no Supabase call should be attempted for an empty patch");
  console.log("Test 12 (empty update patch rejected before any Supabase call): PASS [executed]");
}

async function test13_ProfileUpdateAnonymousRejected() {
  const client = new FakeSupabaseClient();
  client.userId = null;

  const result = await updateListingPartnerProfile(
    client as unknown as Parameters<typeof updateListingPartnerProfile>[0],
    { bio: "hello" },
  );

  assert(!result.ok && result.code === "unauthenticated", "expected anonymous profile update to fail");
  console.log("Test 13 (anonymous profile update rejected): PASS [executed]");
}

async function test14_ProfileUpdateNoRowsMappedToNotFoundOrForbidden() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({ data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } });

  const result = await updateListingPartnerProfile(
    client as unknown as Parameters<typeof updateListingPartnerProfile>[0],
    { bio: "hello" },
  );

  assert(!result.ok && result.code === "not_found_or_forbidden", "expected a zero-row update to map to not_found_or_forbidden");
  console.log("Test 14 (zero-row profile update maps to not_found_or_forbidden): PASS [executed]");
}

// ==== Admin status transition =================================================

async function test15_StatusUpdateSucceedsAndSetsApprovedByToCallingAdmin() {
  const client = new FakeSupabaseClient();
  client.userId = ADMIN_ID;
  client.updateQueue.push({
    data: baseListingPartnerRow({ status: "approved", approved_by: ADMIN_ID, approved_at: "2026-01-02T00:00:00.000Z" }),
    error: null,
  });

  const result = await updateListingPartnerStatus(
    client as unknown as Parameters<typeof updateListingPartnerStatus>[0],
    USER_A,
    "approved",
  );

  assert(result.ok, "expected the status update to succeed (fake client always allows it -- real RLS/trigger enforcement is documented-only, see the sprint report)");
  if (result.ok) {
    assert(result.state === "partner_status_updated", "expected partner_status_updated state");
    assert(result.data.approvedBy === ADMIN_ID, "expected approvedBy to be the calling admin's own id");
  }
  const updateCall = client.calls.find((c) => c.op === "update");
  const payload = updateCall?.payload as Record<string, unknown> | undefined;
  assert(payload?.approved_by === ADMIN_ID, "the outbound payload's approved_by must be the calling admin's own id, derived server-side");
  console.log("Test 15 (status update to approved succeeds, approved_by is always the calling admin's own id): PASS [executed]");
}

async function test16_StatusUpdateToRejectedDoesNotSetApprovedFields() {
  const client = new FakeSupabaseClient();
  client.userId = ADMIN_ID;
  client.updateQueue.push({ data: baseListingPartnerRow({ status: "rejected" }), error: null });

  await updateListingPartnerStatus(
    client as unknown as Parameters<typeof updateListingPartnerStatus>[0],
    USER_A,
    "rejected",
  );

  const updateCall = client.calls.find((c) => c.op === "update");
  const payload = updateCall?.payload as Record<string, unknown> | undefined;
  assert(!("approved_by" in (payload ?? {})), "a rejected transition must never set approved_by");
  assert(!("approved_at" in (payload ?? {})), "a rejected transition must never set approved_at");
  console.log("Test 16 (status update to rejected never sets approved_by/approved_at): PASS [executed]");
}

async function test17_StatusUpdateDenialMappedToGenericNonDisclosingFailure() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A; // a non-admin, attempting on their own row
  client.updateQueue.push({
    data: null,
    error: { message: "Only an admin may change listing_partners.status." },
  });

  const result = await updateListingPartnerStatus(
    client as unknown as Parameters<typeof updateListingPartnerStatus>[0],
    USER_A,
    "approved",
  );

  assert(!result.ok, "expected a denied status update to fail");
  if (!result.ok) {
    assert(
      result.code === "not_authorized_or_not_found",
      "expected the denial to map to the single, non-disclosing not_authorized_or_not_found code",
    );
    assert(
      !result.message.includes("Only an admin"),
      "the raw Postgres trigger exception message must never reach the caller verbatim",
    );
  }
  console.log("Test 17 (status update denial mapped to a single, non-disclosing failure code, raw error text never leaked): PASS [executed]");
}

async function test18_StatusUpdateAnonymousRejected() {
  const client = new FakeSupabaseClient();
  client.userId = null;

  const result = await updateListingPartnerStatus(
    client as unknown as Parameters<typeof updateListingPartnerStatus>[0],
    USER_A,
    "approved",
  );

  assert(!result.ok && result.code === "unauthenticated", "expected anonymous status update to fail");
  assert(client.calls.length === 0, "no Supabase call should be attempted without a session");
  console.log("Test 18 (anonymous status update rejected, no session): PASS [executed]");
}

// ==== Scope / isolation =======================================================

async function test19_NoWriteToAnyOtherTable() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: baseListingPartnerRow(), error: null });

  await createListingPartner(
    client as unknown as Parameters<typeof createListingPartner>[0],
    baseCreateInput(),
  );

  assert(
    client.calls.every((c) => c.table === "listing_partners"),
    "no write to property_listings or profiles may occur from this module",
  );
  console.log("Test 19 (no write to any other table): PASS [executed]");
}

async function test20_MapListingPartnerRowRoundTrip() {
  const domain = mapListingPartnerRow(baseListingPartnerRow({ ren_number: "REN12345" }));
  assert(domain.id === USER_A, "id must round-trip");
  assert(domain.displayName === "Test Partner A", "displayName must round-trip");
  assert(domain.renNumber === "REN12345", "renNumber must round-trip");
  assert(domain.status === "pending", "status must round-trip");
  console.log("Test 20 (mapListingPartnerRow round-trip): PASS [executed]");
}

// ==== Feature gate =============================================================

async function test21_GateOpensForSabahlotDev() {
  assert(isListingPartnerCloudWriteEnabled(), "expected the gate to be open under this file's pinned sabahlot-dev env");
  console.log("Test 21 (gate open for sabahlot-dev, NODE_ENV=development): PASS [executed]");
}

async function test22_GateClosedForNonDevProject() {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://some-other-project.supabase.co";

  assert(!isListingPartnerCloudWriteEnabled(), "expected the gate to close for a non-sabahlot-dev URL");

  process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  assert(isListingPartnerCloudWriteEnabled(), "expected the gate to reopen once restored to sabahlot-dev");
  console.log("Test 22 (gate closed for a non-sabahlot-dev project, reopens once restored): PASS [executed]");
}

async function test23_GateClosedForProductionNodeEnv() {
  const originalEnv = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });

  assert(!isListingPartnerCloudWriteEnabled(), "expected the gate to close when NODE_ENV=production, regardless of project URL");

  Object.assign(process.env, { NODE_ENV: originalEnv });
  assert(isListingPartnerCloudWriteEnabled(), "expected the gate to reopen once NODE_ENV is restored");
  console.log("Test 23 (gate closed for NODE_ENV=production, reopens once restored): PASS [executed]");
}

async function main() {
  await test1_FreshCreateSucceedsUsingSessionUserId();
  await test2_IdInjectionOnCreateIgnored();
  await test3_AnonymousCreateRejected();
  await test4_BlankDisplayNameRejected();
  await test5_BlankPhoneRejected();
  await test6_BlankEmailRejected();
  await test7_ValidateCreateInputDirectSanityCheck();
  await test8_RetrySameContentVerifiedSuccess();
  await test9_RetryDifferentContentConflict();
  await test10_ProfileUpdateSucceedsAndNeverSendsStatus();
  await test11_ProfileUpdateScopedToOwnRow();
  await test12_EmptyPatchRejected();
  await test13_ProfileUpdateAnonymousRejected();
  await test14_ProfileUpdateNoRowsMappedToNotFoundOrForbidden();
  await test15_StatusUpdateSucceedsAndSetsApprovedByToCallingAdmin();
  await test16_StatusUpdateToRejectedDoesNotSetApprovedFields();
  await test17_StatusUpdateDenialMappedToGenericNonDisclosingFailure();
  await test18_StatusUpdateAnonymousRejected();
  await test19_NoWriteToAnyOtherTable();
  await test20_MapListingPartnerRowRoundTrip();
  await test21_GateOpensForSabahlotDev();
  await test22_GateClosedForNonDevProject();
  await test23_GateClosedForProductionNodeEnv();

  console.log("\nSprint listing-partner-backend QA: ALL PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
