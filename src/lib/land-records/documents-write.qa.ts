// Sprint documents cloud write QA script for `documents` + Storage
// cloud create (create-only). Run via:
//   npx tsc -p src/lib/land-records/documents-write.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/documents-write.qa.js
// (same convention as parties-write.qa.ts / points-write.qa.ts)
//
// Uses a fake Supabase client (no network, no dependency added) that
// also fakes the .storage.from(bucket).upload(...) surface, since this
// is the one child table that writes to two independent Supabase
// resources per create. Does not touch local-lots.qa.ts,
// land-records.qa.ts, land-records-write.qa.ts, geometry-write.qa.ts,
// points-write.qa.ts, or parties-write.qa.ts -- those are re-run
// unchanged as a separate regression step, not modified by this
// sprint.

import {
  createCloudDocument,
} from "./documents-write-coordinator";
import {
  DOCUMENTS_STORAGE_BUCKET,
  mapCloudDocument,
  validateCreateDocumentInput,
  buildDocumentStoragePath,
} from "./documents-validation";
import type { CloudDocumentRow, CreateDocumentInput } from "./documents-validation";
import { isStableCloudId } from "./types";
import { readDocumentsCache, writeDocumentsCache } from "./documents-cache";

// Sprint 02C-2 regression-fix pattern, reused here: isCloudWriteEnabled()
// requires NEXT_PUBLIC_SUPABASE_URL to resolve to the sabahlot-dev
// project. Never written to any .env file and never read by production
// code.
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

// ---- Fake Supabase client (table + storage) --------------------------------

type TableName = "documents" | "land_records" | "land_record_geometries" | "land_points" | "land_parties";

interface FakeResponse {
  data: unknown;
  error: { message: string; code?: string } | null;
}

interface FakeStorageResponse {
  data: unknown;
  error: { message: string; statusCode?: string } | null;
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
    return Promise.resolve(this.client.selectByIdQueue.shift() ?? { data: null, error: null });
  }

  then<TResult1 = FakeResponse, TResult2 = never>(
    onfulfilled?: ((value: FakeResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const response = this.client.listQueue.shift() ?? { data: [], error: null };
    return Promise.resolve(response).then(onfulfilled, onrejected);
  }
}

interface StorageUploadCall {
  bucket: string;
  path: string;
  options?: { contentType?: string; upsert?: boolean };
}

class FakeSupabaseClient {
  calls: Array<{ op: string; table: TableName; payload?: unknown }> = [];
  insertQueue: FakeResponse[] = [];
  selectByIdQueue: FakeResponse[] = [];
  listQueue: FakeResponse[] = [];
  storageUploadQueue: FakeStorageResponse[] = [];
  storageUploadCalls: StorageUploadCall[] = [];
  userId: string | null = null;

  auth = {
    getUser: async () => ({
      data: { user: this.userId ? { id: this.userId } : null },
      error: null,
    }),
  };

  storage = {
    from: (bucket: string) => ({
      upload: async (path: string, _file: Blob, options?: { contentType?: string; upsert?: boolean }) => {
        this.storageUploadCalls.push({ bucket, path, options });
        return (
          this.storageUploadQueue.shift() ?? { data: { path }, error: null }
        );
      },
    }),
  };

  from(table: TableName) {
    return {
      insert: (payload: unknown) => {
        this.calls.push({ op: "insert", table, payload });
        return new FakeChain(this, table, "insert");
      },
      update: (): never => {
        throw new Error(`update() must never be called on ${table} in this sprint (documents are create-only)`);
      },
      select: () => {
        this.calls.push({ op: "select", table });
        return new FakeChain(this, table, "select");
      },
      delete: (): never => {
        throw new Error(`delete() must never be called on ${table} in this sprint`);
      },
    };
  }
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "99999999-9999-4999-8999-999999999999";
const LAND_RECORD_ID = "22222222-2222-4222-8222-222222222222";
const DOCUMENT_ID = "33333333-3333-4333-8333-333333333333";

function fakeFile(overrides: Partial<{ name: string; type: string; size: number }> = {}): File {
  const name = overrides.name ?? "title-deed.pdf";
  const type = overrides.type ?? "application/pdf";
  const size = overrides.size ?? 1024;
  const bytes = new Uint8Array(size);
  return new File([bytes], name, { type });
}

function baseDocumentRow(overrides: Partial<CloudDocumentRow> = {}): CloudDocumentRow {
  return {
    id: DOCUMENT_ID,
    land_record_id: LAND_RECORD_ID,
    uploaded_by: USER_A,
    document_type: "title_deed",
    storage_bucket: DOCUMENTS_STORAGE_BUCKET,
    storage_path: buildDocumentStoragePath(USER_A, DOCUMENT_ID, "title-deed.pdf"),
    original_filename: "title-deed.pdf",
    mime_type: "application/pdf",
    size_bytes: 1024,
    is_sensitive: true,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseDocumentInput(overrides: Partial<CreateDocumentInput> = {}): CreateDocumentInput {
  return {
    id: DOCUMENT_ID,
    landRecordId: LAND_RECORD_ID,
    documentType: "title_deed",
    originalFilename: "title-deed.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    ...overrides,
  };
}

function withFakeLocalStorage<T>(fn: () => T): T {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  (globalThis as unknown as { window: Window }).window = globalThis as unknown as Window;
  return fn();
}

// ==== Authentication and ownership ==========================================

async function test1_UserACreateDocument() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: baseDocumentRow(), error: null });

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput(),
    fakeFile(),
  );

  assert(result.ok, "expected User A create to succeed");
  if (result.ok) {
    assert(result.state === "documents_synced", "expected documents_synced state");
  }
  console.log("Test 1 (User A create document): PASS [executed]");
}

async function test2_UserBRejectedOnParentUserA() {
  const client = new FakeSupabaseClient();
  client.userId = USER_B;
  client.insertQueue.push({
    data: null,
    error: { message: "new row violates row-level security policy", code: "42501" },
  });

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput(),
    fakeFile(),
  );

  assert(!result.ok, "expected User B create for User A's parent to fail");
  if (!result.ok) {
    assert(result.code === "database_error", "expected database_error (RLS denial, not swallowed as success)");
  }
  console.log("Test 2 (User B rejected on User A's parent): PASS [executed]");
}

async function test3_AnonymousCreateRejected() {
  const client = new FakeSupabaseClient();
  client.userId = null;

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput(),
    fakeFile(),
  );

  assert(!result.ok, "expected anonymous create to fail");
  if (!result.ok) {
    assert(result.code === "unauthenticated", "expected unauthenticated");
  }
  assert(client.calls.length === 0, "no table call should be made for an anonymous session");
  assert(client.storageUploadCalls.length === 0, "no storage upload should be attempted for an anonymous session");
  console.log("Test 3 (anonymous create rejected, zero cloud calls): PASS [executed]");
}

async function test4_UploadedByInjectionNotUsed() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: baseDocumentRow(), error: null });

  const maliciousInput = {
    ...baseDocumentInput(),
    uploadedBy: USER_B,
    uploaded_by: USER_B,
    owner_id: USER_B,
  } as unknown as CreateDocumentInput;

  await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    maliciousInput,
    fakeFile(),
  );

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(
    payload?.uploaded_by === USER_A,
    "uploaded_by in the insert payload must always be the session user, never caller-supplied (ADR-005)",
  );
  console.log("Test 4 (uploaded_by injection not used, session user always wins): PASS [executed]");
}

// ==== Validation (metadata) ==================================================

async function test5_ValidDocumentAccepted() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: baseDocumentRow(), error: null });

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput(),
    fakeFile(),
  );
  assert(result.ok, "expected a valid document to be accepted");
  console.log("Test 5 (valid document accepted): PASS [executed]");
}

async function test6_InvalidDocumentTypeRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput({ documentType: "not_a_real_type" as unknown as CreateDocumentInput["documentType"] }),
    fakeFile(),
  );
  assert(!result.ok && result.code === "validation_failed", "expected invalid documentType to be rejected");
  assert(client.calls.every((c) => c.op !== "insert"), "no insert should be attempted for invalid input");
  assert(client.storageUploadCalls.length === 0, "no storage upload should be attempted for invalid input");
  console.log("Test 6 (invalid documentType rejected, no upload attempted): PASS [executed]");
}

async function test7_EmptyOriginalFilenameRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput({ originalFilename: "   " }),
    fakeFile(),
  );
  assert(!result.ok && result.code === "validation_failed", "expected empty originalFilename to be rejected");
  console.log("Test 7 (empty originalFilename rejected): PASS [executed]");
}

async function test8_InvalidMimeTypeRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput({ mimeType: "application/zip" }),
    fakeFile(),
  );
  assert(!result.ok && result.code === "validation_failed", "expected disallowed mimeType to be rejected");
  console.log("Test 8 (invalid mimeType rejected): PASS [executed]");
}

async function test9_OversizedSizeBytesRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput({ sizeBytes: 20 * 1024 * 1024 }),
    fakeFile(),
  );
  assert(!result.ok && result.code === "validation_failed", "expected oversized sizeBytes to be rejected");
  console.log("Test 9 (oversized sizeBytes rejected): PASS [executed]");
}

async function test10_UnknownPayloadKeyStripped() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: baseDocumentRow(), error: null });

  const inputWithExtra = {
    ...baseDocumentInput(),
    someRandomField: "should never reach the database",
  } as unknown as CreateDocumentInput;

  await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    inputWithExtra,
    fakeFile(),
  );

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(
    !("someRandomField" in (payload ?? {})),
    "unknown payload key must never reach the database",
  );
  console.log("Test 10 (unknown payload key never reaches the database): PASS [executed]");
}

async function test11_LegacyDocumentIdRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput({ id: "local-1234567-abc" }),
    fakeFile(),
  );
  assert(
    !result.ok && result.code === "legacy_child_id_requires_mapping",
    "expected a non-UUID legacy document id to be rejected without an upload attempt",
  );
  assert(client.calls.every((c) => c.op !== "insert"), "no insert should be attempted for a legacy id");
  assert(client.storageUploadCalls.length === 0, "no storage upload should be attempted for a legacy id");
  console.log("Test 11 (legacy non-UUID document id rejected, no upload): PASS [executed]");
}

async function test12_InvalidParentIdRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput({ landRecordId: "not-a-uuid" }),
    fakeFile(),
  );
  assert(!result.ok && result.code === "invalid_parent_id", "expected non-UUID landRecordId to be rejected");
  assert(client.storageUploadCalls.length === 0, "no storage upload should be attempted for an invalid parent id");
  console.log("Test 12 (invalid landRecordId rejected, no upload): PASS [executed]");
}

// ==== Validation (file, Storage side) =======================================

async function test13_DisallowedFileTypeRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput({ mimeType: undefined }),
    fakeFile({ type: "application/zip" }),
  );
  assert(!result.ok && result.code === "validation_failed", "expected a disallowed file type to be rejected");
  assert(client.storageUploadCalls.length === 0, "no storage upload should be attempted for a disallowed file type");
  assert(client.calls.every((c) => c.op !== "insert"), "no insert should be attempted for a disallowed file type");
  console.log("Test 13 (disallowed file type rejected client-side, zero network calls): PASS [executed]");
}

async function test14_OversizedFileRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput({ sizeBytes: undefined }),
    fakeFile({ size: 11 * 1024 * 1024 }),
  );
  assert(!result.ok && result.code === "validation_failed", "expected an oversized file to be rejected");
  assert(client.storageUploadCalls.length === 0, "no storage upload should be attempted for an oversized file");
  console.log("Test 14 (oversized file rejected client-side, zero network calls): PASS [executed]");
}

// ==== Storage upload behavior ================================================

async function test15_StoragePathUsesUserIdAsFirstSegment() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: baseDocumentRow(), error: null });

  await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput(),
    fakeFile(),
  );

  assert(client.storageUploadCalls.length === 1, "expected exactly one storage upload attempt");
  const uploadCall = client.storageUploadCalls[0];
  assert(uploadCall.bucket === DOCUMENTS_STORAGE_BUCKET, "expected the upload to target the land-documents bucket");
  const firstSegment = uploadCall.path.split("/")[0];
  assert(
    firstSegment === USER_A,
    "storage path's first segment must be the uploader's own auth.uid() (storage.objects RLS requirement)",
  );
  assert(uploadCall.options?.upsert === false, "expected upsert:false on every upload, so a retry never silently overwrites");
  console.log("Test 15 (storage path first segment is auth.uid(), upsert:false): PASS [executed]");
}

async function test16_StorageUploadFailureBlocksMetadataInsert() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.storageUploadQueue.push({
    data: null,
    error: { message: "connection reset" },
  });

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput(),
    fakeFile(),
  );

  assert(!result.ok, "expected a genuine storage upload failure to fail the whole create");
  if (!result.ok) {
    assert(result.code === "database_error", "expected database_error for a storage upload failure");
  }
  assert(client.calls.every((c) => c.op !== "insert"), "no metadata row insert should be attempted after a real upload failure");
  console.log("Test 16 (storage upload failure blocks the metadata insert): PASS [executed]");
}

async function test17_StorageAlreadyExistsToleratedAsRetry() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.storageUploadQueue.push({
    data: null,
    error: { message: "The resource already exists", statusCode: "409" },
  });
  client.insertQueue.push({ data: baseDocumentRow(), error: null });

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput(),
    fakeFile(),
  );

  assert(result.ok, "expected a 'resource already exists' storage response to be tolerated, not treated as a failure");
  const insertCall = client.calls.find((c) => c.op === "insert");
  assert(!!insertCall, "expected the metadata insert to still be attempted after a tolerated 'already exists' upload");
  console.log("Test 17 (storage 'already exists' tolerated as a retry, metadata insert still attempted): PASS [executed]");
}

// ==== Idempotency / duplicate resolution (metadata row) ======================

async function test18_RetryIdenticalPayloadSucceeds() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: baseDocumentRow(), error: null });

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput(),
    fakeFile(),
  );

  assert(result.ok, "expected identical-payload retry to be treated as verified success");
  if (result.ok) {
    assert(result.state === "documents_synced", "expected documents_synced on verified retry");
  }
  console.log("Test 18 (retry, identical payload, verified success): PASS [executed]");
}

async function test19_RetryDifferentPayloadConflicts() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: baseDocumentRow({ document_type: "site_photo" }), error: null });

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput({ documentType: "title_deed" }),
    fakeFile(),
  );

  assert(!result.ok, "expected different-payload retry to be a conflict, not a false success");
  if (!result.ok) {
    assert(result.code === "duplicate_conflict", "expected duplicate_conflict");
  }
  console.log("Test 19 (retry, different payload, duplicate_conflict): PASS [executed]");
}

async function test20_InaccessibleDuplicateNotTreatedAsSuccess() {
  const client = new FakeSupabaseClient();
  client.userId = USER_B;
  client.insertQueue.push({
    data: null,
    error: { message: "duplicate key value violates unique constraint", code: "23505" },
  });
  client.selectByIdQueue.push({ data: null, error: null });

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput(),
    fakeFile(),
  );

  assert(!result.ok, "expected an inaccessible duplicate to never be reported as success");
  if (!result.ok) {
    assert(result.code === "not_found_or_forbidden", "expected not_found_or_forbidden (no ownership leak)");
  }
  console.log("Test 20 (inaccessible duplicate is not success, no ownership leak): PASS [executed]");
}

// ==== Cache isolation (standalone documents cache) ==========================

async function test21_SuccessfulCreateUpdatesOnlyCreatingUsersCache() {
  await withFakeLocalStorage(async () => {
    writeDocumentsCache(USER_A, [], "2026-01-01T00:00:00.000Z");
    writeDocumentsCache(USER_B, [], "2026-01-01T00:00:00.000Z");

    const client = new FakeSupabaseClient();
    client.userId = USER_A;
    client.insertQueue.push({ data: baseDocumentRow(), error: null });

    await createCloudDocument(
      client as unknown as Parameters<typeof createCloudDocument>[0],
      baseDocumentInput(),
      fakeFile(),
    );

    const cacheA = readDocumentsCache(USER_A);
    const cacheB = readDocumentsCache(USER_B);
    assert(
      cacheA?.documents.some((d) => d.id === DOCUMENT_ID),
      "User A's cache must contain the newly created document",
    );
    assert(
      !cacheB?.documents.some((d) => d.id === DOCUMENT_ID),
      "User B's cache must never be touched by User A's write",
    );
  });
  console.log("Test 21 (successful create changes only the creating user's cache): PASS [executed]");
}

async function test22_CloudFailureKeepsOldCache() {
  await withFakeLocalStorage(async () => {
    writeDocumentsCache(USER_A, [], "2026-01-01T00:00:00.000Z");

    const client = new FakeSupabaseClient();
    client.userId = USER_A;
    client.insertQueue.push({
      data: null,
      error: { message: "connection reset", code: "08006" },
    });

    await createCloudDocument(
      client as unknown as Parameters<typeof createCloudDocument>[0],
      baseDocumentInput(),
      fakeFile(),
    );

    const cache = readDocumentsCache(USER_A);
    assert(cache?.documents.length === 0, "a failed cloud create must leave the existing cache unchanged");
  });
  console.log("Test 22 (cloud failure keeps old cache unchanged): PASS [executed]");
}

async function test23_ConflictDoesNotChangeCache() {
  await withFakeLocalStorage(async () => {
    writeDocumentsCache(USER_A, [], "2026-01-01T00:00:00.000Z");

    const client = new FakeSupabaseClient();
    client.userId = USER_A;
    client.insertQueue.push({
      data: null,
      error: { message: "duplicate key value violates unique constraint", code: "23505" },
    });
    client.selectByIdQueue.push({ data: baseDocumentRow({ document_type: "site_photo" }), error: null });

    await createCloudDocument(
      client as unknown as Parameters<typeof createCloudDocument>[0],
      baseDocumentInput(),
      fakeFile(),
    );

    const cache = readDocumentsCache(USER_A);
    assert(cache?.documents.length === 0, "a duplicate_conflict must never touch the cache");
  });
  console.log("Test 23 (duplicate conflict does not change cache): PASS [executed]");
}

// ==== Sync-state / scope invariants =========================================

async function test24_DocumentSuccessProducesDocumentsSynced() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: baseDocumentRow(), error: null });

  const result = await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput(),
    fakeFile(),
  );
  assert(result.ok && result.state === "documents_synced", "document success must report documents_synced");
  console.log("Test 24 (document success produces documents_synced): PASS [executed]");
}

async function test25_NoWriteToAnyOtherTable() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.insertQueue.push({ data: baseDocumentRow(), error: null });

  await createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    baseDocumentInput(),
    fakeFile(),
  );

  const nonDocumentWrites = client.calls.filter(
    (c) => c.table !== "documents" && (c.op === "insert" || c.op === "update" || c.op === "delete"),
  );
  assert(nonDocumentWrites.length === 0, "no write to any table other than documents may occur");
  console.log("Test 25 (no write to any other table): PASS [executed]");
}

// ==== Direct validation/mapping sanity (no coordinator involved) ===========

async function test26_ValidateCreateDocumentInputDirectly() {
  const valid = validateCreateDocumentInput(baseDocumentInput());
  assert(valid.ok, "a well-formed CreateDocumentInput must pass validateCreateDocumentInput directly");

  const invalid = validateCreateDocumentInput(
    baseDocumentInput({ documentType: "bogus" as unknown as CreateDocumentInput["documentType"] }),
  );
  assert(!invalid.ok, "an invalid documentType must fail validateCreateDocumentInput directly");
  console.log("Test 26 (validateCreateDocumentInput direct sanity check): PASS [executed]");
}

async function test27_MapCloudDocumentRoundTrip() {
  const row = baseDocumentRow();
  const mapped = mapCloudDocument(row);
  assert(mapped.id === row.id, "mapCloudDocument must preserve id");
  assert(mapped.documentType === row.document_type, "mapCloudDocument must preserve documentType");
  assert(mapped.storagePath === row.storage_path, "mapCloudDocument must preserve storagePath");
  console.log("Test 27 (mapCloudDocument round-trip sanity check): PASS [executed]");
}

async function test28_IsStableCloudIdSanity() {
  assert(isStableCloudId(DOCUMENT_ID), "a well-formed UUID must be recognized as a stable cloud id");
  assert(!isStableCloudId("local-123-abc"), "a legacy local id must not be recognized as a stable cloud id");
  console.log("Test 28 (isStableCloudId sanity check, pre-existing helper reused unmodified): PASS [executed]");
}

// ---- Runner -----------------------------------------------------------------

async function main() {
  await test1_UserACreateDocument();
  await test2_UserBRejectedOnParentUserA();
  await test3_AnonymousCreateRejected();
  await test4_UploadedByInjectionNotUsed();
  await test5_ValidDocumentAccepted();
  await test6_InvalidDocumentTypeRejected();
  await test7_EmptyOriginalFilenameRejected();
  await test8_InvalidMimeTypeRejected();
  await test9_OversizedSizeBytesRejected();
  await test10_UnknownPayloadKeyStripped();
  await test11_LegacyDocumentIdRejected();
  await test12_InvalidParentIdRejected();
  await test13_DisallowedFileTypeRejected();
  await test14_OversizedFileRejected();
  await test15_StoragePathUsesUserIdAsFirstSegment();
  await test16_StorageUploadFailureBlocksMetadataInsert();
  await test17_StorageAlreadyExistsToleratedAsRetry();
  await test18_RetryIdenticalPayloadSucceeds();
  await test19_RetryDifferentPayloadConflicts();
  await test20_InaccessibleDuplicateNotTreatedAsSuccess();
  await test21_SuccessfulCreateUpdatesOnlyCreatingUsersCache();
  await test22_CloudFailureKeepsOldCache();
  await test23_ConflictDoesNotChangeCache();
  await test24_DocumentSuccessProducesDocumentsSynced();
  await test25_NoWriteToAnyOtherTable();
  await test26_ValidateCreateDocumentInputDirectly();
  await test27_MapCloudDocumentRoundTrip();
  await test28_IsStableCloudIdSanity();

  console.log("\nSprint documents cloud-write (create-only) QA: ALL PASS (28/28)");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
