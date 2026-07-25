// Sprint parties UI wiring QA script for parties-ui-sync.ts. Run via:
//   npx tsc -p src/lib/land-records/parties-ui-sync.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/src/lib/land-records/parties-ui-sync.qa.js
// (same convention as child-ui-sync.qa.ts)

import * as fs from "node:fs";
import * as path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  syncPdfIdentitiesToCloud,
  type PartyIdentityInput,
} from "./parties-ui-sync";
import type { CloudLandParty } from "./types";
import type { ParentSyncResult } from "./parent-ui-sync";
import type { CreatePartyInput } from "./parties-validation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

const PARENT_ID = "11111111-1111-4111-8111-111111111111";
const SURVEYOR_ID = "22222222-2222-4222-8222-222222222222";

function parentRecord(parties: CloudLandParty[] = []): NonNullable<ParentSyncResult["record"]> {
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
    parties,
    ownerName: null,
    originalApplicantStatus: "",
  };
}

function partyRow(overrides: Partial<CloudLandParty> = {}): CloudLandParty {
  return {
    id: SURVEYOR_ID,
    partyRole: "surveyor",
    fullName: "Ahmad bin Ali",
    idNumber: null,
    relationshipToApplicant: null,
    contactPhone: null,
    contactEmail: null,
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
  // ---- Static check: updateCloudParty is never referenced here at all ----
  await run(
    "Test 0 (updateCloudParty is never imported/called in parties-ui-sync.ts -- create-only this sprint)",
    async () => {
      // __dirname at runtime points into the compiled scratch outDir, not
      // the source tree -- this QA script is always run from the repo
      // root (see the run convention in the header comment above), so
      // resolve the real .ts source relative to process.cwd() instead.
      const source = fs.readFileSync(
        path.join(process.cwd(), "src/lib/land-records/parties-ui-sync.ts"),
        "utf8",
      );
      // Only checks for an actual import or call -- the file's own doc
      // comments legitimately name updateCloudParty to explain why it's
      // absent, so a bare substring check would trip on its own
      // documentation.
      assert(
        !/import\s*\{[^}]*\bupdateCloudParty\b/.test(source),
        "updateCloudParty must not be imported in parties-ui-sync.ts (no safe updatedAt token available this sprint)",
      );
      assert(
        !/\bupdateCloudParty\s*\(/.test(source),
        "updateCloudParty must not be called anywhere in parties-ui-sync.ts",
      );
    },
  );

  await run("Test 1 (parent must sync first -- zero cloud calls)", async () => {
    let calls = 0;
    const identities: PartyIdentityInput[] = [
      { role: "surveyor", name: "Ahmad bin Ali" },
    ];
    const results = await syncPdfIdentitiesToCloud(
      supabase,
      { status: "failed" },
      identities,
      {
        create: async () => {
          calls += 1;
          throw new Error("unexpected");
        },
      },
    );
    assert(results.length === 1, "expected one result for the one filled identity");
    assert(results[0].status === "local_only", "expected local_only");
    assert(results[0].localOnlyReason === "parent_not_synced", "expected parent_not_synced reason");
    assert(calls === 0, "expected zero cloud calls when parent is not synced");
  });

  await run("Test 2 (empty/whitespace-only names are skipped entirely, no result)", async () => {
    let calls = 0;
    const identities: PartyIdentityInput[] = [
      { role: "surveyor", name: "" },
      { role: "witness", name: "   " },
      { role: "village_head", name: "Penghulu Musa" },
    ];
    const results = await syncPdfIdentitiesToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      identities,
      {
        create: async (_client, input) => {
          calls += 1;
          return { ok: true, state: "parties_synced", data: partyRow({ id: input.id, partyRole: input.partyRole, fullName: input.fullName }) };
        },
      },
    );
    assert(results.length === 1, "expected only the one filled-in identity to produce a result");
    assert(results[0].role === "village_head", "expected the filled-in identity to be village_head");
    assert(calls === 1, "expected exactly one cloud call, for the one filled-in identity");
  });

  await run("Test 3 (first-time sync generates a fresh UUID, no existingId)", async () => {
    let capturedId = "";
    const identities: PartyIdentityInput[] = [
      { role: "surveyor", name: "Ahmad bin Ali" },
    ];
    const results = await syncPdfIdentitiesToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      identities,
      {
        create: async (_client, input) => {
          capturedId = input.id;
          return { ok: true, state: "parties_synced", data: partyRow({ id: input.id }) };
        },
      },
    );
    assert(results[0].status === "parties_synced", "expected parties_synced");
    assert(!!results[0].id, "expected a generated id to be returned for persistence");
    assert(results[0].id === capturedId, "expected the returned id to match what was actually sent to Supabase");
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    assert(uuidPattern.test(capturedId), "expected a stable-UUID-shaped generated id");
  });

  await run("Test 4 (existing id is reused, never regenerated)", async () => {
    let capturedId = "";
    const identities: PartyIdentityInput[] = [
      { role: "surveyor", name: "Ahmad bin Ali", existingId: SURVEYOR_ID },
    ];
    const results = await syncPdfIdentitiesToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord([partyRow()]) },
      identities,
      {
        create: async (_client, input) => {
          capturedId = input.id;
          return { ok: true, state: "parties_synced", data: partyRow({ id: input.id }) };
        },
      },
    );
    assert(capturedId === SURVEYOR_ID, "expected the pre-existing id to be reused verbatim");
    assert(results[0].id === SURVEYOR_ID, "expected the result to carry the same reused id");
  });

  await run("Test 5 (idNo is structurally never sent -- CreatePartyInput built here has no such field)", async () => {
    let capturedInput: CreatePartyInput | null = null;
    const identities: PartyIdentityInput[] = [
      { role: "surveyor", name: "Ahmad bin Ali" },
    ];
    await syncPdfIdentitiesToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      identities,
      {
        create: async (_client, input) => {
          capturedInput = input;
          return { ok: true, state: "parties_synced", data: partyRow({ id: input.id }) };
        },
      },
    );
    assert(!!capturedInput, "expected create to have been called");
    assert(
      !("idNo" in (capturedInput as unknown as Record<string, unknown>)) &&
        !("id_number" in (capturedInput as unknown as Record<string, unknown>)),
      "idNo/id_number must never appear in the CreatePartyInput built by parties-ui-sync.ts",
    );
    console.log("  (structural: PartyIdentityInput itself has no idNo/id_number field to read from)");
  });

  await run("Test 6 (changed content on a re-synced party -> duplicate_conflict, not silently applied)", async () => {
    const results = await syncPdfIdentitiesToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord([partyRow({ fullName: "Different Name" })]) },
      [{ role: "surveyor", name: "Ahmad bin Ali", existingId: SURVEYOR_ID }],
      {
        create: async () => ({
          ok: false,
          state: "conflict",
          code: "duplicate_conflict",
          message: "A party with this id already exists with different content; this retry was not treated as a successful save.",
        }),
      },
    );
    assert(results[0].status === "duplicate_conflict", "expected duplicate_conflict");
    assert(results[0].id === SURVEYOR_ID, "expected the id to still be reported for the caller's reference");
  });

  await run("Test 7 (thrown network error is contained per-identity, never propagated)", async () => {
    const results = await syncPdfIdentitiesToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [{ role: "surveyor", name: "Ahmad bin Ali" }],
      {
        create: async () => {
          throw new Error("offline");
        },
      },
    );
    assert(results[0].status === "network_error", "expected network_error");
  });

  await run("Test 8 (multiple identities are processed independently; one failure does not block others)", async () => {
    const identities: PartyIdentityInput[] = [
      { role: "surveyor", name: "Ahmad bin Ali" },
      { role: "witness", name: "Siti binti Osman" },
      { role: "village_head", name: "Penghulu Musa" },
      { role: "original_applicant", name: "Applicant Name" },
    ];
    const results = await syncPdfIdentitiesToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      identities,
      {
        create: async (_client, input) => {
          if (input.partyRole === "witness") {
            return { ok: false, state: "failed", code: "database_error", message: "simulated failure" };
          }
          return { ok: true, state: "parties_synced", data: partyRow({ id: input.id, partyRole: input.partyRole, fullName: input.fullName }) };
        },
      },
    );
    assert(results.length === 4, "expected all four filled identities to produce a result");
    const witnessResult = results.find((r) => r.role === "witness");
    const othersOk = results.filter((r) => r.role !== "witness");
    assert(witnessResult?.status === "failed", "expected witness to report failed");
    assert(othersOk.every((r) => r.status === "parties_synced"), "expected the other three to succeed independently");
  });

  await run("Test 9 (landRecordId used is the synced parent's own id)", async () => {
    let capturedLandRecordId = "";
    await syncPdfIdentitiesToCloud(
      supabase,
      { status: "core_record_synced", record: parentRecord() },
      [{ role: "surveyor", name: "Ahmad bin Ali" }],
      {
        create: async (_client, input) => {
          capturedLandRecordId = input.landRecordId;
          return { ok: true, state: "parties_synced", data: partyRow({ id: input.id }) };
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
        const results = await syncPdfIdentitiesToCloud(
          supabase,
          { status: "core_record_synced", record: parentRecord() },
          [{ role: "surveyor", name: "Ahmad bin Ali" }],
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

  if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll parties-ui-sync QA tests PASSED.");
  }
}

void main();
