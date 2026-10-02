/**
 * Quota cache that survives route switches.
 */

import { create } from 'zustand';
import { quotaObservationKey, QUOTA_CACHE_KEYS, type QuotaCacheKey } from './quotaCache';
import { getQuotaCacheFileName } from '@/utils/quota/identity';
import type {
  AntigravityQuotaState,
  ClaudeQuotaState,
  CodexQuotaState,
  DevinQuotaState,
  KimiQuotaState,
  MetaQuotaState,
  XaiQuotaState,
} from '@/types';

type QuotaUpdater<T> = T | ((prev: T) => T);

export interface QuotaStoreState {
  observedAt: Record<string, number>;
  cacheGeneration: number;
  fileGenerations: Record<string, number>;
  antigravityQuota: Record<string, AntigravityQuotaState>;
  claudeQuota: Record<string, ClaudeQuotaState>;
  codexQuota: Record<string, CodexQuotaState>;
  devinQuota: Record<string, DevinQuotaState>;
  kimiQuota: Record<string, KimiQuotaState>;
  metaQuota: Record<string, MetaQuotaState>;
  xaiQuota: Record<string, XaiQuotaState>;
  setAntigravityQuota: (updater: QuotaUpdater<Record<string, AntigravityQuotaState>>) => void;
  setClaudeQuota: (updater: QuotaUpdater<Record<string, ClaudeQuotaState>>) => void;
  setCodexQuota: (updater: QuotaUpdater<Record<string, CodexQuotaState>>) => void;
  setDevinQuota: (updater: QuotaUpdater<Record<string, DevinQuotaState>>) => void;
  setKimiQuota: (updater: QuotaUpdater<Record<string, KimiQuotaState>>) => void;
  setMetaQuota: (updater: QuotaUpdater<Record<string, MetaQuotaState>>) => void;
  setXaiQuota: (updater: QuotaUpdater<Record<string, XaiQuotaState>>) => void;
  clearQuotaCache: (names?: string[]) => void;
}

const resolveUpdater = <T>(updater: QuotaUpdater<T>, prev: T): T => {
  if (typeof updater === 'function') {
    return (updater as (value: T) => T)(prev);
  }
  return updater;
};

/** Record successful observations without changing the provider object's identity. */
function updateQuota<K extends QuotaCacheKey>(
  state: QuotaStoreState,
  key: K,
  updater: QuotaUpdater<QuotaStoreState[K]>
) {
  const previous = state[key];
  const next = resolveUpdater(updater, previous);
  if (previous === next) return state;
  const observedAt = { ...state.observedAt };
  for (const name of Object.keys(previous)) {
    if (!(name in next)) delete observedAt[quotaObservationKey(key, name)];
  }
  for (const name of Object.keys(next)) {
    const quota = next[name];
    if (
      quota !== previous[name] &&
      quota.status === 'success' &&
      !quota.refreshing &&
      !quota.refreshError
    ) {
      observedAt[quotaObservationKey(key, name)] = Date.now();
    }
  }
  return { ...state, [key]: next, observedAt };
}

export const useQuotaStore = create<QuotaStoreState>((set) => ({
  observedAt: {},
  cacheGeneration: 0,
  fileGenerations: {},
  antigravityQuota: {},
  claudeQuota: {},
  codexQuota: {},
  devinQuota: {},
  kimiQuota: {},
  metaQuota: {},
  xaiQuota: {},
  setAntigravityQuota: (updater) => set((state) => updateQuota(state, 'antigravityQuota', updater)),
  setClaudeQuota: (updater) => set((state) => updateQuota(state, 'claudeQuota', updater)),
  setCodexQuota: (updater) => set((state) => updateQuota(state, 'codexQuota', updater)),
  setDevinQuota: (updater) => set((state) => updateQuota(state, 'devinQuota', updater)),
  setKimiQuota: (updater) => set((state) => updateQuota(state, 'kimiQuota', updater)),
  setMetaQuota: (updater) => set((state) => updateQuota(state, 'metaQuota', updater)),
  setXaiQuota: (updater) => set((state) => updateQuota(state, 'xaiQuota', updater)),
  clearQuotaCache: (names) =>
    set((state) => {
      if (names) {
        if (names.length === 0) return state;
        const fileGenerations = { ...state.fileGenerations };
        names.forEach((name) => {
          fileGenerations[name] = (fileGenerations[name] ?? 0) + 1;
        });
        const invalidatedNames = new Set(names);
        const observedAt = { ...state.observedAt };
        for (const key of QUOTA_CACHE_KEYS) {
          for (const name of Object.keys(state[key])) {
            if (invalidatedNames.has(getQuotaCacheFileName(name)))
              delete observedAt[quotaObservationKey(key, name)];
          }
        }
        const omitNames = <T>(cache: Record<string, T>): Record<string, T> => {
          const keysToDelete = Object.keys(cache).filter((key) =>
            invalidatedNames.has(getQuotaCacheFileName(key))
          );
          if (keysToDelete.length === 0) return cache;
          const next = { ...cache };
          keysToDelete.forEach((key) => delete next[key]);
          return next;
        };
        return {
          fileGenerations,
          observedAt,
          antigravityQuota: omitNames(state.antigravityQuota),
          claudeQuota: omitNames(state.claudeQuota),
          codexQuota: omitNames(state.codexQuota),
          devinQuota: omitNames(state.devinQuota),
          kimiQuota: omitNames(state.kimiQuota),
          metaQuota: omitNames(state.metaQuota),
          xaiQuota: omitNames(state.xaiQuota),
        };
      }
      return {
        observedAt: {},
        cacheGeneration: state.cacheGeneration + 1,
        fileGenerations: {},
        antigravityQuota: {},
        claudeQuota: {},
        codexQuota: {},
        devinQuota: {},
        kimiQuota: {},
        metaQuota: {},
        xaiQuota: {},
      };
    }),
}));

export const captureQuotaCacheGeneration = (name?: string) => {
  const { cacheGeneration, fileGenerations } = useQuotaStore.getState();
  return { cacheGeneration, fileGenerations, name };
};

export const commitIfQuotaCacheCurrent = (
  generation: ReturnType<typeof captureQuotaCacheGeneration>,
  commit: () => void,
  name: string | undefined = generation.name
): boolean => {
  const current = useQuotaStore.getState();
  if (current.cacheGeneration !== generation.cacheGeneration) return false;
  // File-scoped requests survive mutations to unrelated credentials.
  if (name !== undefined) {
    if ((current.fileGenerations[name] ?? 0) !== (generation.fileGenerations[name] ?? 0)) {
      return false;
    }
  } else if (current.fileGenerations !== generation.fileGenerations) {
    return false;
  }
  commit();
  return true;
};
