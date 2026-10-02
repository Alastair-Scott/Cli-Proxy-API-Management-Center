import { describe, expect, test } from 'bun:test';
import { maskQuotaEmail, summarizeQuota } from '../src/features/quota/ledgerModel';
import type { CodexQuotaState } from '../src/types';
import type { TimelineLaneInput } from '../src/features/quota/quotaTimelineModel';

const now = 1_800_000_000_000;
function account(name: string, used: number | null, hours = 168): TimelineLaneInput {
  const quota: CodexQuotaState = {
    status: 'success',
    windows: [
      {
        id: 'weekly',
        label: 'Weekly',
        usedPercent: used,
        resetLabel: '',
        resetAtMs: now + 3600000,
        periodHours: hours,
      },
    ],
  };
  return { name, displayName: name, provider: 'codex', quota };
}

describe('quota ledger', () => {
  test('conceals full addresses in names without altering non-email identifiers', () => {
    const masked = maskQuotaEmail('codex-person@example.com-pro.json');
    expect(masked).toBe('codex-p•••@e•••.json');
    expect(masked).not.toContain('person');
    expect(masked).not.toContain('example.com');
    expect(maskQuotaEmail('service-account.json')).toBe('service-account.json');
  });

  test('sums remaining quota, with one segment per account and the next reset', () => {
    const result = summarizeQuota([account('one', 25), account('two', 50)], now);
    expect(result.remaining).toBe(125);
    expect(result.capacity).toBe(200);
    expect(result.lanes.map((lane) => lane.remaining)).toEqual([75, 50]);
    expect(result.nextResetMs).toBe(now + 3600000);
  });

  test('does not present missing data or mixed windows as a complete total', () => {
    expect(summarizeQuota([account('one', 25), account('two', null)], now).remaining).toBeNull();
    expect(summarizeQuota([account('one', 25), account('two', 50, 5)], now).remaining).toBeNull();
    const unloaded = { ...account('two', 0), quota: undefined };
    expect(summarizeQuota([account('one', 25), unloaded], now).remaining).toBeNull();
  });

  test('keeps exhausted accounts at zero and ignores past reset instants', () => {
    expect(summarizeQuota([account('one', 100)], now).remaining).toBe(0);
    expect(summarizeQuota([account('one', 100)], now + 7200000).nextResetMs).toBeNull();
  });
});
