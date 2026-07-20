// Sprint 02C-2 QA script (independent-review fix): proves
// isCloudWriteEnabled() actually fails closed unless
// NEXT_PUBLIC_SUPABASE_URL points at the sabahlot-dev project
// (xsflrehitrmobiyfbfhk), not merely NODE_ENV !== "production".
// Run via:
//   npx tsc -p src/lib/land-records/feature-gate.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/feature-gate.qa.js
//
// No network, no fake Supabase client needed -- this is a pure
// environment-variable/function-output test.

import {
  isCloudReadEnabled,
  isCloudWriteEnabled,
  isTargetingSabahlotDevProject,
} from "./feature-gate";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

const originalNodeEnv = process.env.NODE_ENV;
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

// NODE_ENV is typed read-only in newer @types/node; NEXT_PUBLIC_SUPABASE_URL
// is not, but Object.assign is used for both here for one consistent,
// always-safe way to mutate process.env in this script.
function setEnv(values: Record<string, string | undefined>) {
  Object.assign(process.env, values);
}

let failures = 0;

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`${name}: PASS`);
  } catch (error) {
    failures += 1;
    console.error(`${name}: ${(error as Error).message}`);
  }
}

const DEV_URL = "https://xsflrehitrmobiyfbfhk.supabase.co";

// ---- 1: correct sabahlot-dev URL, non-production -> gate opens -----------

function testDevUrlOpensGateInDevelopment() {
  setEnv({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: DEV_URL });
  assert(isTargetingSabahlotDevProject(), "expected the dev URL to be recognized as sabahlot-dev");
  assert(isCloudReadEnabled(), "expected the read gate to be open for sabahlot-dev in development");
  assert(isCloudWriteEnabled(), "expected the write gate to be open for sabahlot-dev in development");
}

// ---- 2: a different project's URL -> gate stays closed, even in dev ------

function testOtherProjectUrlStaysClosed() {
  setEnv({
    NODE_ENV: "development",
    NEXT_PUBLIC_SUPABASE_URL: "https://someotherproject.supabase.co",
  });
  assert(!isTargetingSabahlotDevProject(), "expected a different project's URL to not match sabahlot-dev");
  assert(!isCloudReadEnabled(), "expected the read gate to stay closed for a non-dev project URL");
  assert(!isCloudWriteEnabled(), "expected the write gate to stay closed for a non-dev project URL");
}

// ---- 3: missing URL -> gate stays closed ----------------------------------

function testMissingUrlStaysClosed() {
  setEnv({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: undefined });
  assert(!isTargetingSabahlotDevProject(), "expected a missing URL to fail closed");
  assert(!isCloudReadEnabled(), "expected the read gate to stay closed with no configured URL");
  assert(!isCloudWriteEnabled(), "expected the write gate to stay closed with no configured URL");
}

// ---- 3b: empty-string URL -> gate stays closed ----------------------------

function testEmptyUrlStaysClosed() {
  setEnv({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "" });
  assert(!isTargetingSabahlotDevProject(), "expected an empty URL to fail closed");
  assert(!isCloudReadEnabled(), "expected the read gate to stay closed with an empty URL");
  assert(!isCloudWriteEnabled(), "expected the write gate to stay closed with an empty URL");
}

// ---- 3c: malformed (unparsable) URL -> gate stays closed, never throws ----

function testMalformedUrlStaysClosed() {
  setEnv({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "not a url at all" });
  assert(!isTargetingSabahlotDevProject(), "expected a malformed URL to fail closed, not throw");
  assert(!isCloudReadEnabled(), "expected the read gate to stay closed with a malformed URL");
  assert(!isCloudWriteEnabled(), "expected the write gate to stay closed with a malformed URL");
}

// ---- 4: correct dev URL, but production -> gate stays closed --------------

function testProductionStaysClosedEvenWithDevUrl() {
  setEnv({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: DEV_URL });
  assert(isTargetingSabahlotDevProject(), "the URL itself is still recognized as sabahlot-dev");
  assert(!isCloudReadEnabled(), "expected the read gate to stay closed in production regardless of URL");
  assert(!isCloudWriteEnabled(), "expected the write gate to stay closed in production regardless of URL");
}

// ---- 5: substring / lookalike hostnames must not bypass the check --------

function testLookalikeHostnamesRejected() {
  setEnv({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "https://evilxsflrehitrmobiyfbfhkevil.supabase.co" });
  assert(!isTargetingSabahlotDevProject(), "expected a hostname that merely contains the ref as a substring to be rejected");

  setEnv({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: `https://${"xsflrehitrmobiyfbfhk"}.supabase.co.evil.com` });
  assert(!isTargetingSabahlotDevProject(), "expected a suffix-appended lookalike hostname to be rejected");

  setEnv({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: `https://evil.com/${"xsflrehitrmobiyfbfhk"}.supabase.co` });
  assert(!isTargetingSabahlotDevProject(), "expected the project ref appearing only in the path to be rejected");
}

// ---- 6: hostname comparison is case-insensitive ---------------------------

function testHostnameCaseInsensitive() {
  setEnv({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "https://XSFLREHITRMOBIYFBFHK.supabase.co" });
  assert(isTargetingSabahlotDevProject(), "expected hostname comparison to be case-insensitive");
}

// ---- 7: non-https scheme is rejected --------------------------------------

function testNonHttpsRejected() {
  setEnv({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "http://xsflrehitrmobiyfbfhk.supabase.co" });
  assert(!isTargetingSabahlotDevProject(), "expected a non-https URL to be rejected");
}

run("Test 1 (sabahlot-dev URL opens the gate in development)", testDevUrlOpensGateInDevelopment);
run("Test 2 (a different project's URL keeps the gate closed)", testOtherProjectUrlStaysClosed);
run("Test 3 (missing URL keeps the gate closed)", testMissingUrlStaysClosed);
run("Test 3b (empty URL keeps the gate closed)", testEmptyUrlStaysClosed);
run("Test 3c (malformed URL keeps the gate closed, never throws)", testMalformedUrlStaysClosed);
run("Test 4 (production keeps the gate closed even with the correct dev URL)", testProductionStaysClosedEvenWithDevUrl);
run("Test 5 (lookalike/substring hostnames are rejected)", testLookalikeHostnamesRejected);
run("Test 6 (hostname comparison is case-insensitive)", testHostnameCaseInsensitive);
run("Test 7 (non-https scheme is rejected)", testNonHttpsRejected);

setEnv({ NODE_ENV: originalNodeEnv, NEXT_PUBLIC_SUPABASE_URL: originalSupabaseUrl });

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED.`);
  process.exitCode = 1;
} else {
  console.log("\nAll feature-gate QA tests PASSED.");
}
