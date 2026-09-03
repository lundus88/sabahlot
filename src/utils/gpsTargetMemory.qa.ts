import {
  GPS_TARGET_MEMORY_KEY,
  readGpsTargetMemoryFromStorage,
  saveGpsTargetMemoryToStorage,
} from "./gpsTargetMemory";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const local = new MemoryStorage();
const session = new MemoryStorage();

const accountATarget = JSON.stringify({
  lat: 5.9801,
  lng: 116.0735,
  label: "A target",
  source: "map",
  savedAt: "2026-09-03T00:00:00.000Z",
});

// Regression: old builds left Account A's target in sessionStorage. After
// account-local storage switches to B, B has no local target. The old fallback
// must not reveal A's session target.
session.setItem(GPS_TARGET_MEMORY_KEY, accountATarget);
assert(
  readGpsTargetMemoryFromStorage(local, session) === null,
  "Account B restored Account A GPS target from sessionStorage",
);
assert(
  session.getItem(GPS_TARGET_MEMORY_KEY) === null,
  "Legacy session GPS target was not cleared",
);

// A valid account-scoped local target remains readable.
local.setItem(GPS_TARGET_MEMORY_KEY, accountATarget);
const restoredA = readGpsTargetMemoryFromStorage(local, session);
assert(restoredA?.label === "A target", "Account-scoped target was not restored");

// New saves must use localStorage only and remove any legacy session duplicate.
session.setItem(GPS_TARGET_MEMORY_KEY, "legacy-session-copy");
assert(
  saveGpsTargetMemoryToStorage(
    {
      lat: 5.981,
      lng: 116.074,
      label: "B target",
      source: "key-in",
    },
    local,
    session,
  ),
  "GPS target save failed",
);
assert(
  session.getItem(GPS_TARGET_MEMORY_KEY) === null,
  "New GPS target save left an unscoped session copy",
);
assert(
  readGpsTargetMemoryFromStorage(local, session)?.label === "B target",
  "New account-scoped GPS target was not readable",
);

console.log("GPS target account isolation QA: PASS");
