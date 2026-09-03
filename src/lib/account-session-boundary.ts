import {
  activateAccountLocalStorage,
} from "./account-local-storage";

export type AccountSessionUserId = string | null;

export interface AccountSessionReconcileResult {
  nextUserId: AccountSessionUserId;
  requiresHardReload: boolean;
}

/**
 * Reconciles the device-local working namespace with the authenticated user.
 *
 * The first reconciliation only establishes the current owner because the
 * page has not rendered account-owned state yet. Any later identity change
 * requires a hard reload so cached React/page state from the previous user
 * cannot be written into the new user's working namespace.
 */
export function reconcileAccountSession(
  previousUserId: AccountSessionUserId | undefined,
  nextUserId: AccountSessionUserId,
  storage: Storage = window.localStorage,
): AccountSessionReconcileResult {
  activateAccountLocalStorage(nextUserId, storage);

  return {
    nextUserId,
    requiresHardReload:
      previousUserId !== undefined &&
      previousUserId !== nextUserId,
  };
}
