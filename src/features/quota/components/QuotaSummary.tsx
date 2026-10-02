import { useTranslation } from 'react-i18next';
import { useNow } from '@/hooks/useNow';
import { buildResetDisplay } from '@/utils/quota';
import { getQuotaCacheKey } from '@/utils/quota/identity';
import { getAuthFileIcon, getTypeLabel } from '@/features/authFiles/constants';
import type { ResolvedTheme } from '@/types';
import { QUOTA_TAB_ORDER } from '../constants';
import type { QuotaFileEntry } from '../logic';
import type { QuotaCardState } from '../providers';
import { summarizeQuota } from '../ledgerModel';
import styles from './QuotaLedger.module.scss';

export function QuotaSummary({
  entries,
  quotaFor,
  resolvedTheme,
}: {
  entries: QuotaFileEntry[];
  quotaFor: (entry: QuotaFileEntry) => QuotaCardState | undefined;
  resolvedTheme: ResolvedTheme;
}) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  return (
    <div className={styles.summary} aria-label={t('quota_management.provider_summary')}>
      {QUOTA_TAB_ORDER.map((provider) => {
        const group = entries.filter((entry) => entry.type === provider);
        if (!group.length) return null;
        const summary = summarizeQuota(
          group.map((entry) => ({
            name: getQuotaCacheKey(entry.file),
            displayName: '',
            provider,
            quota: quotaFor(entry),
          })),
          now
        );
        const reset = buildResetDisplay(null, summary.nextResetMs, now, i18n.resolvedLanguage);
        const icon = getAuthFileIcon(provider, resolvedTheme);
        return (
          <section key={provider} className={styles.summaryProvider}>
            <div className={styles.summaryHeading}>
              <h2>
                {icon && <img src={icon} alt="" />}
                {getTypeLabel(t, provider)}
              </h2>
              <span>{t('quota_management.meta_credentials', { count: group.length })}</span>
            </div>
            <div className={styles.summaryLabel}>
              {summary.periodHours === 168
                ? t('codex_quota.secondary_window')
                : t('quota_management.remaining_quota')}
            </div>
            <div className={styles.summaryValue}>
              <strong>
                {summary.remaining === null ? '--' : `${Math.round(summary.remaining)}%`}
              </strong>
              <span>{t('quota_management.of_capacity', { capacity: summary.capacity })}</span>
            </div>
            <div className={styles.segments} aria-hidden="true">
              {summary.lanes.map((lane) => (
                <div key={lane.name} className={styles.track}>
                  <span
                    style={{
                      width: `${lane.remaining ?? 0}%`,
                      background:
                        lane.remaining !== null && lane.remaining >= 70
                          ? 'var(--viz-success)'
                          : lane.remaining !== null && lane.remaining >= 30
                            ? 'var(--quota-medium-color)'
                            : 'var(--viz-failure)',
                    }}
                  />
                </div>
              ))}
            </div>
            <p className={styles.summaryReset}>
              {reset
                ? `${reset.relative ?? ''} · ${reset.absolute}`
                : t('quota_management.meta_loaded', { count: summary.loaded })}
            </p>
          </section>
        );
      })}
    </div>
  );
}
