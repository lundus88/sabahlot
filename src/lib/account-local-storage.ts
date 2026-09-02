const ACTIVE_OWNER_KEY =
  "sabahlot:account-local:v1:active-owner";

const ACCOUNT_PREFIX =
  "sabahlot:account-local:v1:owner";

const LEGACY_QUARANTINE_PREFIX =
  "sabahlot:account-local:v1:quarantine:legacy";

export const ACCOUNT_LOCAL_WORKING_KEYS = [
  "sabahlot-alpha-record",
  "sabahlot_local_lots_v1",
  "sabahlot:field-gps-lite:v1",
  "sabahlot:gps-target:v1",
  "sabahlot_field_assist_active_target",
] as const;

const ANONYMOUS_OWNER = "anonymous";

function ownerToken(userId: string | null): string {
  return userId
    ? `user:${encodeURIComponent(userId)}`
    : ANONYMOUS_OWNER;
}

function scopedKey(
  owner: string,
  workingKey: string,
): string {
  return `${ACCOUNT_PREFIX}:${owner}:${workingKey}`;
}

function archiveWorkingSet(
  storage: Storage,
  owner: string,
): void {
  for (const workingKey of ACCOUNT_LOCAL_WORKING_KEYS) {
    const value = storage.getItem(workingKey);

    if (value === null) {
      storage.removeItem(scopedKey(owner, workingKey));
    } else {
      storage.setItem(scopedKey(owner, workingKey), value);
    }

    storage.removeItem(workingKey);
  }
}

function restoreWorkingSet(
  storage: Storage,
  owner: string,
): void {
  for (const workingKey of ACCOUNT_LOCAL_WORKING_KEYS) {
    const value = storage.getItem(scopedKey(owner, workingKey));

    if (value === null) {
      storage.removeItem(workingKey);
    } else {
      storage.setItem(workingKey, value);
    }
  }
}

function quarantineUnownedLegacyData(storage: Storage): void {
  for (const workingKey of ACCOUNT_LOCAL_WORKING_KEYS) {
    const value = storage.getItem(workingKey);

    if (value !== null) {
      storage.setItem(
        `${LEGACY_QUARANTINE_PREFIX}:${workingKey}`,
        value,
      );
      storage.removeItem(workingKey);
    }
  }
}

/**
 * Makes the legacy working keys represent exactly one authenticated user
 * (or the anonymous device session). Existing unowned data is quarantined
 * rather than silently assigned to the first user who opens the new build.
 */
export function activateAccountLocalStorage(
  userId: string | null,
  storage: Storage = window.localStorage,
): void {
  const nextOwner = ownerToken(userId);
  const activeOwner = storage.getItem(ACTIVE_OWNER_KEY);

  if (activeOwner === nextOwner) {
    return;
  }

  if (activeOwner) {
    archiveWorkingSet(storage, activeOwner);
  } else {
    quarantineUnownedLegacyData(storage);
  }

  restoreWorkingSet(storage, nextOwner);
  storage.setItem(ACTIVE_OWNER_KEY, nextOwner);
}

