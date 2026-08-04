// Sprint documents-cloud-write QA script for public.documents + the
// land-documents Storage bucket cloud create. Run via:
//   npx tsc -p src/lib/land-records/documents-write.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/documents-write.qa.js
// (same convention as points-write.qa.ts)
//
// Uses a fake Supabase client (no network, no dependency added) that
// mocks both `.from(table)` (Postgres) and `.storage.from(bucket)`
// (Storage) calls. Does not touch local-lots.ts, land-records.qa.ts,
// land-records-write.qa.ts, geometry-write.qa.ts, or points-write.qa.ts
// -- those are re-run unchanged as a separate regression step, not
// modified by this sprint.
//
// CREATE-ONLY: there is no updateCloudDocument/deleteCloudDocument to
// test, and this file asserts that no such export exists.
//
// Sprint documents-follow-up-cache-only: Tests 25-28 added, mirroring
// points-write.qa.ts's Tests 24-27 (successful/failed/unlinked/conflict
// cache-update cases), now that createCloudDocument actually calls
// upsertCachedDocument (documents-cache.ts).
//
// Sprint production-write-gate-phase2e-documents (ADR-024) added a second
// gate function, isCloudWriteEnabledForDocumentsInProduction(), to this
// module's one entry point (createCloudDocument). This script's env is
// pinned to sabahlot-dev at module load (below) for its whole run, same
// as geometry-write.qa.ts/points-write.qa.ts/parties-write.qa.ts, so it
// only re-proves the pre-existing dev branch is unchanged (regression) --
// the new production branch is covered instead by feature-gate.qa.ts
// (Tests 30-33). Not duplicated here for the same reason as the other
// coordinator QA files: documents-ui-sync.ts (documents' UI wiring) has no
// gate check of its own and no pre-existing per-test env-override pattern
// to extend.

import {
  createCloudDocument,
  isStableCloudId,
  mapCloudDocument,
  readCloudCache,
  validateCreateDocumentInput,
  writeCloudCache,
  type ChildSyncState,
  type CloudDocument,
  type CloudDocumentRow,
  type CloudLandRecord,
  type CreateDocumentInput,
} from "./index";

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

// ---- Static assertions: create-only scope ----------------------------------

import * as LandRecordsIndex from "./index";

assert(
  !("updateCloudDocument" in LandRecordsIndex),
  "updateCloudDocument must not exist this sprint (no updated_at column on public.documents)",
);
assert(
  !("deleteCloudDocument" in LandRecordsIndex),
  "deleteCloudDocument must not exist this sprint (delete deferred, mirroring ADR-013)",
);
console.log("Test 0 (create-only scope: no updateCloudDocument/deleteCloudDocument exported): PASS [static]");

// mimeType/sizeBytes must never be caller-writable fields on
// CreateDocumentInput -- a structural check, not a runtime one: this
// only compiles if the type truly has no such properties.
type AssertNoMimeOrSize = "mimeType" extends keyof CreateDocumentInput
  ? never
  : "sizeBytes" extends keyof CreateDocumentInput
    ? never
    : true;
const _structuralCheck: AssertNoMimeOrSize = true;
void _structuralCheck;
console.log("Test 0b (mimeType/sizeBytes are not writable CreateDocumentInput fields): PASS [static]");

// full_record_synced must never exist as a reachable ChildSyncState value
// (ADR-010) -- this only compiles if "full_record_synced" is truly not a
// member of the union.
type AssertNoFullRecordSynced = "full_record_synced" extends ChildSyncState ? never : true;
const _noFullRecordSynced: AssertNoFullRecordSynced = true;
void _noFullRecordSynced;
console.log("Test 0c (full_record_synced is not a reachable ChildSyncState, ADR-010): PASS [static]");

// ---- Fake Supabase client (Postgres + Storage) -----------------------------

type TableName = "documents" | "land_records" | "land_record_geometries" | "land_points" | "land_parties";

interface FakeResponse {
  data: unknown;
  error: { message: string; code?: string } | null;
}

interface FakeStorageError {
  message: string;
  statusCode?: string;
}

interface FakeUploadResponse {
  data: unknown;
  error: FakeStorageError | null;
}

interface FakeSignedUrlResponse {
  data: { signedUrl: string } | null;
  error: FakeStorageError | null;
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
  storageCalls: Array<{ op: string; bucket: string; path: string; options?: unknown }> = [];
  insertQueue: FakeResponse[] = [];
  selectByIdQueue: FakeResponse[] = [];
  listQueue: FakeResponse[] = [];
  storageUploadQueue: FakeUploadResponse[] = [];
  storageSignedUrlQueue: FakeSignedUrlResponse[] = [];
  userId: string | null = null;

  auth = {
    getUser: async () => ({
      data: { user: this.userId ? { id: this.userId } : null },
      error: null,
    }),
  };

  storage = {
    from: (bucket: string) => ({
      upload: async (path: string, _fileBody: unknown, options?: unknown) => {
        this.storageCalls.push({ op: "upload", bucket, path, options });
        return (
          this.storageUploadQueue.shift() ?? {
            data: null,
            error: { message: "no upload response configured" },
          }
        );
      },
      createSignedUrl: async (path: string, expiresIn: number) => {
        this.storageCalls.push({ op: "createSignedUrl", bucket, path, options: { expiresIn } });
        return (
          this.storageSignedUrlQueue.shift() ?? {
            data: null,
            error: { message: "no signed url response configured" },
          }
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
        throw new Error(`update() must never be called on ${table} (documents are create-only)`);
      },
      select: () => {
        this.calls.push({ op: "select", table });
        return new FakeChain(this, table, "select");
      },
      delete: (): never => {
        throw new Error(`delete() must never be called on ${table} (delete is deferred)`);
      },
    };
  }
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "99999999-9999-4999-8999-999999999999";
const LAND_RECORD_ID = "22222222-2222-4222-8222-222222222222";
const DOCUMENT_ID = "33333333-3333-4333-8333-333333333333";

function baseDocumentRow(overrides: Partial<CloudDocumentRow> = {}): CloudDocumentRow {
  return {
    id: DOCUMENT_ID,
    land_record_id: LAND_RECORD_ID,
    uploaded_by: USER_A,
    document_type: "site_photo",
    storage_bucket: "land-documents",
    storage_path: `${USER_A}/${DOCUMENT_ID}`,
    original_filename: "boundary-corner-1.jpg",
    mime_type: "image/jpeg",
    size_bytes: 2048,
    is_sensitive: true,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseDocumentInput(overrides: Partial<CreateDocumentInput> = {}): CreateDocumentInput {
  return {
    id: DOCUMENT_ID,
    landRecordId: LAND_RECORD_ID,
    documentType: "site_photo",
    originalFilename: "boundary-corner-1.jpg",
    ...overrides,
  };
}

function fakeFile(overrides: { size?: number; type?: string } = {}): Blob {
  const size = overrides.size ?? 2048;
  return new Blob([new Uint8Array(size)], { type: overrides.type ?? "image/jpeg" });
}

async function call(
  client: FakeSupabaseClient,
  input: CreateDocumentInput,
  file: Blob,
): ReturnType<typeof createCloudDocument> {
  return createCloudDocument(
    client as unknown as Parameters<typeof createCloudDocument>[0],
    input,
    file,
  );
}

// ==== Authentication, ownership, and the two-phase write ====================

async function test1_FreshUploadSucceeds() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.storageUploadQueue.push({ data: { path: `${USER_A}/${DOCUMENT_ID}` }, error: null });
  client.insertQueue.push({ data: baseDocumentRow(), error: null });

  const result = await call(client, baseDocumentInput(), fakeFile());

  assert(result.ok, "expected a fresh upload + insert to succeed");
  if (result.ok) {
    assert(result.state === "documents_synced", "expected documents_synced state");
  }
  const uploadCall = client.storageCalls.find((c) => c.op === "upload");
  assert(uploadCall?.bucket === "land-documents", "must upload to the land-documents bucket");
  assert(uploadCall?.path === `${USER_A}/${DOCUMENT_ID}`, "path must be <userId>/<documentId>");
  console.log("Test 1 (fresh upload + insert succeeds): PASS [executed]");
}

async function test2_UnlinkedDocumentOwnedByUploadedBy() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.storageUploadQueue.push({ data: { path: `${USER_A}/${DOCUMENT_ID}` }, error: null });
  client.insertQueue.push({ data: baseDocumentRow({ land_record_id: null }), error: null });

  const result = await call(client, baseDocumentInput({ landRecordId: null }), fakeFile());

  assert(result.ok, "expected unlinked document create to succeed");
  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(payload?.land_record_id === null, "land_record_id must be null for an unlinked document");
  assert(payload?.uploaded_by === USER_A, "uploaded_by must be set for an unlinked document (RLS requires it)");
  console.log("Test 2 (unlinked document owned via uploaded_by): PASS [executed]");
}

async function test3_AnonymousCreateRejected() {
  const client = new FakeSupabaseClient();
  client.userId = null;

  const result = await call(client, baseDocumentInput(), fakeFile());

  assert(!result.ok, "expected anonymous create to fail");
  if (!result.ok) {
    assert(result.code === "unauthenticated", "expected unauthenticated");
  }
  assert(client.storageCalls.length === 0, "no storage call should be attempted without a session");
  assert(client.calls.every((c) => c.op !== "insert"), "no insert should be attempted without a session");
  console.log("Test 3 (anonymous create rejected, no session): PASS [executed]");
}

async function test4_UploadedByInjectionNotUsed() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.storageUploadQueue.push({ data: { path: `${USER_A}/${DOCUMENT_ID}` }, error: null });
  client.insertQueue.push({ data: baseDocumentRow(), error: null });

  const maliciousInput = {
    ...baseDocumentInput(),
    uploadedBy: USER_B,
    uploaded_by: USER_B,
    owner_id: USER_B,
  } as unknown as CreateDocumentInput;

  await call(client, maliciousInput, fakeFile());

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(
    payload?.uploaded_by === USER_A,
    "uploaded_by in the insert payload must always be the session user, never caller-supplied",
  );
  console.log("Test 4 (uploaded_by injection not used, session user always wins): PASS [executed]");
}

// ==== mime/size derived from the actual file, not caller-declared ============

async function test5_MimeAndSizeDerivedFromFile() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.storageUploadQueue.push({ data: { path: `${USER_A}/${DOCUMENT_ID}` }, error: null });
  client.insertQueue.push({ data: baseDocumentRow({ mime_type: "application/pdf", size_bytes: 4096 }), error: null });

  await call(client, baseDocumentInput(), fakeFile({ size: 4096, type: "application/pdf" }));

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(payload?.mime_type === "application/pdf", "mime_type must be derived from the file's own .type");
  assert(payload?.size_bytes === 4096, "size_bytes must be derived from the file's own .size");
  console.log("Test 5 (mime_type/size_bytes derived from the actual file, not a caller field): PASS [executed]");
}

async function test6_DisallowedMimeTypeRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await call(client, baseDocumentInput(), fakeFile({ type: "application/zip" }));

  assert(!result.ok && result.code === "validation_failed", "expected a disallowed mime type to be rejected");
  assert(client.storageCalls.length === 0, "no upload should be attempted for a disallowed mime type");
  console.log("Test 6 (disallowed mime type rejected before any upload attempt): PASS [executed]");
}

async function test7_OversizedFileRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await call(client, baseDocumentInput(), fakeFile({ size: 10 * 1024 * 1024 + 1 }));

  assert(!result.ok && result.code === "validation_failed", "expected an oversized file to be rejected");
  assert(client.storageCalls.length === 0, "no upload should be attempted for an oversized file");
  console.log("Test 7 (oversized file rejected before any upload attempt): PASS [executed]");
}

// ==== Two-phase retry resolution =============================================

async function test8_RetrySameContentAlreadyExistsMatchingRow() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.storageUploadQueue.push({
    data: null,
    error: { message: "The resource already exists", statusCode: "409" },
  });
  client.selectByIdQueue.push({ data: baseDocumentRow(), error: null });

  const result = await call(client, baseDocumentInput(), fakeFile());

  assert(result.ok, "expected a same-content retry to be verified as a safe idempotent success");
  if (result.ok) {
    assert(result.state === "documents_synced", "expected documents_synced on verified retry");
  }
  assert(client.calls.every((c) => c.op !== "insert"), "a verified matching retry must never re-insert");
  console.log("Test 8 (retry, storage already-exists + matching row -> verified documents_synced, no re-insert): PASS [executed]");
}

async function test9_RetryDifferentContentAlreadyExistsConflict() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.storageUploadQueue.push({
    data: null,
    error: { message: "The resource already exists", statusCode: "409" },
  });
  client.selectByIdQueue.push({ data: baseDocumentRow({ original_filename: "different-name.jpg" }), error: null });

  const result = await call(client, baseDocumentInput(), fakeFile());

  assert(!result.ok, "expected a different-content retry to be rejected, not silently applied");
  if (!result.ok) {
    assert(result.code === "duplicate_conflict", "expected duplicate_conflict");
  }
  assert(client.calls.every((c) => c.op !== "insert"), "a conflicting retry must never insert/overwrite");
  console.log("Test 9 (retry, storage already-exists + different content -> duplicate_conflict, row untouched): PASS [executed]");
}

async function test10_OrphanedUploadResumesInsert() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.storageUploadQueue.push({
    data: null,
    error: { message: "The resource already exists", statusCode: "409" },
  });
  // No existing row: a previous attempt's upload succeeded but its
  // insert never landed. The resume path must re-upload (upsert:true)
  // THIS call's file before inserting, so a second upload response is
  // needed here.
  client.selectByIdQueue.push({ data: null, error: null });
  client.storageUploadQueue.push({ data: { path: `${USER_A}/${DOCUMENT_ID}` }, error: null });
  client.insertQueue.push({ data: baseDocumentRow(), error: null });

  const result = await call(client, baseDocumentInput(), fakeFile());

  assert(result.ok, "expected an orphaned-upload retry to resume by re-uploading then inserting the metadata row");
  if (result.ok) {
    assert(result.state === "documents_synced", "expected documents_synced once the resume insert succeeds");
  }
  const uploadCalls = client.storageCalls.filter((c) => c.op === "upload");
  assert(uploadCalls.length === 2, "expected exactly two upload attempts: the initial one, then the resume re-upload");
  const resumeUploadOptions = uploadCalls[1]?.options as Record<string, unknown> | undefined;
  assert(resumeUploadOptions?.upsert === true, "the resume re-upload must use upsert:true, unlike the initial upsert:false attempt");
  const insertCall = client.calls.find((c) => c.op === "insert");
  assert(insertCall !== undefined, "the resume path must actually attempt the insert");
  console.log("Test 10 (storage object exists but no metadata row -> re-uploads with upsert:true, then resumes by inserting now): PASS [executed]");
}

async function test10b_OrphanedUploadResumeReuploadFails() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.storageUploadQueue.push({
    data: null,
    error: { message: "The resource already exists", statusCode: "409" },
  });
  client.selectByIdQueue.push({ data: null, error: null });
  // The resume re-upload itself fails (e.g. network drop mid-retry).
  client.storageUploadQueue.push({ data: null, error: { message: "network timeout" } });

  const result = await call(client, baseDocumentInput(), fakeFile());

  assert(!result.ok && result.code === "database_error", "expected a failed resume re-upload to surface as database_error");
  assert(client.calls.every((c) => c.op !== "insert"), "no metadata may ever be inserted if the resume re-upload itself failed");
  console.log("Test 10b (resume re-upload itself fails -> database_error, no metadata inserted): PASS [executed]");
}

async function test11_InsertLevelDuplicateResolvedSameWay() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.storageUploadQueue.push({ data: { path: `${USER_A}/${DOCUMENT_ID}` }, error: null });
  client.insertQueue.push({ data: null, error: { message: "duplicate key value", code: "23505" } });
  client.selectByIdQueue.push({ data: baseDocumentRow(), error: null });

  const result = await call(client, baseDocumentInput(), fakeFile());

  assert(result.ok, "expected a 23505 on insert (fresh upload, concurrent race) to resolve via existing-row comparison");
  if (result.ok) {
    assert(result.state === "documents_synced", "expected documents_synced");
  }
  console.log("Test 11 (insert-level 23505 despite a fresh upload -> resolved via existing-row comparison): PASS [executed]");
}

async function test12_GenericUploadFailureStopsImmediately() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.storageUploadQueue.push({ data: null, error: { message: "network timeout" } });

  const result = await call(client, baseDocumentInput(), fakeFile());

  assert(!result.ok && result.code === "database_error", "expected a generic upload failure to surface as database_error");
  assert(client.calls.every((c) => c.op !== "insert"), "no insert may ever be attempted for a file that didn't actually upload");
  console.log("Test 12 (generic upload failure stops immediately, no insert attempted): PASS [executed]");
}

async function test13_DuplicateNotAccessibleToCurrentUser() {
  const client = new FakeSupabaseClient();
  client.userId = USER_B;
  client.storageUploadQueue.push({
    data: null,
    error: { message: "The resource already exists", statusCode: "409" },
  });
  // RLS hides the row entirely from a user who cannot access it.
  client.selectByIdQueue.push({ data: null, error: null });
  // The resume re-upload itself succeeds (it's USER_B's own path/object);
  // it's the resuming INSERT below that RLS denies.
  client.storageUploadQueue.push({ data: { path: `${USER_B}/${DOCUMENT_ID}` }, error: null });
  client.insertQueue.push({
    data: null,
    error: { message: "new row violates row-level security policy", code: "42501" },
  });

  const result = await call(client, baseDocumentInput({ landRecordId: LAND_RECORD_ID }), fakeFile());

  assert(!result.ok, "expected the resume-insert to fail when RLS denies the caller");
  if (!result.ok) {
    assert(result.code === "database_error", "expected database_error when the resume insert itself is denied by RLS");
  }
  console.log("Test 13 (resume insert denied by RLS surfaces as database_error, never a false success): PASS [executed]");
}

// ==== Validation ==============================================================

async function test14_LegacyNonUuidIdRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await call(client, baseDocumentInput({ id: "local-123-abc" }), fakeFile());

  assert(!result.ok && result.code === "legacy_child_id_requires_mapping", "expected a legacy non-UUID id to be rejected");
  assert(client.storageCalls.length === 0, "no upload should be attempted for a legacy id");
  console.log("Test 14 (legacy non-UUID document id rejected, never uploaded): PASS [executed]");
}

async function test15_InvalidParentIdRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await call(client, baseDocumentInput({ landRecordId: "not-a-uuid" }), fakeFile());

  assert(!result.ok && result.code === "invalid_parent_id", "expected an invalid landRecordId to be rejected");
  console.log("Test 15 (invalid landRecordId rejected): PASS [executed]");
}

async function test16_InvalidDocumentTypeRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await call(
    client,
    baseDocumentInput({ documentType: "not_a_real_type" as unknown as CreateDocumentInput["documentType"] }),
    fakeFile(),
  );

  assert(!result.ok && result.code === "validation_failed", "expected invalid documentType to be rejected");
  console.log("Test 16 (invalid documentType rejected): PASS [executed]");
}

async function test17_EmptyFilenameRejected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;

  const result = await call(client, baseDocumentInput({ originalFilename: "   " }), fakeFile());

  assert(!result.ok && result.code === "validation_failed", "expected a blank originalFilename to be rejected");
  console.log("Test 17 (blank originalFilename rejected): PASS [executed]");
}

async function test18_ValidateCreateDocumentInputDirectSanityCheck() {
  const result = validateCreateDocumentInput(baseDocumentInput());
  assert(result.ok, "expected the base document input to validate directly");
  console.log("Test 18 (validateCreateDocumentInput direct sanity check): PASS [executed]");
}

// ==== is_sensitive default ====================================================

async function test19_IsSensitiveDefaultsTrue() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.storageUploadQueue.push({ data: { path: `${USER_A}/${DOCUMENT_ID}` }, error: null });
  client.insertQueue.push({ data: baseDocumentRow(), error: null });

  await call(client, baseDocumentInput(), fakeFile());

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(payload?.is_sensitive === true, "is_sensitive must default to true when the caller omits it");
  console.log("Test 19 (is_sensitive defaults to true when omitted): PASS [executed]");
}

async function test20_IsSensitiveExplicitFalseRespected() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.storageUploadQueue.push({ data: { path: `${USER_A}/${DOCUMENT_ID}` }, error: null });
  client.insertQueue.push({ data: baseDocumentRow({ is_sensitive: false }), error: null });

  await call(client, baseDocumentInput({ isSensitive: false }), fakeFile());

  const insertCall = client.calls.find((c) => c.op === "insert");
  const payload = insertCall?.payload as Record<string, unknown> | undefined;
  assert(payload?.is_sensitive === false, "an explicit isSensitive: false must be respected, not overridden to true");
  console.log("Test 20 (explicit isSensitive: false respected): PASS [executed]");
}

// ==== Scope / isolation =======================================================

async function test21_NoWriteToAnyOtherTable() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.storageUploadQueue.push({ data: { path: `${USER_A}/${DOCUMENT_ID}` }, error: null });
  client.insertQueue.push({ data: baseDocumentRow(), error: null });

  await call(client, baseDocumentInput(), fakeFile());

  assert(
    client.calls.every((c) => c.table === "documents"),
    "no write to land_records/land_record_geometries/land_points/land_parties may occur",
  );
  assert(
    client.storageCalls.every((c) => c.bucket === "land-documents"),
    "no Storage call to any bucket other than land-documents may occur",
  );
  console.log("Test 21 (no write to any other table or bucket): PASS [executed]");
}

async function test22_NeverReturnsBroaderSyncState() {
  const client = new FakeSupabaseClient();
  client.userId = USER_A;
  client.storageUploadQueue.push({ data: { path: `${USER_A}/${DOCUMENT_ID}` }, error: null });
  client.insertQueue.push({ data: baseDocumentRow(), error: null });

  const result = await call(client, baseDocumentInput(), fakeFile());

  assert(result.ok, "expected success for this state check");
  if (result.ok) {
    assert(
      !(["record_synced", "core_record_synced", "geometry_synced", "points_synced", "parties_synced"] as string[]).includes(
        result.state,
      ),
      "a document success must never claim a broader sync state it did not itself verify",
    );
  }
  console.log("Test 22 (document success never claims a broader sync state): PASS [executed]");
}

async function test23_MapCloudDocumentRoundTrip() {
  const domain: CloudDocument = mapCloudDocument(baseDocumentRow());
  assert(domain.id === DOCUMENT_ID, "id must round-trip");
  assert(domain.documentType === "site_photo", "documentType must round-trip");
  assert(domain.originalFilename === "boundary-corner-1.jpg", "originalFilename must round-trip");
  assert(!("storageBucket" in domain) && !("storagePath" in domain), "CloudDocument must never surface a raw storage path");
  console.log("Test 23 (mapCloudDocument round-trip, never surfaces a raw storage path): PASS [executed]");
}

async function test24_IsStableCloudIdSanityCheck() {
  assert(isStableCloudId(DOCUMENT_ID), "expected a v4 UUID to be recognized as a stable cloud id");
  assert(!isStableCloudId("local-123-abc"), "expected a legacy id to be rejected");
  console.log("Test 24 (isStableCloudId sanity check, pre-existing helper reused unmodified): PASS [executed]");
}

// ==== Cache isolation (documents-follow-up-cache-only) ========================

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
    documents: [],
    ownerName: null,
    originalApplicantStatus: "",
    ...overrides,
  };
}

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

async function test25_SuccessfulCreateUpdatesOnlyCreatingUsersCache() {
  await withCloudCacheStorage(async () => {
    writeCloudCache(USER_A, [baseCachedRecord()], "2026-01-01T00:00:00.000Z");
    writeCloudCache(
      USER_B,
      [baseCachedRecord({ id: "44444444-4444-4444-8444-444444444444" })],
      "2026-01-01T00:00:00.000Z",
    );

    const client = new FakeSupabaseClient();
    client.userId = USER_A;
    client.storageUploadQueue.push({ data: { path: `${USER_A}/${DOCUMENT_ID}` }, error: null });
    client.insertQueue.push({ data: baseDocumentRow(), error: null });

    await call(client, baseDocumentInput(), fakeFile());

    const cacheA = readCloudCache(USER_A);
    const cacheB = readCloudCache(USER_B);
    assert(
      cacheA?.records[0]?.documents.some((d) => d.id === DOCUMENT_ID),
      "User A's cache must contain the newly created document",
    );
    assert(
      !cacheB?.records[0]?.documents.some((d) => d.id === DOCUMENT_ID),
      "User B's cache must never be touched by User A's write",
    );
  });
  console.log("Test 25 (successful create changes only the creating user's cache): PASS [executed]");
}

async function test26_CloudFailureKeepsOldCache() {
  await withCloudCacheStorage(async () => {
    writeCloudCache(USER_A, [baseCachedRecord()], "2026-01-01T00:00:00.000Z");

    const client = new FakeSupabaseClient();
    client.userId = USER_A;
    client.storageUploadQueue.push({ data: null, error: { message: "network timeout" } });

    await call(client, baseDocumentInput(), fakeFile());

    const cache = readCloudCache(USER_A);
    assert(
      cache?.records[0]?.documents.length === 0,
      "a failed cloud create must leave the existing cache unchanged",
    );
  });
  console.log("Test 26 (cloud failure keeps old cache unchanged): PASS [executed]");
}

async function test27_UnlinkedDocumentCacheIsNoOp() {
  await withCloudCacheStorage(async () => {
    writeCloudCache(USER_A, [baseCachedRecord()], "2026-01-01T00:00:00.000Z");

    const client = new FakeSupabaseClient();
    client.userId = USER_A;
    client.storageUploadQueue.push({ data: { path: `${USER_A}/${DOCUMENT_ID}` }, error: null });
    client.insertQueue.push({ data: baseDocumentRow({ land_record_id: null }), error: null });

    const result = await call(client, baseDocumentInput({ landRecordId: null }), fakeFile());

    assert(result.ok, "expected the unlinked create itself to still succeed");
    const cache = readCloudCache(USER_A);
    assert(
      cache?.records[0]?.documents.length === 0,
      "an unlinked document has no cached parent to attach to -- this must be a documented no-op, not a crash",
    );
  });
  console.log("Test 27 (unlinked document cache update is a documented no-op): PASS [executed]");
}

async function test28_ConflictDoesNotChangeCache() {
  await withCloudCacheStorage(async () => {
    writeCloudCache(USER_A, [baseCachedRecord()], "2026-01-01T00:00:00.000Z");

    const client = new FakeSupabaseClient();
    client.userId = USER_A;
    client.storageUploadQueue.push({
      data: null,
      error: { message: "The resource already exists", statusCode: "409" },
    });
    client.selectByIdQueue.push({ data: baseDocumentRow({ original_filename: "different-name.jpg" }), error: null });

    await call(client, baseDocumentInput(), fakeFile());

    const cache = readCloudCache(USER_A);
    assert(cache?.records[0]?.documents.length === 0, "a duplicate_conflict must never touch the cache");
  });
  console.log("Test 28 (duplicate conflict does not change cache): PASS [executed]");
}

async function main() {
  await test1_FreshUploadSucceeds();
  await test2_UnlinkedDocumentOwnedByUploadedBy();
  await test3_AnonymousCreateRejected();
  await test4_UploadedByInjectionNotUsed();
  await test5_MimeAndSizeDerivedFromFile();
  await test6_DisallowedMimeTypeRejected();
  await test7_OversizedFileRejected();
  await test8_RetrySameContentAlreadyExistsMatchingRow();
  await test9_RetryDifferentContentAlreadyExistsConflict();
  await test10_OrphanedUploadResumesInsert();
  await test10b_OrphanedUploadResumeReuploadFails();
  await test11_InsertLevelDuplicateResolvedSameWay();
  await test12_GenericUploadFailureStopsImmediately();
  await test13_DuplicateNotAccessibleToCurrentUser();
  await test14_LegacyNonUuidIdRejected();
  await test15_InvalidParentIdRejected();
  await test16_InvalidDocumentTypeRejected();
  await test17_EmptyFilenameRejected();
  await test18_ValidateCreateDocumentInputDirectSanityCheck();
  await test19_IsSensitiveDefaultsTrue();
  await test20_IsSensitiveExplicitFalseRespected();
  await test21_NoWriteToAnyOtherTable();
  await test22_NeverReturnsBroaderSyncState();
  await test23_MapCloudDocumentRoundTrip();
  await test24_IsStableCloudIdSanityCheck();
  await test25_SuccessfulCreateUpdatesOnlyCreatingUsersCache();
  await test26_CloudFailureKeepsOldCache();
  await test27_UnlinkedDocumentCacheIsNoOp();
  await test28_ConflictDoesNotChangeCache();

  console.log("\nSprint documents-cloud-write QA: ALL PASS");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
