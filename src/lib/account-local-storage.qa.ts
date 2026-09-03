import {
  ACCOUNT_LOCAL_WORKING_KEYS,
  activateAccountLocalStorage,
} from "./account-local-storage";

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

const storage = new MemoryStorage();
const [draftKey, lotsKey, gpsKey] = ACCOUNT_LOCAL_WORKING_KEYS;

// Reproduce the real-device failure state: v2 already says user-b owns the
// namespace, both v2 per-user archives exist, and the currently visible
// working state contains Account A data. A v3 rollout must trust none of it.
storage.setItem("sabahlot:account-local:v2:active-owner", "user:user-b");
storage.setItem(draftKey, "a-draft-visible-under-b");
storage.setItem(lotsKey, "a-lots-visible-under-b");
storage.setItem(gpsKey, "a-target-visible-under-b");
storage.setItem(
  "sabahlot:account-local:v2:owner:user:user-a:sabahlot-alpha-record",
  "a-v2-archived-draft",
);
storage.setItem(
  "sabahlot:account-local:v2:owner:user:user-b:sabahlot-alpha-record",
  "contaminated-b-v2-draft",
);

activateAccountLocalStorage("user-b", storage);
ACCOUNT_LOCAL_WORKING_KEYS.forEach((key) => {
  assert(
    storage.getItem(key) === null,
    `v3 trusted contaminated pre-v3 working data through ${key}`,
  );
});
assert(
  storage.getItem(
    "sabahlot:account-local:v2:owner:user:user-b:sabahlot-alpha-record",
  ) === "contaminated-b-v2-draft",
  "v3 unexpectedly deleted the preserved v2 archive",
);
assert(
  [...Array(storage.length).keys()]
    .map((index) => storage.key(index))
    .some((key) => key?.includes("v3:quarantine:legacy")),
  "v3 did not preserve the pre-upgrade working data in quarantine",
);

// Establish a clean Account B working set inside v3.
ACCOUNT_LOCAL_WORKING_KEYS.forEach((key, index) => {
  storage.setItem(key, `b-v3-value-${index}`);
});
storage.setItem(draftKey, "b-draft-v3");
storage.setItem(lotsKey, "b-lots-v3");
storage.setItem(gpsKey, "b-target-v3");

activateAccountLocalStorage("user-a", storage);
ACCOUNT_LOCAL_WORKING_KEYS.forEach((key) => {
  assert(storage.getItem(key) === null, `User B v3 data leaked through ${key}`);
});

// Establish a clean Account A working set inside v3.
storage.setItem(draftKey, "a-draft-v3");
storage.setItem(lotsKey, "a-lots-v3");
storage.setItem(gpsKey, "a-target-v3");

activateAccountLocalStorage("user-b", storage);
assert(storage.getItem(draftKey) === "b-draft-v3", "User B v3 draft was not restored");
assert(storage.getItem(lotsKey) === "b-lots-v3", "User B v3 lots were not restored");
assert(storage.getItem(gpsKey) === "b-target-v3", "User B v3 target was not restored");

activateAccountLocalStorage(null, storage);
ACCOUNT_LOCAL_WORKING_KEYS.forEach((key) => {
  assert(storage.getItem(key) === null, `Signed-out session exposed User B v3 data through ${key}`);
});

activateAccountLocalStorage("user-a", storage);
assert(storage.getItem(draftKey) === "a-draft-v3", "User A v3 draft was not restored");
assert(storage.getItem(lotsKey) === "a-lots-v3", "User A v3 lots were not restored");
assert(storage.getItem(gpsKey) === "a-target-v3", "User A v3 target was not restored");

console.log("Account-local storage v3 clean-reset isolation QA: PASS");
