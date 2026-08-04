// Sprint 02C-2 QA script (independent-review fix): proves
// isCloudWriteEnabled() actually fails closed unless
// NEXT_PUBLIC_SUPABASE_URL points at the sabahlot-dev project
// (xsflrehitrmobiyfbfhk), not merely NODE_ENV !== "production".
// Extended by sprint production-read-gate-phase1 (ADR-019, Tests 8-13):
// proves isTargetingSabahlotProductionProject() matches/fails-closed
// correctly, and that isCloudReadEnabled() stays closed for
// sabahlot-production as long as PRODUCTION_READ_ENABLED_CONSTANT ships
// false -- see the comment above Test 8 for what is and isn't covered.
// Extended by sprint production-write-gate-phase2a-land-records (ADR-020,
// Tests 14-17): proves isCloudWriteEnabledForParentInProduction() stays
// closed while its constant ships false, and -- the load-bearing check for
// this sprint's whole design -- that no OTHER module's write-coordinator
// references it at all, so Production write cannot silently leak beyond
// land_records. See the comment above Test 14 for what is and isn't covered.
// Run via:
//   npx tsc -p src/lib/land-records/feature-gate.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/feature-gate.qa.js
//
// No network, no fake Supabase client needed -- this is a pure
// environment-variable/function-output test.

import * as fs from "node:fs";
import * as path from "node:path";

import {
  isCloudReadEnabled,
  isCloudWriteEnabled,
  isCloudWriteEnabledForParentInProduction,
  isTargetingSabahlotDevProject,
  isTargetingSabahlotProductionProject,
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
const PRODUCTION_URL = "https://mrkhhdfxoomkzirwgnwx.supabase.co";

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
  assert(!isTargetingSabahlotProductionProject(), "expected a missing URL to fail closed for the production matcher too");
  assert(!isCloudReadEnabled(), "expected the read gate to stay closed with no configured URL");
  assert(!isCloudWriteEnabled(), "expected the write gate to stay closed with no configured URL");
}

// ---- 3b: empty-string URL -> gate stays closed ----------------------------

function testEmptyUrlStaysClosed() {
  setEnv({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "" });
  assert(!isTargetingSabahlotDevProject(), "expected an empty URL to fail closed");
  assert(!isTargetingSabahlotProductionProject(), "expected an empty URL to fail closed for the production matcher too");
  assert(!isCloudReadEnabled(), "expected the read gate to stay closed with an empty URL");
  assert(!isCloudWriteEnabled(), "expected the write gate to stay closed with an empty URL");
}

// ---- 3c: malformed (unparsable) URL -> gate stays closed, never throws ----

function testMalformedUrlStaysClosed() {
  setEnv({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "not a url at all" });
  assert(!isTargetingSabahlotDevProject(), "expected a malformed URL to fail closed, not throw");
  assert(!isTargetingSabahlotProductionProject(), "expected a malformed URL to fail closed for the production matcher too, not throw");
  assert(!isCloudReadEnabled(), "expected the read gate to stay closed with a malformed URL");
  assert(!isCloudWriteEnabled(), "expected the write gate to stay closed with a malformed URL");
}

// ---- 4: correct dev URL, but production -> gate stays closed --------------

function testProductionStaysClosedEvenWithDevUrl() {
  setEnv({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: DEV_URL });
  assert(isTargetingSabahlotDevProject(), "the URL itself is still recognized as sabahlot-dev");
  assert(!isCloudReadEnabled(), "expected the read gate to stay closed in production regardless of URL");
  assert(!isCloudWriteEnabled(), "expected the write gate to stay closed in production regardless of URL");
  assert(!isCloudWriteEnabledForParentInProduction(), "expected the parent-in-production gate to stay closed for the dev URL (wrong hostname)");
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

// ---- Sprint production-read-gate-phase1 (ADR-019) -------------------------
//
// PRODUCTION_READ_ENABLED_CONSTANT is intentionally not exported and has no
// runtime override, so its "what if it were true" branch cannot be exercised
// here without adding a test-only hook to production gate code -- which
// would undermine the point of it being a hardcoded, non-runtime-configurable
// switch. That branch is DOCUMENTED, not executed: with the constant at its
// shipped value (false), Test 8 below proves the gate stays closed even when
// both isTargetingSabahlotProductionProject() and NODE_ENV === "production"
// hold. isTargetingSabahlotProductionProject() itself -- the only part of
// the new branch with real matching logic -- is fully exercised by Tests 8-14
// below (missing/empty/malformed URL cases are covered by the extended
// Tests 3/3b/3c above). When PRODUCTION_READ_ENABLED_CONSTANT is later
// flipped to true in its own separate commit, isCloudReadEnabled() opening
// under exactly those same two conditions follows directly from the
// unchanged `&&` in its implementation, not from anything this QA script
// could additionally prove by mocking the constant.

// ---- 8: sabahlot-production URL + production build -> gate stays closed,
//         because PRODUCTION_READ_ENABLED_CONSTANT ships false -------------

function testProductionUrlStaysClosedWhileConstantIsFalse() {
  setEnv({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL });
  assert(isTargetingSabahlotProductionProject(), "expected the production URL to be recognized as sabahlot-production");
  assert(!isCloudReadEnabled(), "expected the read gate to stay closed for sabahlot-production while PRODUCTION_READ_ENABLED_CONSTANT is false");
  assert(!isCloudWriteEnabled(), "expected the write gate to stay closed for sabahlot-production (write gate untouched by this sprint)");
}

// ---- 9: sabahlot-production URL, but not a production build -> stays closed

function testProductionUrlOutsideProductionBuildStaysClosed() {
  setEnv({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL });
  assert(isTargetingSabahlotProductionProject(), "expected the production URL to be recognized as sabahlot-production regardless of NODE_ENV");
  assert(!isCloudReadEnabled(), "expected the read gate to stay closed for sabahlot-production outside a production build");
  assert(!isCloudWriteEnabled(), "expected the write gate to stay closed for sabahlot-production outside a production build");
}

// ---- 10: sabahlot-dev URL in a production build -> not recognized as
//          sabahlot-production either (the two matchers are disjoint) -----

function testDevUrlNotRecognizedAsProductionEvenInProductionBuild() {
  setEnv({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: DEV_URL });
  assert(!isTargetingSabahlotProductionProject(), "expected the dev URL to never be recognized as sabahlot-production");
  assert(!isCloudReadEnabled(), "expected the read gate to stay closed (dev URL + production build never opens either branch)");
  assert(!isCloudWriteEnabled(), "expected the write gate to stay closed (dev URL + production build never opens either branch)");
  assert(!isCloudWriteEnabledForParentInProduction(), "expected the parent-in-production gate to stay closed for the dev URL even in a production build");
}

// ---- 11: substring / lookalike production hostnames must not bypass ------

function testProductionLookalikeHostnamesRejected() {
  setEnv({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://evilmrkhhdfxoomkzirwgnwxevil.supabase.co" });
  assert(!isTargetingSabahlotProductionProject(), "expected a hostname that merely contains the production ref as a substring to be rejected");

  setEnv({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: `https://${"mrkhhdfxoomkzirwgnwx"}.supabase.co.evil.com` });
  assert(!isTargetingSabahlotProductionProject(), "expected a suffix-appended lookalike production hostname to be rejected");

  setEnv({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: `https://evil.com/${"mrkhhdfxoomkzirwgnwx"}.supabase.co` });
  assert(!isTargetingSabahlotProductionProject(), "expected the production project ref appearing only in the path to be rejected");
}

// ---- 12: production hostname comparison is case-insensitive --------------

function testProductionHostnameCaseInsensitive() {
  setEnv({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://MRKHHDFXOOMKZIRWGNWX.supabase.co" });
  assert(isTargetingSabahlotProductionProject(), "expected production hostname comparison to be case-insensitive");
}

// ---- 13: non-https scheme is rejected for the production hostname too ----

function testProductionNonHttpsRejected() {
  setEnv({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "http://mrkhhdfxoomkzirwgnwx.supabase.co" });
  assert(!isTargetingSabahlotProductionProject(), "expected a non-https production URL to be rejected");
}

// ---- Sprint production-write-gate-phase2a-land-records (ADR-020) ----------
//
// isCloudWriteEnabledForParentInProduction() reuses the already-verified
// isTargetingSabahlotProductionProject() matcher (Tests 8-13 above already
// cover its hostname matching exhaustively), so Tests 14-16 below only need
// to prove the gate function's own boolean combination, not re-derive
// hostname matching. Same as PRODUCTION_READ_ENABLED_CONSTANT, the "if
// PRODUCTION_PARENT_WRITE_ENABLED_CONSTANT were true" branch is DOCUMENTED,
// not executed, for the same reason: no test-only export exists for it.

// ---- 14: sabahlot-production URL + production build -> parent write stays
//          closed, because PRODUCTION_PARENT_WRITE_ENABLED_CONSTANT ships
//          false ----------------------------------------------------------

function testParentWriteInProductionStaysClosedWhileConstantIsFalse() {
  setEnv({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL });
  assert(!isCloudWriteEnabledForParentInProduction(), "expected the parent-in-production write gate to stay closed while its constant is false");
  assert(!isCloudWriteEnabled(), "expected the dev write gate to stay closed for sabahlot-production regardless");
}

// ---- 15: sabahlot-production URL, but not a production build -> stays closed

function testParentWriteInProductionOutsideProductionBuildStaysClosed() {
  setEnv({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL });
  assert(!isCloudWriteEnabledForParentInProduction(), "expected the parent-in-production write gate to stay closed outside a production build");
}

// ---- 16: a different (non-dev, non-production) project's URL never opens
//          the parent-in-production gate, even in a production build -------

function testParentWriteInProductionRejectsOtherProjectUrl() {
  setEnv({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://someotherproject.supabase.co" });
  assert(!isCloudWriteEnabledForParentInProduction(), "expected the parent-in-production write gate to stay closed for an unrelated project URL");
}

// ---- 17: static check -- no other module's write-coordinator ever
//          references isCloudWriteEnabledForParentInProduction. This is the
//          load-bearing proof that Phase 2a's land_records-only design
//          actually holds: geometry/points/parties/documents must go on
//          calling isCloudWriteEnabled() (the dev-only gate) exclusively, or
//          Production write would silently leak into a module this sprint
//          never touched and never tested against Production RLS. ----------

function testOtherCoordinatorsNeverReferenceParentInProductionGate() {
  const otherCoordinatorFiles = [
    "geometry-write-coordinator.ts",
    "points-write-coordinator.ts",
    "parties-write-coordinator.ts",
    "documents-write-coordinator.ts",
  ];
  for (const file of otherCoordinatorFiles) {
    // __dirname at runtime points into the compiled scratch outDir, not the
    // source tree -- this QA script is always run from the repo root (see
    // the run convention in the header comment above), so resolve the real
    // .ts source relative to process.cwd() instead.
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/land-records", file),
      "utf8",
    );
    assert(
      !source.includes("isCloudWriteEnabledForParentInProduction"),
      `${file} must never reference isCloudWriteEnabledForParentInProduction -- Production write for this module is out of scope until its own dedicated phase`,
    );
  }
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
run("Test 8 (sabahlot-production URL + production build stays closed while the constant is false)", testProductionUrlStaysClosedWhileConstantIsFalse);
run("Test 9 (sabahlot-production URL outside a production build stays closed)", testProductionUrlOutsideProductionBuildStaysClosed);
run("Test 10 (sabahlot-dev URL in a production build is never recognized as sabahlot-production)", testDevUrlNotRecognizedAsProductionEvenInProductionBuild);
run("Test 11 (lookalike/substring production hostnames are rejected)", testProductionLookalikeHostnamesRejected);
run("Test 12 (production hostname comparison is case-insensitive)", testProductionHostnameCaseInsensitive);
run("Test 13 (non-https scheme is rejected for the production hostname)", testProductionNonHttpsRejected);
run("Test 14 (parent write in production stays closed while the constant is false)", testParentWriteInProductionStaysClosedWhileConstantIsFalse);
run("Test 15 (parent write in production stays closed outside a production build)", testParentWriteInProductionOutsideProductionBuildStaysClosed);
run("Test 16 (parent write in production rejects an unrelated project URL)", testParentWriteInProductionRejectsOtherProjectUrl);
run("Test 17 (no other coordinator ever references the parent-in-production write gate)", testOtherCoordinatorsNeverReferenceParentInProductionGate);

setEnv({ NODE_ENV: originalNodeEnv, NEXT_PUBLIC_SUPABASE_URL: originalSupabaseUrl });

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED.`);
  process.exitCode = 1;
} else {
  console.log("\nAll feature-gate QA tests PASSED.");
}
