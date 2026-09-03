import {
  ACCOUNT_LOCAL_WORKING_KEYS,
} from "./account-local-storage";
import {
  reconcileAccountSession,
} from "./account-session-boundary";

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
const [draftKey, lotsKey, , targetKey] = ACCOUNT_LOCAL_WORKING_KEYS;

const initial = reconcileAccountSession(undefined, "user-a", storage);
assert(!initial.requiresHardReload, "Initial session must not reload");

storage.setItem(draftKey, "a-draft");
storage.setItem(lotsKey, "a-lots");
storage.setItem(targetKey, "a-target");

const toSignedOut = reconcileAccountSession("user-a", null, storage);
assert(toSignedOut.requiresHardReload, "A -> signed-out must hard reload");
assert(storage.getItem(draftKey) === null, "Signed-out session exposed A draft");
assert(storage.getItem(targetKey) === null, "Signed-out session exposed A target");

const toUserB = reconcileAccountSession(null, "user-b", storage);
assert(toUserB.requiresHardReload, "signed-out -> B must hard reload");
assert(storage.getItem(draftKey) === null, "B inherited A draft");
assert(storage.getItem(lotsKey) === null, "B inherited A lots");
assert(storage.getItem(targetKey) === null, "B inherited A target");

storage.setItem(draftKey, "b-draft");
storage.setItem(targetKey, "b-target");

const backToUserA = reconcileAccountSession("user-b", "user-a", storage);
assert(backToUserA.requiresHardReload, "B -> A must hard reload");
assert(storage.getItem(draftKey) === "a-draft", "A draft was not restored");
assert(storage.getItem(targetKey) === "a-target", "A target was not restored");

const sameUser = reconcileAccountSession("user-a", "user-a", storage);
assert(!sameUser.requiresHardReload, "Same user must not reload");

console.log("Account session boundary QA: PASS");
