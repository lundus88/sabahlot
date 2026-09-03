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

// Simulate a device already contaminated under the old v1 namespace:
// the active owner says user-b while the visible working draft is actually A's.
storage.setItem("sabahlot:account-local:v1:active-owner", "user:user-b");
storage.setItem(draftKey, "a-draft-visible-under-b");
storage.setItem(
  "sabahlot:account-local:v1:owner:user:user-a:sabahlot-alpha-record",
  "a-v1-archived-draft",
);
storage.setItem(
  "sabahlot:account-local:v1:owner:user:user-b:sabahlot-alpha-record",
  "possibly-contaminated-b-v1-draft",
);

activateAccountLocalStorage("user-b", storage);
assert(
  storage.getItem(draftKey) === null,
  "v2 exposed a working draft carried over from the contaminated v1 namespace",
);
assert(
  [...Array(storage.length).keys()]
    .map((index) => storage.key(index))
    .some((key) => key?.includes("v2:quarantine:legacy")),
  "v2 did not preserve the pre-upgrade working draft in quarantine",
);

ACCOUNT_LOCAL_WORKING_KEYS.forEach((key, index) => {
  storage.setItem(key, `b-value-${index}`);
});
storage.setItem(draftKey, "b-draft");
storage.setItem(lotsKey, "b-lots");
storage.setItem(gpsKey, "{corrupt-but-preserved");
activateAccountLocalStorage("user-a", storage);
ACCOUNT_LOCAL_WORKING_KEYS.forEach((key) => {
  assert(storage.getItem(key) === null, `User B data leaked through ${key}`);
});

storage.setItem(draftKey, "a-draft-v2");
activateAccountLocalStorage("user-b", storage);
assert(storage.getItem(draftKey) === "b-draft", "User B draft was not restored");
assert(storage.getItem(lotsKey) === "b-lots", "User B lots were not restored");
assert(
  storage.getItem(gpsKey) === "{corrupt-but-preserved",
  "Opaque/corrupt account data was not preserved exactly",
);

activateAccountLocalStorage(null, storage);
assert(storage.getItem(draftKey) === null, "Signed-out session exposed User B draft");
activateAccountLocalStorage("user-a", storage);
assert(storage.getItem(draftKey) === "a-draft-v2", "User A v2 draft was not restored");

console.log("Account-local storage isolation QA: PASS");
