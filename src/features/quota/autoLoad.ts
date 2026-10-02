import type { QuotaStoreState } from '@/stores/useQuotaStore';
import { isQuotaFresh, quotaObservationKey } from '@/stores/quotaCache';
import { getQuotaCacheKey } from '@/utils/quota/identity';
import type { QuotaFileEntry } from './logic';

/** A failed or already-running request counts as this visit's attempt, avoiding retry loops. */
export function selectAutoQuotaTargets(
  entries: QuotaFileEntry[],
  attempted: Set<string>,
  state: QuotaStoreState,
  now: number
) {
  return entries.filter(({ type, file }) => {
    if (file.disabled) return false;
    const cacheKey = getQuotaCacheKey(file);
    const attemptKey = JSON.stringify([
      state.cacheGeneration,
      state.fileGenerations[file.name] ?? 0,
      type,
      cacheKey,
    ]);
    if (attempted.has(attemptKey)) return false;
    attempted.add(attemptKey);
    const quota = state[`${type}Quota`][cacheKey];
    if (quota?.status === 'loading' || quota?.refreshing) return false;
    return (
      quota?.status !== 'success' ||
      !isQuotaFresh(state.observedAt[quotaObservationKey(`${type}Quota`, cacheKey)], now)
    );
  });
}
