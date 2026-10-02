import { buildTimelineLane, type TimelineLaneInput } from './quotaTimelineModel';

/** Conceal the address in credential filenames, including the hostname. */
export function maskQuotaEmail(value: string): string {
  return value.replace(/([^\s@]+)@([^\s@]+)/g, (_match, local: string, host: string) => {
    const prefix = /^(?:claude|codex|antigravity|kimi|xai|meta|devin)-/i.exec(local)?.[0] ?? '';
    const suffix = host.endsWith('.json') ? '.json' : '';
    return `${prefix}${local.slice(prefix.length, prefix.length + 1)}•••@${host.slice(0, 1)}•••${suffix}`;
  });
}

/** Sum comparable account windows; an incomplete total stays explicitly unknown. */
export function summarizeQuota(inputs: TimelineLaneInput[], now: number) {
  const lanes = inputs.map(buildTimelineLane);
  const known = lanes.filter((lane) => lane.remaining !== null && Number.isFinite(lane.remaining));
  const periods = new Set(known.map((lane) => lane.periodHours));
  const complete = known.length === lanes.length && periods.size === 1;
  const resets = lanes.flatMap((lane) =>
    lane.anchorMs !== null && lane.anchorMs > now ? [lane.anchorMs] : []
  );
  return {
    lanes,
    remaining: complete ? known.reduce((sum, lane) => sum + (lane.remaining ?? 0), 0) : null,
    capacity: lanes.length * 100,
    loaded: known.length,
    periodHours: periods.size === 1 ? known[0]?.periodHours : null,
    nextResetMs: resets.length ? Math.min(...resets) : null,
  };
}
