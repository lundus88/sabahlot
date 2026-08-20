// QA script for foundPointMemory.ts (bug fix, 2026-08-18, no sprint ID).
// Run via:
//   npx tsc -p src/utils/foundPointMemory.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/src/utils/foundPointMemory.qa.js
//
// Node has no window/localStorage -- a minimal in-memory fake is set up
// on globalThis before any call, matching isBrowser()'s runtime check
// (not a module-load-time check, so this is safe to do per-test).

import { appendFoundPointToFieldGpsStorage } from "./foundPointMemory";

const STORAGE_KEY = "sabahlot:field-gps-lite:v1";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

class FakeLocalStorage {
  private store = new Map<string, string>();
  private throwOnSet = false;

  setThrowOnSet(value: boolean) {
    this.throwOnSet = value;
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    if (this.throwOnSet) {
      throw new Error("QuotaExceededError");
    }
    this.store.set(key, value);
  }

  seed(value: unknown) {
    this.store.set(STORAGE_KEY, JSON.stringify(value));
  }
}

function installFakeWindow(): FakeLocalStorage {
  const fake = new FakeLocalStorage();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: fake,
  };
  return fake;
}

function readState(fake: FakeLocalStorage): Record<string, unknown> {
  const raw = fake.getItem(STORAGE_KEY);
  assert(raw, "expected a value to have been written");
  return JSON.parse(raw!) as Record<string, unknown>;
}

const validInput = {
  targetName: "Corner A",
  targetLatitude: 5.9804,
  targetLongitude: 116.0735,
  foundLatitude: 5.98045,
  foundLongitude: 116.07355,
  distanceDifferenceMeters: 6.2,
  bearingDegrees: 134.5,
  accuracyMeters: 4.1,
  gpsQualityGrade: "A" as const,
  gpsSignalLabel: "GPS Active - Strong signal",
  note: "Boundary peg found under bush",
};

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

run("Test 1 (fresh blob: creates foundPointRecords with one valid record)", () => {
  const fake = installFakeWindow();
  const ok = appendFoundPointToFieldGpsStorage(validInput);
  assert(ok === true, "expected a successful write to return true");

  const state = readState(fake);
  const records = state.foundPointRecords as Array<Record<string, unknown>>;
  assert(Array.isArray(records) && records.length === 1, "expected exactly one record");

  const record = records[0];
  assert(typeof record.id === "string" && record.id.length > 0, "expected a non-empty id");
  assert(record.mode === "AR Find Point Lite", "expected mode to be AR Find Point Lite");
  assert(record.targetName === "Corner A", "expected targetName to round-trip");
  assert(record.targetLatitude === 5.9804, "expected targetLatitude to round-trip");
  assert(record.foundLongitude === 116.07355, "expected foundLongitude to round-trip");
  assert(record.distanceDifferenceMeters === 6.2, "expected distanceDifferenceMeters to round-trip");
  assert(record.bearingDegrees === 134.5, "expected bearingDegrees to round-trip");
  assert(record.gpsQualityGrade === "A", "expected gpsQualityGrade to round-trip");
  assert(record.note === "Boundary peg found under bush", "expected note to round-trip");
});

run("Test 2 (existing blob: other fields are preserved untouched)", () => {
  const fake = installFakeWindow();
  fake.seed({
    schemaVersion: 1,
    points: [{ id: "p1", label: "Existing point" }],
    foundPoints: [{ id: "fp1" }],
    foundPointRecords: [],
    trackLog: [{ id: "t1" }],
    targetPoint: { id: "target1", latitude: 5.9, longitude: 116.0 },
    generatedPolygon: { area: 123 },
    savedAt: "2026-01-01T00:00:00.000Z",
  });

  appendFoundPointToFieldGpsStorage(validInput);

  const state = readState(fake);
  assert(Array.isArray(state.points) && state.points.length === 1, "expected points array to be preserved");
  assert(Array.isArray(state.foundPoints) && state.foundPoints.length === 1, "expected foundPoints array to be preserved");
  assert(Array.isArray(state.trackLog) && state.trackLog.length === 1, "expected trackLog array to be preserved");
  assert(
    (state.targetPoint as Record<string, unknown>)?.id === "target1",
    "expected targetPoint to be preserved untouched",
  );
  assert(
    (state.generatedPolygon as Record<string, unknown>)?.area === 123,
    "expected generatedPolygon to be preserved untouched",
  );
});

run("Test 3 (multiple appends accumulate, never overwrite each other)", () => {
  const fake = installFakeWindow();
  appendFoundPointToFieldGpsStorage(validInput);
  appendFoundPointToFieldGpsStorage({ ...validInput, targetName: "Corner B" });
  appendFoundPointToFieldGpsStorage({ ...validInput, targetName: "Corner C" });

  const state = readState(fake);
  const records = state.foundPointRecords as Array<Record<string, unknown>>;
  assert(records.length === 3, "expected three accumulated records");
  const names = records.map((r) => r.targetName);
  assert(
    names.includes("Corner A") && names.includes("Corner B") && names.includes("Corner C"),
    "expected all three targetNames to be present, none overwritten",
  );
  const ids = new Set(records.map((r) => r.id));
  assert(ids.size === 3, "expected each record to get a distinct id");
});

run("Test 4 (corrupted existing JSON is not fatal -- starts a fresh valid blob)", () => {
  const fake = installFakeWindow();
  fake.setItem(STORAGE_KEY, "{not valid json");

  const ok = appendFoundPointToFieldGpsStorage(validInput);
  assert(ok === true, "expected recovery from corrupted JSON to still succeed");

  const state = readState(fake);
  const records = state.foundPointRecords as Array<Record<string, unknown>>;
  assert(records.length === 1, "expected exactly one record after recovering from corrupt JSON");
});

run("Test 5 (storage write failure returns false, never throws)", () => {
  const fake = installFakeWindow();
  fake.setThrowOnSet(true);

  let threw = false;
  let ok = true;
  try {
    ok = appendFoundPointToFieldGpsStorage(validInput);
  } catch {
    threw = true;
  }
  assert(!threw, "expected a storage write failure to be caught, never thrown");
  assert(ok === false, "expected a storage write failure to return false");
});

run("Test 6 (no window -- e.g. SSR -- returns false, never throws)", () => {
  delete (globalThis as unknown as { window?: unknown }).window;

  let threw = false;
  let ok = true;
  try {
    ok = appendFoundPointToFieldGpsStorage(validInput);
  } catch {
    threw = true;
  }
  assert(!threw, "expected a missing window to be handled without throwing");
  assert(ok === false, "expected a missing window to return false");
});

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED.`);
  process.exitCode = 1;
} else {
  console.log("\nAll foundPointMemory QA tests PASSED.");
}
