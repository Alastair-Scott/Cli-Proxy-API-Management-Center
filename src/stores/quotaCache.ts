import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { QuotaStoreState } from './useQuotaStore';

export const QUOTA_FRESH_MS = 5 * 60_000;
export const QUOTA_RETENTION_MS = 24 * 60 * 60_000;
export const QUOTA_CACHE_KEYS = [
  'antigravityQuota',
  'claudeQuota',
  'codexQuota',
  'devinQuota',
  'kimiQuota',
  'metaQuota',
  'xaiQuota',
] as const;
export type QuotaCacheKey = (typeof QUOTA_CACHE_KEYS)[number];
export type QuotaSnapshot = Pick<QuotaStoreState, QuotaCacheKey | 'observedAt'>;

export function quotaStorageKey(apiBase: string, managementKey: string): string {
  // Partition by connection without storing the management key in the cache.
  return `quota-cache-v1:${bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([apiBase, managementKey]))))}`;
}

export const quotaObservationKey = (provider: string, cacheKey: string) =>
  JSON.stringify([provider, cacheKey]);

export function isQuotaFresh(observedAt: number | undefined, now: number): boolean {
  return observedAt !== undefined && observedAt <= now && now - observedAt < QUOTA_FRESH_MS;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isRows = (value: unknown) => Array.isArray(value) && value.every(isRecord);

/** Cache only successful display DTOs, never credential files or failed/loading requests. */
export function encodeQuotaSnapshot(state: QuotaSnapshot, now: number): string {
  const caches = Object.fromEntries(
    QUOTA_CACHE_KEYS.map((key) => [
      key,
      Object.fromEntries(
        Object.entries(state[key])
          .filter(([name, quota]) => {
            const observed = state.observedAt[quotaObservationKey(key, name)];
            return (
              quota.status === 'success' && observed <= now && now - observed < QUOTA_RETENTION_MS
            );
          })
          .map(([name, quota]) => [
            name,
            { ...quota, refreshing: undefined, refreshError: undefined },
          ])
      ),
    ])
  );
  return JSON.stringify({ version: 1, ...caches, observedAt: state.observedAt });
}

/** Validate our versioned browser snapshot before allowing it back into the UI. */
export function decodeQuotaSnapshot(raw: string | null, now: number): QuotaSnapshot | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.observedAt)) return null;
    for (const key of QUOTA_CACHE_KEYS) {
      const cache = value[key];
      if (!isRecord(cache)) return null;
      for (const [name, quota] of Object.entries(cache)) {
        if (!isRecord(quota) || quota.status !== 'success') return null;
        delete quota.refreshing;
        delete quota.refreshError;
        const field =
          key === 'antigravityQuota'
            ? 'groups'
            : key === 'kimiQuota'
              ? 'rows'
              : ['claudeQuota', 'codexQuota', 'devinQuota'].includes(key)
                ? 'windows'
                : null;
        if (field && !isRows(quota[field])) return null;
        if (
          key === 'antigravityQuota' &&
          Array.isArray(quota.groups) &&
          !quota.groups.every((group) => isRecord(group) && isRows(group.buckets))
        )
          return null;
        if (
          key === 'codexQuota' &&
          quota.rateLimitResetCredits !== undefined &&
          !isRows(quota.rateLimitResetCredits)
        )
          return null;
        if (key === 'metaQuota' && quota.data !== undefined && !isRecord(quota.data)) return null;
        if (key === 'xaiQuota' && quota.billing !== null && !isRecord(quota.billing)) return null;
        const observed = value.observedAt[quotaObservationKey(key, name)];
        if (
          typeof observed !== 'number' ||
          !Number.isFinite(observed) ||
          observed > now ||
          now - observed >= QUOTA_RETENTION_MS
        ) {
          delete cache[name];
        }
      }
    }
    // The version and provider containers above define this storage boundary.
    return value as unknown as QuotaSnapshot;
  } catch {
    return null;
  }
}
