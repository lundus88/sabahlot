// Sprint documents UI wiring QA script for documents-ui-sync.ts. Run via:
//   npx tsc -p src/lib/land-records/documents-ui-sync.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/src/lib/land-records/documents-ui-sync.qa.js
// (same convention as points-ui-sync.qa.ts / parties-ui-sync.qa.ts)

import * as fs from "node:fs";
import * as path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  syncDocumentUploadsToCloud,
  type DocumentUploadInput,
} from "./documents-ui-sync";
import type { CloudDocument } from "./types";
import type { ParentSyncResult } from "./parent-ui-sync";
import type { CreateDocumentInput } from "./child-types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

const PARENT_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";

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
    documents: [],
    ownerName: null,
    originalApplicantStatus: "",
  };
}

function documentRow(overrides: Partial<CloudDocument> = {}): CloudDocument {
  return {
    id: DOCUMENT_ID,
    documentType: "site_photo",
    originalFilename: "corner-1.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 2048,
    isSensitive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function fakeFile(overrides: { size?: number; type?: string } = {}): Blob {
  const size = overrides.size ?? 2048;
  return new Blob([new Uint8Array(size)], { type: overrides.type ?? "image/jpeg" });
}

function baseUpload(overrides: Partial<DocumentUploadInput> = {}): DocumentUploadInput {
  return {
    id: DOCUMENT_ID,
    documentType: "site_photo",
    originalFilename: "corner-1.jpg",
    file: fakeFile(),
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
  // ---- Static check: no update/delete counterpart is ever referenced ----
  await run(
    "Test 0 (updateCloudDocument/deleteCloudDocument are never imported/called in documents-ui-sync.ts -- create-only)",
    async () => {
      // __dirname at runtime points into the compiled scratch outDir, not
      // the source tree -- this QA script is always run from the repo
      // root (see the run convention in the header comment above), so
      // resolve the real .ts source relative to process.cwd() instead.
      const source = fs.readFileSync(
        path.join(process.cwd(), "src/lib/land-records/documents-ui-sync.ts"),
        "utf8",
      );
      assert(
        !/\bupdateCloudDocument\b/.test(source),
        "updateCloudDocument must not appear anywhere in documents-ui-sync.ts (no updated_at column exists to support it)",
      );
      assert(
        !/\bdeleteCloudDocument\b/.test(source),
        "deleteCloudDocument must not appear anywhere in documents-ui-sync.ts (delete is deferred)",
      );
    },
  );

  await run("Test 1 (parent must sync first -- zero cloud calls)", async () => {
    let calls = 0;
    const uploads: DocumentUploadInput[] = [baseUpload()];
    const results = await syncDocumentUploadsToCloud(
      supabase,
      { status: "failed" },
      uploads,
      {
        create: async () => {
          calls += 1;
          throw new Error("unexpected");
        },
      },
    );
    assert(results.length === 1, "expected one result for the one upload");
    assert(results[0].status === "local_only", "expected local_only");
    assert(results[0].localOnlyReason === "parent_not_synced", "expected parent_not_synced reason");
    assert(calls === 0, "expected zero cloud calls when parent is not synced");
  });

  await run("Test 2 (valid upload succeeds, documents_synced)", async () => {
    const results = await syncDocumentUploadsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [baseUpload()],
      {
        create: async (_client, input) => ({
          ok: true,
          state: "documents_synced",
          data: documentRow({ id: input.id }),
        }),
      },
    );
    assert(results[0].status === "documents_synced", "expected documents_synced");
    assert(results[0].document?.id === DOCUMENT_ID, "expected the synced document to be returned");
  });

  await run("Test 3 (id is reused verbatim, never regenerated -- unlike parties)", async () => {
    let capturedId = "";
    await syncDocumentUploadsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [baseUpload({ id: DOCUMENT_ID })],
      {
        create: async (_client, input) => {
          capturedId = input.id;
          return { ok: true, state: "documents_synced", data: documentRow({ id: input.id }) };
        },
      },
    );
    assert(capturedId === DOCUMENT_ID, "expected the upload's own id to be sent verbatim, never regenerated");
  });

  await run("Test 4 (the actual file Blob is passed through to create()'s third argument)", async () => {
    const file = fakeFile({ size: 4096, type: "application/pdf" });
    let capturedFile: Blob | null = null;
    await syncDocumentUploadsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [baseUpload({ file, documentType: "plan_or_sketch" })],
      {
        create: async (_client, input, passedFile) => {
          capturedFile = passedFile;
          return { ok: true, state: "documents_synced", data: documentRow({ id: input.id }) };
        },
      },
    );
    assert(capturedFile === file, "expected the exact same Blob instance to reach createCloudDocument");
  });

  await run(
    "Test 5 (mimeType/sizeBytes are structurally never sent -- CreateDocumentInput built here has no such fields)",
    async () => {
      let capturedInput: CreateDocumentInput | null = null;
      await syncDocumentUploadsToCloud(
        supabase,
        { status: "core_record_synced", record: parentRecord() },
        [baseUpload()],
        {
          create: async (_client, input) => {
            capturedInput = input;
            return { ok: true, state: "documents_synced", data: documentRow({ id: input.id }) };
          },
        },
      );
      assert(!!capturedInput, "expected create to have been called");
      assert(
        !("mimeType" in (capturedInput as unknown as Record<string, unknown>)) &&
          !("sizeBytes" in (capturedInput as unknown as Record<string, unknown>)),
        "mimeType/sizeBytes must never appear in the CreateDocumentInput built by documents-ui-sync.ts -- they are derived from the file itself, one layer deeper",
      );
    },
  );

  await run("Test 6 (duplicate_conflict is mapped correctly, not silently applied)", async () => {
    const results = await syncDocumentUploadsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [baseUpload()],
      {
        create: async () => ({
          ok: false,
          state: "conflict",
          code: "duplicate_conflict",
          message: "A document with this id already exists with different content.",
        }),
      },
    );
    assert(results[0].status === "duplicate_conflict", "expected duplicate_conflict");
  });

  await run("Test 7 (thrown network error is contained per-upload, never propagated)", async () => {
    const results = await syncDocumentUploadsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [baseUpload()],
      {
        create: async () => {
          throw new Error("offline");
        },
      },
    );
    assert(results[0].status === "network_error", "expected network_error");
  });

  await run("Test 8 (multiple uploads are processed independently; one failure does not block others)", async () => {
    const uploads: DocumentUploadInput[] = [
      baseUpload({ id: "33333333-3333-4333-8333-333333333333", originalFilename: "a.jpg" }),
      baseUpload({ id: "44444444-4444-4444-8444-444444444444", originalFilename: "b.jpg" }),
      baseUpload({ id: "55555555-5555-4555-8555-555555555555", originalFilename: "c.jpg" }),
    ];
    const results = await syncDocumentUploadsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      uploads,
      {
        create: async (_client, input) => {
          if (input.originalFilename === "b.jpg") {
            return { ok: false, state: "failed", code: "database_error", message: "simulated failure" };
          }
          return { ok: true, state: "documents_synced", data: documentRow({ id: input.id }) };
        },
      },
    );
    assert(results.length === 3, "expected all three uploads to produce a result");
    const failedOne = results.find((r) => r.id === "44444444-4444-4444-8444-444444444444");
    const okOnes = results.filter((r) => r.id !== "44444444-4444-4444-8444-444444444444");
    assert(failedOne?.status === "failed", "expected the second upload to report failed");
    assert(okOnes.every((r) => r.status === "documents_synced"), "expected the other two to succeed independently");
  });

  await run("Test 9 (landRecordId used is the synced parent's own id)", async () => {
    let capturedLandRecordId = "";
    await syncDocumentUploadsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [baseUpload()],
      {
        create: async (_client, input) => {
          capturedLandRecordId = input.landRecordId ?? "";
          return { ok: true, state: "documents_synced", data: documentRow({ id: input.id }) };
        },
      },
    );
    assert(capturedLandRecordId === PARENT_ID, "expected the create call's landRecordId to be the synced parent's id");
  });

  await run(
    "Test 10 (validation_failed/invalid_parent_id/legacy_child_id_requires_mapping map to invalid_input)",
    async () => {
      const cases: Array<"validation_failed" | "invalid_parent_id" | "legacy_child_id_requires_mapping"> = [
        "validation_failed",
        "invalid_parent_id",
        "legacy_child_id_requires_mapping",
      ];
      for (const code of cases) {
        const results = await syncDocumentUploadsToCloud(
          supabase,
          { status: "core_record_synced", record: parentRecord() },
          [baseUpload()],
          {
            create: async () => ({
              ok: false,
              state: "failed",
              code,
              message: "simulated",
            }),
          },
        );
        assert(
          results[0].status === "invalid_input",
          `expected ${code} to map to invalid_input`,
        );
      }
    },
  );

  await run("Test 11 (isSensitive/documentType/originalFilename are forwarded verbatim)", async () => {
    let captured: CreateDocumentInput | null = null;
    await syncDocumentUploadsToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [
        baseUpload({
          documentType: "title_deed",
          originalFilename: "title-deed-scan.pdf",
          isSensitive: false,
        }),
      ],
      {
        create: async (_client, input) => {
          captured = input;
          return { ok: true, state: "documents_synced", data: documentRow({ id: input.id }) };
        },
      },
    );
    assert(captured !== null, "expected create to have been called");
    const input = captured as unknown as CreateDocumentInput;
    assert(input.documentType === "title_deed", "expected documentType forwarded verbatim");
    assert(input.originalFilename === "title-deed-scan.pdf", "expected originalFilename forwarded verbatim");
    assert(input.isSensitive === false, "expected an explicit isSensitive: false to be forwarded, not dropped");
  });

  await run("Test 12 (empty upload list settles with zero results and zero cloud calls)", async () => {
    let calls = 0;
    const results = await syncDocumentUploadsToCloud(
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
    assert(results.length === 0, "expected zero results for an empty upload list");
    assert(calls === 0, "expected zero cloud calls for an empty upload list");
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll documents-ui-sync QA tests PASSED.");
  }
}

void main();
