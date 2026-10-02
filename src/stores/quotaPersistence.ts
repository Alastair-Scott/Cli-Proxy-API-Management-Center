import { useQuotaStore } from './useQuotaStore';
import { decodeQuotaSnapshot, encodeQuotaSnapshot, quotaStorageKey } from './quotaCache';

let activeKey: string | null = null;

/** Suspend writes before login clears memory, leaving the previous connection's disk cache intact. */
export function suspendQuotaPersistence() {
  activeKey = null;
}

/** Restore only after the server has accepted this connection's management credentials. */
export function restoreQuotaPersistence(apiBase: string, managementKey: string) {
  const key = quotaStorageKey(apiBase, managementKey);
  try {
    const snapshot = decodeQuotaSnapshot(localStorage.getItem(key), Date.now());
    if (snapshot) {
      const {
        observedAt,
        antigravityQuota,
        claudeQuota,
        codexQuota,
        devinQuota,
        kimiQuota,
        metaQuota,
        xaiQuota,
      } = snapshot;
      useQuotaStore.setState({
        observedAt,
        antigravityQuota,
        claudeQuota,
        codexQuota,
        devinQuota,
        kimiQuota,
        metaQuota,
        xaiQuota,
      });
    }
  } catch {
    // Storage can be unavailable; normal quota fetching still works.
  }
  activeKey = key;
}

export function forgetQuotaPersistence() {
  try {
    if (activeKey) localStorage.removeItem(activeKey);
  } catch {
    /* Storage is optional. */
  }
  activeKey = null;
}

useQuotaStore.subscribe((state) => {
  if (!activeKey) return;
  try {
    localStorage.setItem(activeKey, encodeQuotaSnapshot(state, Date.now()));
  } catch {
    // Full or blocked storage must not interrupt requests or logout.
  }
});
