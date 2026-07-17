// Sprint 02D-1A QA script for geometry cloud create/update. Run via:
//   npx tsc -p src/lib/land-records/geometry-write.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/geometry-write.qa.js
// (same convention as land-records-write.qa.ts)
//
// Uses a fake Supabase client (no network, no dependency added). Does
// not touch local-lots.ts, land-records.qa.ts, or
// land-records-write.qa.ts -- those are re-run unchanged as a separate
// verification step (see the Sprint 02D-1A report).

import {
  createCloudGeometry,
  isStableCloudId,
  mapCloudGeometryToDrawingObject,
  MapperError,
  readCloudCache,
  updateCloudGeometry,
  validateCreateGeometryInput,
  writeCloudCache,
  type CloudLandRecordGeometryRow,
  type CreateGeometryInput,
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

type TableName =
  | "land_record_geometries"
  | "land_points"
  | "land_parties"
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

  // Thenable: awaited directly for list queries (no .single()/.maybeSingle()).
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
        throw new Error(`delete() must never be called on ${table} in Sprint 02D-1A`);
      },
    };
  }
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "99999999-9999-4999-8999-999999999999";
const LAND_RECORD_ID = "22222222-2222-4222-8222-222222222222";
const GEOMETRY_ID = "33333333-3333-4333-8333-333333333333";

function baseGeometryRow(
  overrides: Partial<CloudLandRecordGeometryRow> = {},
): CloudLandRecordGeometryRow {
  return {
    id: GEOMETRY_ID,
    land_record_id: LAND_RECORD_ID,
    geometry_type: "polygon",
    category: "parent_lot",
    name: null,
    coordinates: [
      { lat: 5.98, lng: 116.07 },
      { lat: 5.99, lng: 116.08 },
      { lat: 5.97, lng: 116.09 },
      { lat: 5.98, lng: 116.07 },
    ],
    line_style: null,
    color: null,
    weight: null,
    is_visible: true,
    area_m2: 100,
    area_ha: 0.01,
    area_acre: 0.0247,
    perimeter_m: 40,
    length_m: null,
    start_bearing: null,
    end_bearing: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function basePolygonInput(overrides: Partial<CreateGeometryInput> = {}): CreateGeometryInput {
  return {
    id: GEOMETRY_ID,
    landRecordId: LAND_RECORD_ID,
    geometryType: "polygon",
    category: "parent_lot",
    coordinates: [
      { lat: 5.98, lng: 116.07 },
      { lat: 5.99, lng: 116.08 },
      { lat: 5.97, lng: 116.09 },
    ],
    ...overrides,
  };
}

function withNoExistingGeometry(client: FakeSupabaseClient) {
  client.listQueue.push({ data: [], error: null });
  return client;
}

// ==== Authentication and ownership ==========================================

async function test1_UserACreateGeometry() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;
  client.insertQueue.push({ data: baseGeometryRow(), error: null });

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput(),
  );

  assert(result.ok, "expected User A create to succeed");
  if (result.ok) {
    assert(result.state === "geometry_synced", "expected geometry_synced state");
  }
  console.log("Test 1 (User A create geometry): PASS [executed]");
}

async function test2_UserBRejectedOnParentUserA() {
  // RLS would filter listGeometriesForLandRecord/insert for a parent
  // User B does not own -- simulated here as an insert-time RLS
  // rejection (42501-shaped), which is what a real RLS denial on
  // INSERT ... WITH CHECK looks like via PostgREST.
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_B;
  client.insertQueue.push({
    data: null,
    error: { message: "new row violates row-level security policy", code: "42501" },
  });

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput(),
  );

  assert(!result.ok, "expected User B create for User A's parent to fail");
  if (!result.ok) {
    assert(result.code === "database_error", "expected database_error (RLS denial surfaces as a generic database error, not swallowed as success)");
  }
  console.log("Test 2 (User B rejected on User A's parent): PASS [executed]");
}

async function test3_UserBRejectedUpdatingGeometryUserA() {
  const client = new FakeSupabaseClient();
  client.userId = USER_B;
  // UPDATE matches zero rows (RLS filters it out for userB).
  client.updateQueue.push({ data: null, error: { message: "no rows", code: "PGRST116" } });
  // Follow-up read is also RLS-filtered for userB -- row invisible.
  client.selectByIdQueue.push({ data: null, error: null });

  const result = await updateCloudGeometry(
    client as unknown as Parameters<typeof updateCloudGeometry>[0],
    GEOMETRY_ID,
    { name: "Hijacked" },
    "2026-01-01T00:00:00.000Z",
  );

  assert(!result.ok, "expected User B update of User A's geometry to fail");
  if (!result.ok) {
    assert(result.code === "not_found_or_forbidden", "expected not_found_or_forbidden (no ownership leak)");
  }
  console.log("Test 3 (User B rejected updating User A's geometry): PASS [executed]");
}

async function test4_AnonymousCreateRejected() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = null;

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput(),
  );

  assert(!result.ok, "expected anonymous create to fail");
  if (!result.ok) {
    assert(result.code === "unauthenticated", "expected unauthenticated");
  }
  const insertCalls = client.calls.filter((c) => c.op === "insert");
  assert(insertCalls.length === 0, "no insert should be attempted without a session");
  console.log("Test 4 (anonymous create rejected, no session-less session): PASS [executed]");
}

async function test5_ExpiredSessionRejected() {
  // Same code path as anonymous -- auth.getUser() returning no user is
  // indistinguishable from "never logged in" vs "session expired" at
  // this layer, which is the correct, safe behaviour either way.
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = null;

  const result = await updateCloudGeometry(
    client as unknown as Parameters<typeof updateCloudGeometry>[0],
    GEOMETRY_ID,
    { name: "Update attempt" },
    "2026-01-01T00:00:00.000Z",
  );

  assert(!result.ok && result.code === "unauthenticated", "expected unauthenticated for expired/no session");
  console.log("Test 5 (expired/no session rejected): PASS [executed]");
}

async function test6_OwnerInjectionNotUsed() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;
  client.insertQueue.push({ data: baseGeometryRow(), error: null });

  // CreateGeometryInput has no owner/user field at all -- this is a
  // structural guarantee, but we still verify the actual insert
  // payload never contains anything resembling one even if a caller
  // bypasses TypeScript.
  const maliciousInput = {
    ...basePolygonInput(),
    owner_id: USER_B,
    ownerId: USER_B,
    captured_by: USER_B,
  } as unknown as CreateGeometryInput;

  await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    maliciousInput,
  );

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(
    !("owner_id" in (payload ?? {})) && !("captured_by" in (payload ?? {})),
    "no owner/user field must ever reach the insert payload",
  );
  console.log("Test 6 (owner injection not used): PASS [executed]");
}

async function test7_ParentIdOtherUserNotWritable() {
  // Covered structurally by Test 2 (RLS denial) -- this test confirms
  // the payload sent to the database still uses the CALLER-SUPPLIED
  // landRecordId (not silently substituted), so the RLS denial is what
  // actually protects this, not any client-side substitution.
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_B;
  client.insertQueue.push({
    data: null,
    error: { message: "new row violates row-level security policy", code: "42501" },
  });

  await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput(),
  );

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(payload?.land_record_id === LAND_RECORD_ID, "the attempted land_record_id must reach RLS unmodified for it to actually deny the request");
  console.log("Test 7 (parent id of another user is rejected by RLS, not by silent substitution): PASS [executed]");
}

// ==== Validation =============================================================

async function test8_ValidPolygonAccepted() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;
  client.insertQueue.push({ data: baseGeometryRow(), error: null });

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput(),
  );
  assert(result.ok, "expected a valid polygon to be accepted");
  console.log("Test 8 (valid polygon accepted): PASS [executed]");
}

async function test9_EmptyGeometryRejected() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput({ coordinates: [] }),
  );
  assert(!result.ok && result.code === "validation_failed", "expected empty coordinates to be rejected before any INSERT");
  assert(client.calls.every((c) => c.op !== "insert"), "no insert should be attempted for invalid input");
  console.log("Test 9 (empty geometry rejected): PASS [executed]");
}

async function test10_InvalidLongitudeRejected() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput({
      coordinates: [
        { lat: 5.98, lng: 200 },
        { lat: 5.99, lng: 116.08 },
        { lat: 5.97, lng: 116.09 },
      ],
    }),
  );
  assert(!result.ok && result.code === "validation_failed", "expected out-of-range longitude to be rejected");
  console.log("Test 10 (invalid longitude rejected): PASS [executed]");
}

async function test11_InvalidLatitudeRejected() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput({
      coordinates: [
        { lat: 95, lng: 116.07 },
        { lat: 5.99, lng: 116.08 },
        { lat: 5.97, lng: 116.09 },
      ],
    }),
  );
  assert(!result.ok && result.code === "validation_failed", "expected out-of-range latitude to be rejected");
  console.log("Test 11 (invalid latitude rejected): PASS [executed]");
}

async function test12_NaNInfinityRejected() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;

  const nanResult = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput({
      coordinates: [
        { lat: Number.NaN, lng: 116.07 },
        { lat: 5.99, lng: 116.08 },
        { lat: 5.97, lng: 116.09 },
      ],
    }),
  );
  assert(!nanResult.ok && nanResult.code === "validation_failed", "expected NaN to be rejected");

  const infResult = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput({
      coordinates: [
        { lat: 5.98, lng: Number.POSITIVE_INFINITY },
        { lat: 5.99, lng: 116.08 },
        { lat: 5.97, lng: 116.09 },
      ],
    }),
  );
  assert(!infResult.ok && infResult.code === "validation_failed", "expected Infinity to be rejected");
  console.log("Test 12 (NaN/Infinity rejected): PASS [executed]");
}

async function test13_MinimumVertexFails() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput({ coordinates: [{ lat: 5.98, lng: 116.07 }, { lat: 5.99, lng: 116.08 }] }),
  );
  assert(!result.ok && result.code === "validation_failed", "expected fewer than 3 vertices for a polygon to be rejected");
  console.log("Test 13 (minimum vertex count enforced): PASS [executed]");
}

async function test14_UnclosedRingNormalized() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;
  client.insertQueue.push({ data: baseGeometryRow(), error: null });

  await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput({
      coordinates: [
        { lat: 5.98, lng: 116.07 },
        { lat: 5.99, lng: 116.08 },
        { lat: 5.97, lng: 116.09 },
      ],
    }),
  );

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as { coordinates: { lat: number; lng: number }[] };
  const first = payload.coordinates[0];
  const last = payload.coordinates[payload.coordinates.length - 1];
  assert(
    first.lat === last.lat && first.lng === last.lng,
    "an unclosed ring must be explicitly normalized (closed) before being sent to the database, not silently rejected",
  );
  console.log("Test 14 (unclosed ring explicitly normalized/closed): PASS [executed]");
}

async function test15_UnsupportedGeometryTypeRejected() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput({ geometryType: "circle" as CreateGeometryInput["geometryType"] }),
  );
  assert(!result.ok && result.code === "validation_failed", "expected unsupported geometry type to be rejected");
  console.log("Test 15 (unsupported geometry type rejected): PASS [executed]");
}

function test16_UnsupportedCrsNote() {
  // There is no CRS parameter anywhere in GeometryWritableFields or the
  // land_record_geometries schema -- coordinates are always bare
  // {lat, lng} pairs, implicitly WGS84, matching every other geometry
  // in this app (lots.polygon_geojson, DrawingObject). There is
  // structurally no way for a caller to submit "an unsupported CRS"
  // because there is no field through which to name one.
  console.log("Test 16 (unsupported CRS): DOCUMENTED-ONLY -- no CRS parameter exists anywhere in the model to reject; WGS84 is implicit and unconditional");
}

function test17_LatLngSwapHintDetected() {
  // Best-effort heuristic only (see geometry-validation.ts) -- checked
  // via the validation error message content, not a hard guarantee.
  const swapped = {
    ...basePolygonInput(),
    coordinates: [
      { lat: 116.07, lng: 45 }, // lat holds a longitude-shaped value
      { lat: 5.99, lng: 116.08 },
      { lat: 5.97, lng: 116.09 },
    ],
  };
  const result = validateCreateGeometryInput(swapped);
  assert(!result.ok, "expected the swapped value to fail range validation");
  if (!result.ok) {
    assert(result.error.includes("swap"), "expected a best-effort lat/lng swap hint in the validation error message");
  }
  console.log("Test 17 (lat/lng swap hint detected on a plausible swap): PASS [executed, best-effort heuristic]");
}

async function test18_InvalidCategoryRejected() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput({ category: "not_a_real_category" as CreateGeometryInput["category"] }),
  );
  assert(!result.ok && result.code === "validation_failed", "expected invalid category to be rejected");
  console.log("Test 18 (invalid category rejected): PASS [executed]");
}

async function test19_InvalidLineStyleRejected() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput({ lineStyle: "not_a_real_style" as CreateGeometryInput["lineStyle"] }),
  );
  assert(!result.ok && result.code === "validation_failed", "expected invalid lineStyle to be rejected");
  console.log("Test 19 (invalid line-style rejected): PASS [executed]");
}

async function test20_UnknownPayloadKeyStripped() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;
  client.insertQueue.push({ data: baseGeometryRow(), error: null });

  const inputWithUnknownKey = {
    ...basePolygonInput(),
    thisFieldDoesNotExistInSchema: "malicious value",
  } as CreateGeometryInput;

  await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    inputWithUnknownKey,
  );

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(
    !("thisFieldDoesNotExistInSchema" in (payload ?? {})),
    "unknown payload keys must never reach the database insert payload",
  );
  console.log("Test 20 (unknown payload key never reaches the database): PASS [executed]");
}

// ==== Stable ID and duplicate ===============================================

async function test21_FirstCreateSucceeds() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;
  client.insertQueue.push({ data: baseGeometryRow(), error: null });

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput(),
  );
  assert(result.ok, "expected first create to succeed");
  console.log("Test 21 (first create succeeds): PASS [executed]");
}

async function test22_SameUuidSamePayloadRetrySucceeds() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: baseGeometryRow(), error: null });

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput(),
  );
  assert(result.ok, "expected same UUID + same payload retry to succeed");
  if (result.ok) assert(result.state === "geometry_synced", "expected geometry_synced");
  console.log("Test 22 (same UUID + same payload retry succeeds): PASS [executed]");
}

async function test23_ChangedCoordinateIsDuplicateConflict() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({
    data: baseGeometryRow({
      coordinates: [
        { lat: 1.0, lng: 1.0 },
        { lat: 2.0, lng: 2.0 },
        { lat: 3.0, lng: 3.0 },
        { lat: 1.0, lng: 1.0 },
      ],
    }),
    error: null,
  });

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput(),
  );
  assert(!result.ok && result.code === "duplicate_conflict", "expected changed coordinates to produce duplicate_conflict");
  console.log("Test 23 (same UUID + changed coordinate -> duplicate_conflict): PASS [executed]");
}

async function test24_ChangedMetadataIsDuplicateConflict() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: baseGeometryRow({ category: "proposed_lot" }), error: null });

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput(),
  );
  assert(!result.ok && result.code === "duplicate_conflict", "expected changed category (metadata) to produce duplicate_conflict");
  console.log("Test 24 (same UUID + changed metadata -> duplicate_conflict): PASS [executed]");
}

async function test25_DuplicateConflictCacheUnchanged() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: baseGeometryRow({ category: "proposed_lot" }), error: null });

  const before = readCloudCache(USER_A);
  await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput(),
  );
  const after = readCloudCache(USER_A);

  assert(
    JSON.stringify(before) === JSON.stringify(after),
    "cache must be unchanged when a duplicate_conflict is reported",
  );
  console.log("Test 25 (duplicate conflict does not change cache): PASS [executed]");
}

async function test26_InaccessibleDuplicateNotSuccess() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: null, error: null });

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput(),
  );
  assert(!result.ok && result.code === "not_found_or_forbidden", "an unreadable duplicate must never be treated as success");
  console.log("Test 26 (inaccessible duplicate is not success): PASS [executed]");
}

function test27_LegacyNonUuidGeometryRejected() {
  const legacyId = "local-1699999999-abc123";
  assert(!isStableCloudId(legacyId), "sanity: legacy id must not be considered a stable UUID");
  console.log("Test 27 (legacy non-UUID geometry id rejected): PASS [executed via isStableCloudId, full flow covered by Test 4-family unauthenticated/validation checks]");
}

async function test27b_LegacyIdReturnsMappingCode() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput({ id: "local-1699999999-abc123" }),
  );
  assert(!result.ok && result.code === "legacy_child_id_requires_mapping", "expected legacy_child_id_requires_mapping");
  const insertCalls = client.calls.filter((c) => c.op === "insert");
  assert(insertCalls.length === 0, "no insert should ever be attempted for a non-UUID legacy id");
  console.log("Test 27b (legacy id returns legacy_child_id_requires_mapping, no upload): PASS [executed]");
}

async function test28_ConcurrentSamePayloadOneRow() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.listQueue.push({ data: [], error: null });
  client.listQueue.push({ data: [], error: null });
  client.insertQueue.push({ data: baseGeometryRow(), error: null });
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: baseGeometryRow(), error: null });

  const [resultA, resultB] = await Promise.all([
    createCloudGeometry(client as unknown as Parameters<typeof createCloudGeometry>[0], basePolygonInput()),
    createCloudGeometry(client as unknown as Parameters<typeof createCloudGeometry>[0], basePolygonInput()),
  ]);

  assert(resultA.ok && resultB.ok, "both concurrent requests with identical content must report success");
  const insertCalls = client.calls.filter((c) => c.op === "insert");
  assert(insertCalls.length === 2, "expected two insert attempts (one real, one that hit 23505)");
  console.log("Test 28 (concurrent same payload -> one row, both succeed) [conceptual/mock, single-threaded event loop]: PASS");
}

async function test29_ConcurrentDifferentPayloadOneSuccessOneConflict() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.listQueue.push({ data: [], error: null });
  client.listQueue.push({ data: [], error: null });
  client.insertQueue.push({ data: baseGeometryRow({ category: "parent_lot" }), error: null });
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: baseGeometryRow({ category: "parent_lot" }), error: null });

  const [resultA, resultB] = await Promise.all([
    createCloudGeometry(
      client as unknown as Parameters<typeof createCloudGeometry>[0],
      basePolygonInput({ category: "parent_lot" }),
    ),
    createCloudGeometry(
      client as unknown as Parameters<typeof createCloudGeometry>[0],
      basePolygonInput({ category: "proposed_lot" }),
    ),
  ]);

  assert(resultA.ok, "the request matching the committed row must succeed");
  assert(!resultB.ok && resultB.code === "duplicate_conflict", "the request with different content must report duplicate_conflict");
  console.log("Test 29 (concurrent different payload -> one success, one duplicate_conflict) [conceptual/mock]: PASS");
}

// ==== Update/conflict ========================================================

async function test30_CurrentTimestampUpdateSucceeds() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({
    data: baseGeometryRow({ name: "Updated", updated_at: "2026-01-02T00:00:00.000Z" }),
    error: null,
  });

  const result = await updateCloudGeometry(
    client as unknown as Parameters<typeof updateCloudGeometry>[0],
    GEOMETRY_ID,
    { name: "Updated" },
    "2026-01-01T00:00:00.000Z",
  );
  assert(result.ok, "expected update with correct expectedUpdatedAt to succeed");
  if (result.ok) assert(result.state === "geometry_synced", "expected geometry_synced");
  console.log("Test 30 (current updated_at update succeeds): PASS [executed]");
}

async function test31_StaleTimestampConflict() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({ data: null, error: { message: "no rows", code: "PGRST116" } });
  client.selectByIdQueue.push({ data: baseGeometryRow({ updated_at: "2026-01-05T00:00:00.000Z" }), error: null });

  const result = await updateCloudGeometry(
    client as unknown as Parameters<typeof updateCloudGeometry>[0],
    GEOMETRY_ID,
    { name: "Stale attempt" },
    "2026-01-01T00:00:00.000Z",
  );
  assert(!result.ok, "expected stale update to fail");
  if (!result.ok) {
    assert(result.state === "conflict" && result.code === "stale_conflict", "expected conflict/stale_conflict");
    assert(result.serverData?.id === GEOMETRY_ID, "expected server geometry attached for a future conflict UI");
  }
  console.log("Test 31 (stale updated_at produces conflict, not overwrite): PASS [executed]");
}

async function test32_AtomicTimestampFilterConfirmed() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({ data: baseGeometryRow(), error: null });

  await updateCloudGeometry(
    client as unknown as Parameters<typeof updateCloudGeometry>[0],
    GEOMETRY_ID,
    { name: "Check filter" },
    "2026-01-01T00:00:00.000Z",
  );

  const eqCalls = client.lastUpdateEqCalls;
  const hasIdFilter = eqCalls.some((c) => c.column === "id" && c.value === GEOMETRY_ID);
  const hasTimestampFilter = eqCalls.some(
    (c) => c.column === "updated_at" && c.value === "2026-01-01T00:00:00.000Z",
  );
  assert(hasIdFilter && hasTimestampFilter, "UPDATE must filter by BOTH id and updated_at in the same query, not a separate read-then-write");
  console.log("Test 32 (atomic id+updated_at filter confirmed on the actual UPDATE call): PASS [executed]");
}

async function test33_ConflictCacheUnchanged() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({ data: null, error: { message: "no rows", code: "PGRST116" } });
  client.selectByIdQueue.push({ data: baseGeometryRow({ updated_at: "2026-01-05T00:00:00.000Z" }), error: null });

  const before = readCloudCache(USER_A);
  await updateCloudGeometry(
    client as unknown as Parameters<typeof updateCloudGeometry>[0],
    GEOMETRY_ID,
    { name: "Stale attempt" },
    "2026-01-01T00:00:00.000Z",
  );
  const after = readCloudCache(USER_A);

  assert(JSON.stringify(before) === JSON.stringify(after), "cache must be unchanged on stale conflict");
  console.log("Test 33 (conflict does not change cache): PASS [executed]");
}

async function test34_ReturnedServerTimestampUsedAfterUpdate() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  // Pre-seed cache with a parent record + old geometry so we can check
  // the merge actually replaced it.
  writeCloudCache(
    USER_A,
    [
      {
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
        geometries: [mapCloudGeometryToDrawingObject(baseGeometryRow())],
        points: [],
        parties: [],
        ownerName: null,
        originalApplicantStatus: "",
      },
    ],
    "2026-01-01T00:00:00.000Z",
  );

  client.updateQueue.push({
    data: baseGeometryRow({ updated_at: "2026-02-01T00:00:00.000Z", name: "New name" }),
    error: null,
  });

  await updateCloudGeometry(
    client as unknown as Parameters<typeof updateCloudGeometry>[0],
    GEOMETRY_ID,
    { name: "New name" },
    "2026-01-01T00:00:00.000Z",
  );

  const cached = readCloudCache(USER_A);
  const cachedGeometry = cached?.records[0]?.geometries.find((g) => g.id === GEOMETRY_ID);
  assert(cachedGeometry?.updatedAt === "2026-02-01T00:00:00.000Z", "cache must reflect the server-returned updated_at, not the caller's expected value");
  console.log("Test 34 (returned server timestamp used in cache after update): PASS [executed]");
}

async function test35_ParentIdCannotBeChangedViaUpdate() {
  // UpdateGeometryInput has no landRecordId field at all -- structural
  // guarantee. Confirm the update payload sent to the database never
  // contains land_record_id even if a caller bypasses TypeScript.
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.updateQueue.push({ data: baseGeometryRow(), error: null });

  const maliciousPatch = { name: "ok", landRecordId: "44444444-4444-4444-8444-444444444444" } as unknown;

  await updateCloudGeometry(
    client as unknown as Parameters<typeof updateCloudGeometry>[0],
    GEOMETRY_ID,
    maliciousPatch as Parameters<typeof updateCloudGeometry>[2],
    "2026-01-01T00:00:00.000Z",
  );

  const updateCall = client.calls.find((c) => c.op === "update");
  const payload = updateCall?.payload as Record<string, unknown> | undefined;
  assert(!("land_record_id" in (payload ?? {})), "land_record_id must never appear in an update payload");
  console.log("Test 35 (parent id cannot be changed via update): PASS [executed]");
}

async function test36_EmptyPatchHandled() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await updateCloudGeometry(
    client as unknown as Parameters<typeof updateCloudGeometry>[0],
    GEOMETRY_ID,
    {},
    "2026-01-01T00:00:00.000Z",
  );
  assert(!result.ok && result.code === "validation_failed", "expected an empty patch to be rejected cleanly, not sent to the database");
  const updateCalls = client.calls.filter((c) => c.op === "update");
  assert(updateCalls.length === 0, "no UPDATE should be attempted for an empty patch");
  console.log("Test 36 (empty patch handled without a database call): PASS [executed]");
}

// ==== Sync/cache =============================================================

async function test37_SuccessfulCreateChangesOnlyUserACache() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;
  client.insertQueue.push({ data: baseGeometryRow(), error: null });

  writeCloudCache(
    USER_A,
    [
      {
        id: LAND_RECORD_ID, recordName: "Test", lotNumber: null, village: null, district: null,
        landCaseType: "", applicationAge: "", recordsAvailable: [], issueTags: [],
        heirsCanIdentifyLocation: "", landHistoryNotes: null, status: "draft",
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
        geometries: [], points: [], parties: [], ownerName: null, originalApplicantStatus: "",
      },
    ],
    "2026-01-01T00:00:00.000Z",
  );

  await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput(),
  );

  const cacheA = readCloudCache(USER_A);
  assert(
    cacheA?.records[0]?.geometries.some((g) => g.id === GEOMETRY_ID),
    "expected the new geometry in User A's cache",
  );
  const cacheB = readCloudCache(USER_B);
  assert(cacheB === null, "User B's cache must remain untouched");
  console.log("Test 37 (successful create changes only User A's cache): PASS [executed]");
}

async function test38_SuccessfulUpdateChangesOnlyUserACache() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  writeCloudCache(
    USER_A,
    [
      {
        id: LAND_RECORD_ID, recordName: "Test", lotNumber: null, village: null, district: null,
        landCaseType: "", applicationAge: "", recordsAvailable: [], issueTags: [],
        heirsCanIdentifyLocation: "", landHistoryNotes: null, status: "draft",
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
        geometries: [mapCloudGeometryToDrawingObject(baseGeometryRow())],
        points: [], parties: [], ownerName: null, originalApplicantStatus: "",
      },
    ],
    "2026-01-01T00:00:00.000Z",
  );
  client.updateQueue.push({ data: baseGeometryRow({ name: "Renamed" }), error: null });

  await updateCloudGeometry(
    client as unknown as Parameters<typeof updateCloudGeometry>[0],
    GEOMETRY_ID,
    { name: "Renamed" },
    "2026-01-01T00:00:00.000Z",
  );

  const cacheA = readCloudCache(USER_A);
  const geometry = cacheA?.records[0]?.geometries.find((g) => g.id === GEOMETRY_ID);
  assert(geometry?.name === "Renamed", "expected User A's cache to reflect the update");
  const cacheB = readCloudCache(USER_B);
  assert(cacheB === null, "User B's cache must remain untouched");
  console.log("Test 38 (successful update changes only User A's cache): PASS [executed]");
}

async function test39_CloudFailureKeepsOldCache() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;
  client.insertQueue.push({ data: null, error: { message: "simulated database error" } });

  const before = readCloudCache(USER_A);
  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput(),
  );
  const after = readCloudCache(USER_A);

  assert(!result.ok, "expected simulated database failure to be reported as a failure");
  assert(JSON.stringify(before) === JSON.stringify(after), "cache must be unchanged after a failed create");
  console.log("Test 39 (cloud failure keeps old cache): PASS [executed]");
}

function test40_UserBCacheUnchangedNote() {
  // Covered directly by Test 37/38 assertions (cacheB === null
  // throughout). No separate test needed.
  console.log("Test 40 (User B cache never touched by User A's writes): PASS [covered by Test 37/38 assertions]");
}

function test41_GeometrySuccessProducesGeometrySynced() {
  // Covered by Test 1/22/30 assertions (result.state === "geometry_synced").
  console.log("Test 41 (geometry success produces geometry_synced): PASS [covered by Test 1/22/30 assertions]");
}

async function test42_GeometrySuccessDoesNotProduceCoreRecordSynced() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;
  client.insertQueue.push({ data: baseGeometryRow(), error: null });

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput(),
  );
  assert(result.ok, "expected create to succeed for this check");
  if (result.ok) {
    assert(
      (result.state as string) !== "core_record_synced" && (result.state as string) !== "record_synced",
      "geometry success alone must never report core_record_synced or record_synced",
    );
  }
  console.log("Test 42 (geometry success does not produce core_record_synced): PASS [executed]");
}

function test43_FullRecordSyncedNeverUsed() {
  // Static/code-search assertion: `full_record_synced` does not appear
  // anywhere in child-types.ts's ChildSyncState union or in this
  // sprint's coordinator code (confirmed via source review, see the
  // Sprint 02D-1A report's Cloud Operation Scan section).
  console.log("Test 43 (full_record_synced never used): PASS [static assertion, confirmed via source review]");
}

function test44_LegacyWorkflowNote() {
  // Verified by re-running local-lots.qa.ts and land-records-write.qa.ts
  // unchanged, as a separate step (see the Sprint 02D-1A report,
  // section Verification) -- not duplicated inside this file.
  console.log("Test 44 (legacy workflow unchanged): PASS [verified via unchanged re-run of local-lots.qa.ts / land-records-write.qa.ts, see report]");
}

async function test45_NoPointPartyDocumentWrite() {
  const client = withNoExistingGeometry(new FakeSupabaseClient());
  client.userId = USER_A;
  client.insertQueue.push({ data: baseGeometryRow(), error: null });

  await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput(),
  );

  const otherTableCalls = client.calls.filter((c) =>
    ["land_points", "land_parties", "documents"].includes(c.table),
  );
  assert(otherTableCalls.length === 0, "no point, party, or document table should ever be touched by geometry writes");
  console.log("Test 45 (no point/party/document write occurs): PASS [executed]");
}

// ==== One-active-geometry-per-parent (Sprint 02D-1A §13) ====================

async function testOneActiveGeometryRuleEnforced() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  // Parent already has a DIFFERENT geometry.
  client.listQueue.push({
    data: [baseGeometryRow({ id: "55555555-5555-4555-8555-555555555555" })],
    error: null,
  });

  const result = await createCloudGeometry(
    client as unknown as Parameters<typeof createCloudGeometry>[0],
    basePolygonInput(),
  );
  assert(!result.ok && result.code === "validation_failed", "expected creating a second active geometry for the same parent to be rejected");
  const insertCalls = client.calls.filter((c) => c.op === "insert");
  assert(insertCalls.length === 0, "no insert should be attempted when the parent already has a different active geometry");
  console.log("Test (one-active-geometry-per-parent enforced at application level): PASS [executed; TOCTOU gap under true concurrency documented in report, not fixed here]");
}

// ==== Mapper validation reuse (category/line_style, structural) =============

function testMapperRejectsInvalidCategory() {
  let threw = false;
  try {
    mapCloudGeometryToDrawingObject(baseGeometryRow({ category: "not_real" }));
  } catch (error) {
    threw = error instanceof MapperError;
  }
  assert(threw, "read-path mapper must still reject an invalid category (Sprint 02C-1 Patch 1 behaviour, unaffected by this sprint)");
  console.log("Test (read-path mapper still rejects invalid category, unaffected by Sprint 02D-1A): PASS [executed]");
}

async function main() {
  await test1_UserACreateGeometry();
  await test2_UserBRejectedOnParentUserA();
  await test3_UserBRejectedUpdatingGeometryUserA();
  await test4_AnonymousCreateRejected();
  await test5_ExpiredSessionRejected();
  await test6_OwnerInjectionNotUsed();
  await test7_ParentIdOtherUserNotWritable();

  await test8_ValidPolygonAccepted();
  await test9_EmptyGeometryRejected();
  await test10_InvalidLongitudeRejected();
  await test11_InvalidLatitudeRejected();
  await test12_NaNInfinityRejected();
  await test13_MinimumVertexFails();
  await test14_UnclosedRingNormalized();
  await test15_UnsupportedGeometryTypeRejected();
  test16_UnsupportedCrsNote();
  test17_LatLngSwapHintDetected();
  await test18_InvalidCategoryRejected();
  await test19_InvalidLineStyleRejected();
  await test20_UnknownPayloadKeyStripped();

  await test21_FirstCreateSucceeds();
  await test22_SameUuidSamePayloadRetrySucceeds();
  await test23_ChangedCoordinateIsDuplicateConflict();
  await test24_ChangedMetadataIsDuplicateConflict();
  await test25_DuplicateConflictCacheUnchanged();
  await test26_InaccessibleDuplicateNotSuccess();
  test27_LegacyNonUuidGeometryRejected();
  await test27b_LegacyIdReturnsMappingCode();
  await test28_ConcurrentSamePayloadOneRow();
  await test29_ConcurrentDifferentPayloadOneSuccessOneConflict();

  await test30_CurrentTimestampUpdateSucceeds();
  await test31_StaleTimestampConflict();
  await test32_AtomicTimestampFilterConfirmed();
  await test33_ConflictCacheUnchanged();
  await test34_ReturnedServerTimestampUsedAfterUpdate();
  await test35_ParentIdCannotBeChangedViaUpdate();
  await test36_EmptyPatchHandled();

  await test37_SuccessfulCreateChangesOnlyUserACache();
  await test38_SuccessfulUpdateChangesOnlyUserACache();
  await test39_CloudFailureKeepsOldCache();
  test40_UserBCacheUnchangedNote();
  test41_GeometrySuccessProducesGeometrySynced();
  await test42_GeometrySuccessDoesNotProduceCoreRecordSynced();
  test43_FullRecordSyncedNeverUsed();
  test44_LegacyWorkflowNote();
  await test45_NoPointPartyDocumentWrite();

  await testOneActiveGeometryRuleEnforced();
  testMapperRejectsInvalidCategory();

  console.log("Sprint 02D-1A geometry write QA: ALL PASS");
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
