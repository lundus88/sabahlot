// Sprint property-listings-backend QA script for property_listings
// cloud create/update/delete. Run via:
//   npx tsc -p src/lib/listing-partners/property-listings-write.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/src/lib/listing-partners/property-listings-write.qa.js
// (same convention as listing-partners-write.qa.ts)
//
// Uses a fake Supabase client (no network, no dependency added), built
// locally in this file, same posture as listing-partners-write.qa.ts.
//
// isListingPartnerCloudWriteEnabled() requires NEXT_PUBLIC_SUPABASE_URL
// to resolve to the sabahlot-dev project, same pattern as every other
// coordinator QA file in this repo. Never written to any .env file and
// never read by production code.

import {
  createPropertyListing,
  deletePropertyListing,
  updatePropertyListing,
} from "./property-listings-write-coordinator";
import { validateCreatePropertyListingInput } from "./property-listings-validation";
import { mapPropertyListingRow } from "./mapper";
import { isStableCloudId } from "../land-records/types";
import type {
  CreatePropertyListingInput,
  ListingPartnerRow,
  PropertyListingRow,
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

type AssertNoPartnerIdOnCreateInput = "partnerId" extends keyof CreatePropertyListingInput
  ? never
  : true;
const _noPartnerIdOnCreate: AssertNoPartnerIdOnCreateInput = true;
void _noPartnerIdOnCreate;
console.log("Test 0 (CreatePropertyListingInput has no `partnerId` field): PASS [static]");

// ---- Fake Supabase client ---------------------------------------------------

type TableName = "listing_partners" | "property_listings";

interface FakeResponse {
  data: unknown;
  error: { message: string; code?: string } | null;
}

class FakeChain implements PromiseLike<FakeResponse> {
  public eqCalls: Array<{ column: string; value: unknown }> = [];

  constructor(
    private readonly client: FakeSupabaseClient,
    private readonly table: TableName,
    private readonly mode: "select" | "insert" | "update" | "delete",
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
    if (this.mode === "delete") {
      this.client.lastDeleteEqCalls = this.eqCalls;
      return Promise.resolve(
        this.client.deleteQueue.shift() ?? {
          data: null,
          error: { message: "no delete response configured" },
        },
      );
    }
    return Promise.resolve({ data: null, error: { message: "unexpected single()" } });
  }

  maybeSingle(): Promise<FakeResponse> {
    if (this.table === "listing_partners") {
      return Promise.resolve(
        this.client.partnerSelectQueue.shift() ?? { data: null, error: null },
      );
    }
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
  deleteQueue: FakeResponse[] = [];
  selectByIdQueue: FakeResponse[] = [];
  // listing_partners lookups (the pre-flight "is this partner approved"
  // check in createPropertyListing) are queued separately from
  // property_listings' own selectByIdQueue, since both tables use
  // maybeSingle() and would otherwise share one queue incorrectly.
  partnerSelectQueue: FakeResponse[] = [];
  listQueue: FakeResponse[] = [];
  lastUpdateEqCalls: Array<{ column: string; value: unknown }> = [];
  lastDeleteEqCalls: Array<{ column: string; value: unknown }> = [];
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
      delete: () => {
        this.calls.push({ op: "delete", table });
        return new FakeChain(this, table, "delete");
      },
    };
  }
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const LISTING_ID = "33333333-3333-4333-8333-333333333333";

function baseApprovedPartnerRow(overrides: Partial<ListingPartnerRow> = {}): ListingPartnerRow {
  return {
    id: USER_A,
    company_name: null,
    display_name: "Test Partner A",
    phone: "+60123456789",
    email: "a@example.com",
    ren_number: null,
    bio: null,
    status: "approved",
    approved_by: "55555555-5555-4555-8555-555555555555",
    approved_at: "2026-01-01T00:00:00.000Z",
    public_contact_consent: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseListingRow(overrides: Partial<PropertyListingRow> = {}): PropertyListingRow {
  return {
    id: LISTING_ID,
    partner_id: USER_A,
    title: "Nice plot near town",
    description: null,
    listing_type: "for_sale",
    price: 50000,
    district: null,
    village: null,
    region: "sabah",
    status: "draft",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseCreateInput(overrides: Partial<CreatePropertyListingInput> = {}): CreatePropertyListingInput {
  return {
    id: LISTING_ID,
    title: "Nice plot near town",
    listingType: "for_sale",
    price: 50000,
    region: "sabah",
    ...overrides,
  };
}

// ==== Create ==================================================================

async function test1_ApprovedPartnerCreateSucceeds() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.partnerSelectQueue.push({ data: baseApprovedPartnerRow(), error: null });
  client.insertQueue.push({ data: baseListingRow(), error: null });

  const result = await createPropertyListing(
    client as unknown as Parameters<typeof createPropertyListing>[0],
    baseCreateInput(),
  );

  assert(result.ok, "expected an approved partner's create to succeed");
  if (result.ok) {
    assert(result.state === "listing_created", "expected listing_created state");
    assert(result.data.partnerId === USER_A, "expected partnerId to be the session user's id");
  }
  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(payload?.partner_id === USER_A, "insert payload partner_id must be the session user's id");
  console.log("Test 1 (approved partner create succeeds, partner_id = session user's own id): PASS [executed]");
}

async function test2_PendingPartnerCreateRejectedBeforeInsert() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.partnerSelectQueue.push({ data: baseApprovedPartnerRow({ status: "pending" }), error: null });

  const result = await createPropertyListing(
    client as unknown as Parameters<typeof createPropertyListing>[0],
    baseCreateInput(),
  );

  assert(!result.ok, "expected a pending partner's create to be rejected");
  if (!result.ok) {
    assert(result.code === "partner_not_approved", "expected partner_not_approved");
  }
  assert(client.calls.every((c) => c.op !== "insert"), "no insert should be attempted for a non-approved partner");
  console.log("Test 2 (pending partner create rejected before any insert attempt): PASS [executed]");
}

async function test3_NoPartnerRegistrationCreateRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.partnerSelectQueue.push({ data: null, error: null });

  const result = await createPropertyListing(
    client as unknown as Parameters<typeof createPropertyListing>[0],
    baseCreateInput(),
  );

  assert(!result.ok && result.code === "partner_not_approved", "expected a user with no listing_partners row to be rejected the same way");
  console.log("Test 3 (no listing-partner registration -> partner_not_approved, same as pending): PASS [executed]");
}

async function test4_AnonymousCreateRejected() {
  const client = new FakeSupabaseClient();
  client.userId = null;

  const result = await createPropertyListing(
    client as unknown as Parameters<typeof createPropertyListing>[0],
    baseCreateInput(),
  );

  assert(!result.ok && result.code === "unauthenticated", "expected anonymous create to fail");
  assert(client.calls.length === 0, "no Supabase call should be attempted without a session");
  console.log("Test 4 (anonymous create rejected, no session, no calls attempted): PASS [executed]");
}

async function test5_BlankTitleRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createPropertyListing(
    client as unknown as Parameters<typeof createPropertyListing>[0],
    baseCreateInput({ title: "   " }),
  );

  assert(!result.ok && result.code === "validation_failed", "expected a blank title to be rejected");
  assert(client.calls.length === 0, "no Supabase call should be attempted for invalid input, not even the partner-status check");
  console.log("Test 5 (blank title rejected before any Supabase call): PASS [executed]");
}

async function test6_InvalidListingTypeRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createPropertyListing(
    client as unknown as Parameters<typeof createPropertyListing>[0],
    baseCreateInput({ listingType: "not_a_real_type" as unknown as CreatePropertyListingInput["listingType"] }),
  );

  assert(!result.ok && result.code === "validation_failed", "expected an invalid listingType to be rejected");
  console.log("Test 6 (invalid listingType rejected): PASS [executed]");
}

async function test7_LegacyNonUuidIdRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createPropertyListing(
    client as unknown as Parameters<typeof createPropertyListing>[0],
    baseCreateInput({ id: "local-123-abc" }),
  );

  assert(!result.ok && result.code === "validation_failed", "expected a legacy non-UUID id to be rejected");
  console.log("Test 7 (legacy non-UUID listing id rejected): PASS [executed]");
}

async function test8_ValidateCreateInputDirectSanityCheck() {
  const result = validateCreatePropertyListingInput(baseCreateInput());
  assert(result.ok, "expected the base create input to validate directly");
  console.log("Test 8 (validateCreatePropertyListingInput direct sanity check): PASS [executed]");
}

async function test9_IsStableCloudIdReusedSanityCheck() {
  assert(isStableCloudId(LISTING_ID), "expected a v4 UUID to be recognized as stable");
  assert(!isStableCloudId("local-123-abc"), "expected a legacy id to be rejected");
  console.log("Test 9 (isStableCloudId reused from land-records/types.ts, sanity check): PASS [executed]");
}

// ==== Duplicate-create resolution (ADR-002) ==================================

async function test10_RetrySameContentVerifiedSuccess() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.partnerSelectQueue.push({ data: baseApprovedPartnerRow(), error: null });
  client.insertQueue.push({ data: null, error: { message: "duplicate key value", code: "23505" } });
  client.selectByIdQueue.push({ data: baseListingRow(), error: null });

  const result = await createPropertyListing(
    client as unknown as Parameters<typeof createPropertyListing>[0],
    baseCreateInput(),
  );

  assert(result.ok, "expected a same-content retry to be verified as a safe idempotent success");
  if (result.ok) {
    assert(result.state === "listing_created", "expected listing_created on verified retry");
  }
  console.log("Test 10 (retry, same content -> verified success, no re-insert): PASS [executed]");
}

async function test11_RetryDifferentContentConflict() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.partnerSelectQueue.push({ data: baseApprovedPartnerRow(), error: null });
  client.insertQueue.push({ data: null, error: { message: "duplicate key value", code: "23505" } });
  client.selectByIdQueue.push({ data: baseListingRow({ title: "Different title" }), error: null });

  const result = await createPropertyListing(
    client as unknown as Parameters<typeof createPropertyListing>[0],
    baseCreateInput(),
  );

  assert(!result.ok, "expected a different-content retry to be rejected, not silently applied");
  if (!result.ok) {
    assert(result.code === "duplicate_conflict", "expected duplicate_conflict");
  }
  console.log("Test 11 (retry, different content -> duplicate_conflict, row untouched): PASS [executed]");
}

// ==== Update ===================================================================

async function test12_UpdateSucceedsIncludingStatusField() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({ data: baseListingRow({ status: "active" }), error: null });

  const result = await updatePropertyListing(
    client as unknown as Parameters<typeof updatePropertyListing>[0],
    LISTING_ID,
    { status: "active" },
  );

  assert(result.ok, "expected an owner update including `status` to succeed -- unlike listing_partners, status is an ordinary writable field here");
  if (result.ok) {
    assert(result.state === "listing_updated", "expected listing_updated state");
    assert(result.data.status === "active", "expected status to reflect the update");
  }
  const updateCall = client.calls.find((c) => c.op === "update");
  const payload = updateCall?.payload as Record<string, unknown> | undefined;
  assert(payload?.status === "active", "the outbound UPDATE payload must include status when the caller requested a status change");
  console.log("Test 12 (owner update including `status` succeeds -- status is a normal writable field for listings): PASS [executed]");
}

async function test13_UpdateScopedToRequestedId() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({ data: baseListingRow(), error: null });

  await updatePropertyListing(
    client as unknown as Parameters<typeof updatePropertyListing>[0],
    LISTING_ID,
    { price: 60000 },
  );

  const eqCall = client.lastUpdateEqCalls.find((c) => c.column === "id");
  assert(eqCall?.value === LISTING_ID, "the UPDATE must be scoped to the requested listing id");
  console.log("Test 13 (update is scoped to the requested listing id): PASS [executed]");
}

async function test14_EmptyPatchRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await updatePropertyListing(
    client as unknown as Parameters<typeof updatePropertyListing>[0],
    LISTING_ID,
    {},
  );

  assert(!result.ok && result.code === "validation_failed", "expected an empty patch to be rejected");
  assert(client.calls.length === 0, "no Supabase call should be attempted for an empty patch");
  console.log("Test 14 (empty update patch rejected before any Supabase call): PASS [executed]");
}

async function test15_UpdateAnonymousRejected() {
  const client = new FakeSupabaseClient();
  client.userId = null;

  const result = await updatePropertyListing(
    client as unknown as Parameters<typeof updatePropertyListing>[0],
    LISTING_ID,
    { price: 1 },
  );

  assert(!result.ok && result.code === "unauthenticated", "expected anonymous update to fail");
  console.log("Test 15 (anonymous update rejected): PASS [executed]");
}

async function test16_UpdateZeroRowsMappedToNotFoundOrForbidden() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({ data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } });

  const result = await updatePropertyListing(
    client as unknown as Parameters<typeof updatePropertyListing>[0],
    LISTING_ID,
    { price: 1 },
  );

  assert(!result.ok && result.code === "not_found_or_forbidden", "expected a zero-row update (not owned, not found, or partner no longer approved) to map to not_found_or_forbidden");
  console.log("Test 16 (zero-row update maps to not_found_or_forbidden, covers not-owned/not-found/no-longer-approved uniformly): PASS [executed]");
}

// ==== Delete ====================================================================

async function test17_DeleteSucceeds() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.deleteQueue.push({ data: baseListingRow(), error: null });

  const result = await deletePropertyListing(
    client as unknown as Parameters<typeof deletePropertyListing>[0],
    LISTING_ID,
  );

  assert(result.ok, "expected an owner delete to succeed");
  if (result.ok) {
    assert(result.state === "listing_deleted", "expected listing_deleted state");
  }
  const deleteCall = client.calls.find((c) => c.op === "delete");
  assert(deleteCall !== undefined, "expected a delete call to be attempted");
  const eqCall = client.lastDeleteEqCalls.find((c) => c.column === "id");
  assert(eqCall?.value === LISTING_ID, "the DELETE must be scoped to the requested listing id");
  console.log("Test 17 (owner delete succeeds, scoped to the requested listing id): PASS [executed]");
}

async function test18_DeleteAnonymousRejected() {
  const client = new FakeSupabaseClient();
  client.userId = null;

  const result = await deletePropertyListing(
    client as unknown as Parameters<typeof deletePropertyListing>[0],
    LISTING_ID,
  );

  assert(!result.ok && result.code === "unauthenticated", "expected anonymous delete to fail");
  assert(client.calls.length === 0, "no Supabase call should be attempted without a session");
  console.log("Test 18 (anonymous delete rejected, no calls attempted): PASS [executed]");
}

async function test19_DeleteZeroRowsMappedToNotFoundOrForbidden() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.deleteQueue.push({ data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } });

  const result = await deletePropertyListing(
    client as unknown as Parameters<typeof deletePropertyListing>[0],
    LISTING_ID,
  );

  assert(!result.ok && result.code === "not_found_or_forbidden", "expected a zero-row delete to map to not_found_or_forbidden");
  console.log("Test 19 (zero-row delete maps to not_found_or_forbidden): PASS [executed]");
}

// ==== Scope / isolation =========================================================

async function test20_NoWriteToListingPartnersTable() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.partnerSelectQueue.push({ data: baseApprovedPartnerRow(), error: null });
  client.insertQueue.push({ data: baseListingRow(), error: null });

  await createPropertyListing(
    client as unknown as Parameters<typeof createPropertyListing>[0],
    baseCreateInput(),
  );

  const writeCalls = client.calls.filter((c) => c.op === "insert" || c.op === "update" || c.op === "delete");
  assert(
    writeCalls.every((c) => c.table === "property_listings"),
    "no write to listing_partners may occur from this module -- the partner-status check must be read-only",
  );
  console.log("Test 20 (no write to listing_partners; the pre-flight partner-status check is read-only): PASS [executed]");
}

async function test21_MapPropertyListingRowRoundTrip() {
  const domain = mapPropertyListingRow(baseListingRow({ price: 75000, district: "Tuaran" }));
  assert(domain.id === LISTING_ID, "id must round-trip");
  assert(domain.title === "Nice plot near town", "title must round-trip");
  assert(domain.price === 75000, "price must round-trip");
  assert(domain.district === "Tuaran", "district must round-trip");
  console.log("Test 21 (mapPropertyListingRow round-trip): PASS [executed]");
}

async function main() {
  await test1_ApprovedPartnerCreateSucceeds();
  await test2_PendingPartnerCreateRejectedBeforeInsert();
  await test3_NoPartnerRegistrationCreateRejected();
  await test4_AnonymousCreateRejected();
  await test5_BlankTitleRejected();
  await test6_InvalidListingTypeRejected();
  await test7_LegacyNonUuidIdRejected();
  await test8_ValidateCreateInputDirectSanityCheck();
  await test9_IsStableCloudIdReusedSanityCheck();
  await test10_RetrySameContentVerifiedSuccess();
  await test11_RetryDifferentContentConflict();
  await test12_UpdateSucceedsIncludingStatusField();
  await test13_UpdateScopedToRequestedId();
  await test14_EmptyPatchRejected();
  await test15_UpdateAnonymousRejected();
  await test16_UpdateZeroRowsMappedToNotFoundOrForbidden();
  await test17_DeleteSucceeds();
  await test18_DeleteAnonymousRejected();
  await test19_DeleteZeroRowsMappedToNotFoundOrForbidden();
  await test20_NoWriteToListingPartnersTable();
  await test21_MapPropertyListingRowRoundTrip();

  console.log("\nSprint property-listings-backend QA: ALL PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
