// sprint-feedback-cloud-sync QA script for feedback-cloud-sync.ts. Run via:
//   npx tsc -p src/lib/feedback/feedback-cloud-sync.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/src/lib/feedback/feedback-cloud-sync.qa.js
// (same convention as points-ui-sync.qa.ts / documents-ui-sync.qa.ts)
//
// Uses a fake Supabase client (no network, no dependency added). This
// module has no parent/child ordering and no repository/coordinator split
// like the land-records modules -- it is tested directly against a minimal
// fake covering only what it actually calls: auth.getUser() and
// from("feedback").insert(row).

import * as fs from "node:fs";
import * as path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { syncFeedbackToCloud } from "./feedback-cloud-sync";
import type { FeedbackEntryInput } from "./feedbackStorage";

// isCloudWriteEnabled() requires NEXT_PUBLIC_SUPABASE_URL to resolve to
// the sabahlot-dev project and NODE_ENV !== "production" -- same
// convention as points-write.qa.ts/documents-write.qa.ts. Never written to
// any .env file and never read by production code.
const DEV_SUPABASE_URL = "https://xsflrehitrmobiyfbfhk.supabase.co";
Object.assign(process.env, {
  NODE_ENV: "development",
  NEXT_PUBLIC_SUPABASE_URL: DEV_SUPABASE_URL,
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function entry(overrides: Partial<FeedbackEntryInput> = {}): FeedbackEntryInput {
  return {
    nama: "Test User",
    telefon: "0121234567",
    lokasiUjian: "Kota Kinabalu",
    jenisTelefon: "iPhone 14",
    browser: "Safari",
    fungsiDiuji: "Mark Point",
    jenisIsu: "Minor",
    penerangan: "Sample description",
    cadangan: "",
    screenshotNote: "",
    region: "sabah",
    state: "",
    district: "",
    module: "",
    ...overrides,
  };
}

interface FakeUser {
  id: string;
}

interface FakeSupabaseOptions {
  user?: FakeUser | null;
  insertError?: { message: string } | null;
  throwOnInsert?: boolean;
}

function fakeSupabase(options: FakeSupabaseOptions = {}): {
  client: SupabaseClient;
  capturedRow: () => Record<string, unknown> | null;
  insertCalls: () => number;
} {
  let captured: Record<string, unknown> | null = null;
  let calls = 0;

  const client = {
    auth: {
      getUser: async () => ({ data: { user: options.user ?? null } }),
    },
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        calls += 1;
        captured = row;
        if (options.throwOnInsert) {
          throw new Error("offline");
        }
        return { error: options.insertError ?? null };
      },
    }),
  } as unknown as SupabaseClient;

  return {
    client,
    capturedRow: () => captured,
    insertCalls: () => calls,
  };
}

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
  // ---- Static check: user_id is never read from the input type, only
  // ever derived from the session (ADR-005 pattern) ----
  await run(
    "Test 0 (user_id is derived from the session, never read from FeedbackEntryInput)",
    async () => {
      const source = fs.readFileSync(
        path.join(process.cwd(), "src/lib/feedback/feedback-cloud-sync.ts"),
        "utf8",
      );
      assert(
        !/input\.user_?[Ii]d/.test(source),
        "feedback-cloud-sync.ts must never read a user id off the caller-supplied input",
      );
    },
  );

  await run("Test 1 (gate closed -> local_only, zero cloud calls)", async () => {
    const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://someotherproject.supabase.co";
    try {
      const { client, insertCalls } = fakeSupabase();
      const result = await syncFeedbackToCloud(client, entry());
      assert(result.status === "local_only", "expected local_only when the gate is closed");
      assert(insertCalls() === 0, "expected zero insert calls when the gate is closed");
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = original;
    }
  });

  await run(
    "Test 2 (invalid issue type -> invalid_input, zero cloud calls)",
    async () => {
      const { client, insertCalls } = fakeSupabase();
      const result = await syncFeedbackToCloud(
        client,
        entry({ jenisIsu: "Not A Real Type" as FeedbackEntryInput["jenisIsu"] }),
      );
      assert(result.status === "invalid_input", "expected invalid_input for an unrecognized issue type");
      assert(insertCalls() === 0, "expected zero insert calls for invalid input");
    },
  );

  await run(
    "Test 3 (anonymous submit -> feedback_synced, user_id written as null)",
    async () => {
      const { client, capturedRow } = fakeSupabase({ user: null });
      const result = await syncFeedbackToCloud(client, entry());
      assert(result.status === "feedback_synced", "expected feedback_synced");
      assert(capturedRow()?.user_id === null, "expected user_id: null for an anonymous submission");
    },
  );

  await run(
    "Test 4 (signed-in submit -> user_id is the session's own id)",
    async () => {
      const { client, capturedRow } = fakeSupabase({
        user: { id: "22222222-2222-4222-8222-222222222222" },
      });
      const result = await syncFeedbackToCloud(client, entry());
      assert(result.status === "feedback_synced", "expected feedback_synced");
      assert(
        capturedRow()?.user_id === "22222222-2222-4222-8222-222222222222",
        "expected user_id to be the authenticated session's own id",
      );
    },
  );

  await run(
    "Test 5 (optional fields map to null when blank, are passed through when present)",
    async () => {
      const { client, capturedRow } = fakeSupabase();
      await syncFeedbackToCloud(
        client,
        entry({ cadangan: "  ", state: "Sabah", district: "" }),
      );
      const row = capturedRow();
      assert(row?.suggestion === null, "expected a whitespace-only field to map to null");
      assert(row?.state === "Sabah", "expected a populated optional field to pass through");
      assert(row?.district === null, "expected an empty optional field to map to null");
    },
  );

  await run(
    "Test 6 (database error on insert -> failed, generic message, cloud copy assumed safe locally)",
    async () => {
      const { client } = fakeSupabase({ insertError: { message: "duplicate key value violates unique constraint" } });
      const result = await syncFeedbackToCloud(client, entry());
      assert(result.status === "failed", "expected failed");
      assert(
        !result.message?.includes("duplicate key value"),
        "expected the raw Postgres error message to never reach the caller",
      );
    },
  );

  await run(
    "Test 7 (thrown network error is contained, never propagated)",
    async () => {
      const { client } = fakeSupabase({ throwOnInsert: true });
      const result = await syncFeedbackToCloud(client, entry());
      assert(result.status === "network_error", "expected network_error");
    },
  );

  if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll feedback-cloud-sync QA tests PASSED.");
  }
}

void main();
