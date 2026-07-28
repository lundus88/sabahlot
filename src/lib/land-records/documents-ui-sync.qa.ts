// Sprint documents cloud write UI wiring QA script for
// documents-ui-sync.ts. Run via:
//   npx tsc -p src/lib/land-records/documents-ui-sync.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/documents-ui-sync.qa.js
// (same convention as parties-ui-sync.qa.ts / points-ui-sync.qa.ts)

import * as fs from "node:fs";
import * as path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  syncPendingDocumentsToCloud,
  type PendingDocumentInput,
} from "./documents-ui-sync";
import type { CloudDocument } from "./documents-validation";
import type { ParentSyncResult } from "./parent-ui-sync";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

const PARENT_ID = "11111111-1111-4111-8111-111111111111";
const DOC_ID = "33333333-3333-4333-8333-333333333333";

function parentRecord(): NonNullable<ParentSyncResult["record"]> {
  return {
    id: PARENT_ID,
    recordName: "QA record",
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

function fakeFile(overrides: Partial<{ name: string; type: string; size: number }> = {}): File {
  return new File([new Uint8Array(overrides.size ?? 1024)], overrides.name ?? "doc.pdf", {
    type: overrides.type ?? "application/pdf",
  });
}

function cloudDocument(overrides: Partial<CloudDocument> = {}): CloudDocument {
  return {
    id: DOC_ID,
    landRecordId: PARENT_ID,
    documentType: "title_deed",
    storageBucket: "land-documents",
    storagePath: `user/${DOC_ID}/doc.pdf`,
    originalFilename: "doc.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    isSensitive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function pendingDoc(overrides: Partial<PendingDocumentInput> = {}): PendingDocumentInput {
  return {
    id: DOC_ID,
    file: fakeFile(),
    documentType: "title_deed",
    ...overrides,
  };
}

const supabase = {} as SupabaseClient;
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

async function main() {
  // ---- Static check: documents-repository.ts is never imported/called
  // directly in documents-ui-sync.ts -- must go through
  // documents-write-coordinator.ts only (same convention as
  // points-ui-sync.qa.ts Test 0). ----
  await run(
    "Test 0 (documents-repository.ts is never imported/called in documents-ui-sync.ts -- must go through documents-write-coordinator.ts only)",
    async () => {
      const source = fs.readFileSync(
        path.join(process.cwd(), "src/lib/land-records/documents-ui-sync.ts"),
        "utf8",
      );
      assert(
        !/from\s+["']\.\/documents-repository["']/.test(source),
        "documents-ui-sync.ts must not import from documents-repository.ts directly",
      );
      assert(
        !/\bdocuments-repository\b/.test(source.replace(/\/\/.*$/gm, "")),
        "documents-ui-sync.ts must not reference documents-repository outside of comments",
      );
    },
  );

  await run("Test 1 (parent must sync first -- zero cloud calls)", async () => {
    let calls = 0;
    const results = await syncPendingDocumentsToCloud(
      supabase,
      { status: "failed" },
      [pendingDoc()],
      {
        create: async () => {
          calls += 1;
          throw new Error("unexpected");
        },
      },
    );
    assert(results.length === 1, "expected one result for the one pending document");
    assert(results[0].status === "local_only", "expected local_only");
    assert(results[0].localOnlyReason === "parent_not_synced", "expected parent_not_synced reason");
    assert(results[0].id === DOC_ID, "expected the local document id to be echoed back");
    assert(calls === 0, "expected zero cloud calls when parent is not synced");
  });

  await run("Test 2 (fresh document -> documents_synced, id unchanged)", async () => {
    let capturedId = "";
    const results = await syncPendingDocumentsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [pendingDoc()],
      {
        create: async (_client, input) => {
          capturedId = input.id;
          return { ok: true, state: "documents_synced", data: cloudDocument({ id: input.id }) };
        },
      },
    );
    assert(results[0].status === "documents_synced", "expected documents_synced");
    assert(results[0].id === DOC_ID, "expected the result id to match the pending document's own id");
    assert(capturedId === DOC_ID, "expected the pending document's existing id to be reused verbatim, never regenerated");
  });

  await run("Test 3 (landRecordId used is the synced parent's own id)", async () => {
    let capturedLandRecordId = "";
    await syncPendingDocumentsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [pendingDoc()],
      {
        create: async (_client, input) => {
          capturedLandRecordId = input.landRecordId;
          return { ok: true, state: "documents_synced", data: cloudDocument({ id: input.id }) };
        },
      },
    );
    assert(capturedLandRecordId === PARENT_ID, "expected the create call's landRecordId to be the synced parent's id");
  });

  await run("Test 4 (file metadata is derived from the File object, not invented)", async () => {
    let captured: { originalFilename: string; mimeType: string | null; sizeBytes: number | null } | null = null;
    await syncPendingDocumentsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [pendingDoc({ file: fakeFile({ name: "receipt.png", type: "image/png", size: 2048 }) })],
      {
        create: async (_client, input) => {
          captured = {
            originalFilename: input.originalFilename,
            mimeType: input.mimeType ?? null,
            sizeBytes: input.sizeBytes ?? null,
          };
          return { ok: true, state: "documents_synced", data: cloudDocument({ id: input.id }) };
        },
      },
    );
    assert(captured !== null, "expected create to have been called");
    const capturedValue = captured as {
      originalFilename: string;
      mimeType: string | null;
      sizeBytes: number | null;
    };
    assert(capturedValue.originalFilename === "receipt.png", "expected originalFilename to come from File.name");
    assert(capturedValue.mimeType === "image/png", "expected mimeType to come from File.type");
    assert(capturedValue.sizeBytes === 2048, "expected sizeBytes to come from File.size");
  });

  await run(
    "Test 5 (duplicate_conflict maps to duplicate_conflict status, never a false documents_synced)",
    async () => {
      const results = await syncPendingDocumentsToCloud(
        supabase,
        { status: "core_record_synced", record: parentRecord() },
        [pendingDoc()],
        {
          create: async () => ({
            ok: false,
            state: "conflict",
            code: "duplicate_conflict",
            message: "A document with this id already exists with different content; this retry was not treated as a successful save.",
          }),
        },
      );
      assert(results[0].status === "duplicate_conflict", "expected duplicate_conflict");
      assert(results[0].id === DOC_ID, "expected the id to still be reported for the caller's reference");
    },
  );

  await run(
    "Test 6 (legacy non-UUID document id -> invalid_input, never uploaded)",
    async () => {
      let calls = 0;
      const results = await syncPendingDocumentsToCloud(
        supabase,
        { status: "core_record_synced", record: parentRecord() },
        [pendingDoc({ id: "legacy-doc-1234" })],
        {
          create: async () => {
            calls += 1;
            return {
              ok: false,
              state: "failed",
              code: "legacy_child_id_requires_mapping",
              message: "Document id is not a stable UUID; legacy local document ids are not uploaded automatically.",
            };
          },
        },
      );
      assert(results[0].status === "invalid_input", "expected legacy_child_id_requires_mapping to map to invalid_input");
      assert(results[0].id === "legacy-doc-1234", "expected the legacy id to still be reported for the caller's reference");
      assert(calls === 1, "expected the coordinator to have been invoked once (rejection happens inside it, not skipped silently)");
    },
  );

  await run(
    "Test 7 (validation_failed/invalid_parent_id map to invalid_input)",
    async () => {
      const cases: Array<"validation_failed" | "invalid_parent_id"> = [
        "validation_failed",
        "invalid_parent_id",
      ];
      for (const code of cases) {
        const results = await syncPendingDocumentsToCloud(
          supabase,
          { status: "core_record_synced", record: parentRecord() },
          [pendingDoc()],
          {
            create: async () => ({ ok: false, state: "failed", code, message: "simulated" }),
          },
        );
        assert(results[0].status === "invalid_input", `expected ${code} to map to invalid_input`);
      }
    },
  );

  await run("Test 8 (thrown network error is contained per-document, never propagated)", async () => {
    const results = await syncPendingDocumentsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [pendingDoc()],
      {
        create: async () => {
          throw new Error("offline");
        },
      },
    );
    assert(results[0].status === "network_error", "expected network_error");
  });

  await run(
    "Test 9 (multiple documents are processed independently; one failure does not block others)",
    async () => {
      const docs: PendingDocumentInput[] = [
        pendingDoc({ id: "44444444-4444-4444-8444-444444444444", file: fakeFile({ name: "a.pdf" }) }),
        pendingDoc({ id: "55555555-5555-4555-8555-555555555555", file: fakeFile({ name: "b.pdf" }) }),
        pendingDoc({ id: "66666666-6666-4666-8666-666666666666", file: fakeFile({ name: "c.pdf" }) }),
      ];
      const results = await syncPendingDocumentsToCloud(
        supabase,
        { status: "core_record_synced", record: parentRecord() },
        docs,
        {
          create: async (_client, input) => {
            if (input.originalFilename === "b.pdf") {
              throw new Error("offline");
            }
            return { ok: true, state: "documents_synced", data: cloudDocument({ id: input.id }) };
          },
        },
      );
      assert(results.length === 3, "expected all three documents to produce a result");
      const bResult = results.find((r) => r.id === "55555555-5555-4555-8555-555555555555");
      const others = results.filter((r) => r.id !== "55555555-5555-4555-8555-555555555555");
      assert(bResult?.status === "network_error", "expected the second document to report network_error");
      assert(others.every((r) => r.status === "documents_synced"), "expected the other two to succeed independently");
    },
  );

  await run("Test 10 (empty pending list settles with zero results and zero cloud calls)", async () => {
    let calls = 0;
    const results = await syncPendingDocumentsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [],
      {
        create: async () => {
          calls += 1;
          throw new Error("unexpected");
        },
      },
    );
    assert(results.length === 0, "expected zero results for an empty pending list");
    assert(calls === 0, "expected zero cloud calls for an empty pending list");
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll documents-ui-sync QA tests PASSED (11/11).");
  }
}

void main();
