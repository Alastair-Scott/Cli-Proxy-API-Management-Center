import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { useQuotaStore } from '../src/stores/useQuotaStore';
import {
  decodeQuotaSnapshot,
  encodeQuotaSnapshot,
  isQuotaFresh,
  quotaObservationKey,
  quotaStorageKey,
  QUOTA_FRESH_MS,
  QUOTA_RETENTION_MS,
} from '../src/stores/quotaCache';
import {
  restoreQuotaPersistence,
  suspendQuotaPersistence,
  forgetQuotaPersistence,
} from '../src/stores/quotaPersistence';
import { selectAutoQuotaTargets } from '../src/features/quota/autoLoad';
import type { QuotaFileEntry } from '../src/features/quota/logic';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let values: Map<string, string>;
const entry: QuotaFileEntry = { type: 'codex', file: { name: 'example.json', provider: 'codex' } };
const observationKey = quotaObservationKey('codexQuota', entry.file.name);
const success = () => ({ status: 'success' as const, windows: [] });

beforeEach(() => {
  suspendQuotaPersistence();
  useQuotaStore.getState().clearQuotaCache();
  values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
});
afterEach(() => {
  suspendQuotaPersistence();
  useQuotaStore.getState().clearQuotaCache();
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('persistent quota observations', () => {
  test('restores successful observations after a reload without storing management credentials', () => {
    restoreQuotaPersistence('https://one.test', 'fixture-secret');
    useQuotaStore.getState().setCodexQuota({ [entry.file.name]: success() });
    const before = useQuotaStore.getState().observedAt[observationKey];
    suspendQuotaPersistence();
    useQuotaStore.getState().clearQuotaCache();
    restoreQuotaPersistence('https://one.test', 'fixture-secret');
    expect(useQuotaStore.getState().codexQuota[entry.file.name]).toEqual(success());
    expect(useQuotaStore.getState().observedAt[observationKey]).toBe(before);
    expect(JSON.stringify([...values])).not.toContain('fixture-secret');
  });

  test('isolates servers and management keys; logout forgets the active cache', () => {
    restoreQuotaPersistence('https://one.test', 'fixture-a');
    useQuotaStore.getState().setCodexQuota({ [entry.file.name]: success() });
    for (const [server, key] of [
      ['https://two.test', 'fixture-a'],
      ['https://one.test', 'fixture-b'],
    ]) {
      suspendQuotaPersistence();
      useQuotaStore.getState().clearQuotaCache();
      restoreQuotaPersistence(server, key);
      expect(useQuotaStore.getState().codexQuota).toEqual({});
    }
    suspendQuotaPersistence();
    useQuotaStore.getState().clearQuotaCache();
    restoreQuotaPersistence('https://one.test', 'fixture-a');
    forgetQuotaPersistence();
    useQuotaStore.getState().clearQuotaCache();
    expect(values.has(quotaStorageKey('https://one.test', 'fixture-a'))).toBe(false);
  });

  test('refreshing or failing a cached observation does not extend its freshness', () => {
    useQuotaStore.getState().setCodexQuota({ [entry.file.name]: success() });
    useQuotaStore.setState({ observedAt: { [observationKey]: 1000 } });
    useQuotaStore
      .getState()
      .setCodexQuota({ [entry.file.name]: { ...success(), refreshing: true } });
    expect(useQuotaStore.getState().observedAt[observationKey]).toBe(1000);
    useQuotaStore
      .getState()
      .setCodexQuota({
        [entry.file.name]: { ...success(), refreshing: false, refreshError: 'offline' },
      });
    expect(useQuotaStore.getState().observedAt[observationKey]).toBe(1000);
    const disk = encodeQuotaSnapshot(useQuotaStore.getState(), 2000);
    expect(disk).not.toContain('offline');
    expect(disk).not.toContain('refreshing');
    expect(decodeQuotaSnapshot(disk, 2000)?.codexQuota[entry.file.name]).toEqual(success());
  });

  test('invalidated or deleted files disappear from the persisted cache', () => {
    restoreQuotaPersistence('https://one.test', 'fixture-a');
    useQuotaStore.getState().setCodexQuota({ [entry.file.name]: success() });
    useQuotaStore.getState().clearQuotaCache([entry.file.name]);
    expect(useQuotaStore.getState().observedAt[observationKey]).toBeUndefined();
    const disk = values.get(quotaStorageKey('https://one.test', 'fixture-a')) ?? null;
    expect(decodeQuotaSnapshot(disk, Date.now())?.codexQuota).toEqual({});
  });

  test('rejects malformed, incompatible and expired cache data; blocked storage is optional', () => {
    expect(decodeQuotaSnapshot('{broken', Date.now())).toBeNull();
    expect(decodeQuotaSnapshot('{"version":2}', Date.now())).toBeNull();
    useQuotaStore.getState().setCodexQuota({ [entry.file.name]: success() });
    const now = Date.now();
    const disk = encodeQuotaSnapshot(useQuotaStore.getState(), now);
    expect(decodeQuotaSnapshot(disk.replace('"windows":[]', '"windows":[null]'), now)).toBeNull();
    expect(decodeQuotaSnapshot(disk, now + QUOTA_RETENTION_MS)?.codexQuota).toEqual({});
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked');
      },
    });
    expect(() => restoreQuotaPersistence('server', 'key')).not.toThrow();
    expect(() =>
      useQuotaStore.getState().setCodexQuota({ [entry.file.name]: success() })
    ).not.toThrow();
    expect(() => forgetQuotaPersistence()).not.toThrow();
  });
});

describe('automatic quota loading', () => {
  test('fetches missing and stale observations, but reuses fresh observations', () => {
    expect(
      selectAutoQuotaTargets([entry], new Set(), useQuotaStore.getState(), Date.now())
    ).toEqual([entry]);
    useQuotaStore.getState().setCodexQuota({ [entry.file.name]: success() });
    const observed = useQuotaStore.getState().observedAt[observationKey];
    expect(
      selectAutoQuotaTargets([entry], new Set(), useQuotaStore.getState(), observed + 1)
    ).toEqual([]);
    expect(
      selectAutoQuotaTargets(
        [entry],
        new Set(),
        useQuotaStore.getState(),
        observed + QUOTA_FRESH_MS
      )
    ).toEqual([entry]);
    expect(isQuotaFresh(observed + 100, observed)).toBe(false);
  });

  test('does not retry failures in a loop or duplicate an in-flight request', () => {
    const attempted = new Set<string>();
    expect(
      selectAutoQuotaTargets([entry], attempted, useQuotaStore.getState(), Date.now())
    ).toEqual([entry]);
    useQuotaStore
      .getState()
      .setCodexQuota({ [entry.file.name]: { status: 'error', windows: [], error: 'offline' } });
    expect(
      selectAutoQuotaTargets([entry], attempted, useQuotaStore.getState(), Date.now())
    ).toEqual([]);
    useQuotaStore
      .getState()
      .setCodexQuota({ [entry.file.name]: { ...success(), refreshing: true } });
    expect(
      selectAutoQuotaTargets([entry], new Set(), useQuotaStore.getState(), Date.now())
    ).toEqual([]);
    useQuotaStore.getState().clearQuotaCache([entry.file.name]);
    expect(
      selectAutoQuotaTargets([entry], attempted, useQuotaStore.getState(), Date.now())
    ).toEqual([entry]);
  });
});
