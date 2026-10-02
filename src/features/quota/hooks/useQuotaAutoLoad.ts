import { useEffect, useRef } from 'react';
import { useQuotaStore } from '@/stores/useQuotaStore';
import type { QuotaFileEntry } from '../logic';
import { selectAutoQuotaTargets } from '../autoLoad';

/** Load missing/stale visible accounts once per visit, without polling or retry loops. */
export function useQuotaAutoLoad(
  entries: QuotaFileEntry[],
  disabled: boolean,
  loadQuota: (targets: QuotaFileEntry[]) => Promise<void>
) {
  const attempted = useRef(new Set<string>());
  const session = useQuotaStore((state) => state.cacheGeneration);
  const fileGenerations = useQuotaStore((state) => state.fileGenerations);

  useEffect(() => {
    if (disabled) return;
    const targets = selectAutoQuotaTargets(
      entries,
      attempted.current,
      useQuotaStore.getState(),
      Date.now()
    );
    if (targets.length) void loadQuota(targets);
  }, [disabled, entries, fileGenerations, loadQuota, session]);
}
