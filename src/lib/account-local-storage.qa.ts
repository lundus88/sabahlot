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

storage.setItem(draftKey, "legacy-draft");
activateAccountLocalStorage("user-a", storage);
assert(
  storage.getItem(draftKey) === null,
  "Unowned legacy data was exposed to the first authenticated user",
);
assert(
  [...Array(storage.length).keys()]
    .map((index) => storage.key(index))
    .some((key) => key?.includes("quarantine:legacy")),
  "Unowned legacy data was not preserved in quarantine",
);

ACCOUNT_LOCAL_WORKING_KEYS.forEach((key, index) => {
  storage.setItem(key, `a-value-${index}`);
});
storage.setItem(draftKey, "a-draft");
storage.setItem(lotsKey, "a-lots");
storage.setItem(gpsKey, "{corrupt-but-preserved");
activateAccountLocalStorage("user-b", storage);
ACCOUNT_LOCAL_WORKING_KEYS.forEach((key) => {
  assert(storage.getItem(key) === null, `User A data leaked through ${key}`);
});

storage.setItem(draftKey, "b-draft");
activateAccountLocalStorage("user-a", storage);
assert(storage.getItem(draftKey) === "a-draft", "User A draft was not restored");
assert(storage.getItem(lotsKey) === "a-lots", "User A lots were not restored");
assert(
  storage.getItem(gpsKey) === "{corrupt-but-preserved",
  "Opaque/corrupt account data was not preserved exactly",
);

activateAccountLocalStorage(null, storage);
assert(storage.getItem(draftKey) === null, "Signed-out session exposed User A draft");
activateAccountLocalStorage("user-b", storage);
assert(storage.getItem(draftKey) === "b-draft", "User B draft was not restored");

console.log("Account-local storage isolation QA: PASS");
