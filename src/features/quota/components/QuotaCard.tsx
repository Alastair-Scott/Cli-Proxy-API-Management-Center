/** Account quota presentation, retaining successful values during background refresh. */

import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { IconRefreshCw } from '@/components/ui/icons';
import type { ResolvedTheme } from '@/types';
import { resolveQuotaErrorMessage } from '@/utils/quota';
import { getQuotaDisplayName } from '@/utils/quota/identity';
import {
  getAuthFileIcon,
  getThemeSurfaceIconBackground,
  getTypeLabel,
  isThemeSurfaceIconProvider,
} from '@/features/authFiles/constants';
import { bindQuotaClasses } from '../types';
import { QUOTA_ADAPTERS, type QuotaCardState } from '../providers';
import { isQuotaRefreshDisabled, type QuotaFileEntry } from '../logic';
import { useClaudeResetGrants } from '../providers/claude/ClaudeResetGrants';
import bodyStyles from './QuotaBody.module.scss';
import styles from './QuotaCard.module.scss';
import ledger from './QuotaLedger.module.scss';
import { maskQuotaEmail } from '../ledgerModel';

/** 额度页全页外衣：QuotaBody 模块绑定成类型化契约（缺键在模块初始化即抛）。 */
const quotaClasses = bindQuotaClasses(bodyStyles, 'QuotaBody.module.scss');

export type QuotaCardProps = {
  layout?: 'cards' | 'ledger';
  showEmails?: boolean;
  entry: QuotaFileEntry;
  quota?: QuotaCardState;
  resolvedTheme: ResolvedTheme;
  canRefresh: boolean;
  resetting: boolean;
  /** 首屏级联入场延迟；null = 不入场（切 tab / 翻页 / 刷新新挂载的卡片）。 */
  entranceDelayMs?: number | null;
  onRefresh: () => void;
  onReset: () => void;
};

export function QuotaCard(props: QuotaCardProps) {
  const {
    layout = 'cards',
    showEmails = true,
    entry,
    quota,
    resolvedTheme,
    canRefresh,
    resetting,
    entranceDelayMs,
    onRefresh,
    onReset,
  } = props;
  const { t } = useTranslation();
  const adapter = QUOTA_ADAPTERS[entry.type];
  const file = entry.file;
  const displayName = showEmails
    ? getQuotaDisplayName(file)
    : maskQuotaEmail(getQuotaDisplayName(file));
  const isLedger = layout === 'ledger';
  const splitBody = isLedger && (entry.type === 'codex' || entry.type === 'claude');
  const classes = isLedger
    ? {
        ...quotaClasses,
        codexPlan: ledger.plan,
        codexPlanValue: ledger.planValue,
        premiumPlanValue: ledger.planValue,
        elitePlanValue: ledger.planValue,
        quotaRow: ledger.quotaRow,
        quotaRowHeader: ledger.contents,
        quotaMeta: ledger.contents,
        quotaModel: ledger.model,
        quotaPercent: ledger.percent,
        quotaBar: ledger.bar,
        quotaReset: ledger.reset,
        quotaResetRelative: ledger.relative,
        quotaResetGroup: ledger.resetGroup,
        codexResetCredits: ledger.resetCredits,
        codexResetCreditsTitle: ledger.resetTitle,
        codexResetCreditRow: ledger.resetCreditRow,
        codexResetCreditTime: ledger.resetCreditTime,
      }
    : quotaClasses;

  // 挂载时捕获一次延迟：后续 props 变 null 不影响本卡（React 19 禁渲染期读 ref）
  const [mountEntranceDelayMs] = useState<number | null>(entranceDelayMs ?? null);
  const entranceStyle =
    mountEntranceDelayMs === null
      ? undefined
      : ({ '--card-delay': `${mountEntranceDelayMs}ms` } as CSSProperties);

  const status = quota?.status ?? 'idle';
  const loading = status === 'loading';
  const claudeReset = useClaudeResetGrants(
    file,
    entry.type === 'claude' && status !== 'idle',
    !canRefresh || loading || Boolean(quota?.refreshing) || resetting,
    quota,
    onRefresh
  );
  const iconSrc = getAuthFileIcon(entry.type, resolvedTheme);
  const typeLabel = getTypeLabel(t, entry.type);
  const errorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );
  const showReset =
    status === 'success' &&
    Boolean(adapter.resetQuota) &&
    quota !== undefined &&
    Boolean(adapter.canResetQuota?.(quota));

  return (
    <article
      className={
        isLedger
          ? ledger.row
          : `${styles.card} ${mountEntranceDelayMs === null ? '' : styles.cardEnter}`
      }
      style={entranceStyle}
    >
      <header className={isLedger ? ledger.identity : styles.head}>
        {!isLedger && (
          <span
            className={styles.iconWrap}
            title={typeLabel}
            style={
              isThemeSurfaceIconProvider(entry.type)
                ? { background: getThemeSurfaceIconBackground(resolvedTheme) }
                : undefined
            }
          >
            {iconSrc ? (
              <img src={iconSrc} alt="" className={styles.icon} />
            ) : (
              <span className={styles.iconFallback}>{typeLabel.slice(0, 1).toUpperCase()}</span>
            )}
          </span>
        )}
        <span className={styles.fileName} title={displayName}>
          {displayName}
        </span>
        {splitBody && status === 'success' && quota && (
          <adapter.Body quota={quota} classes={classes} section="metadata" />
        )}
        {quota?.refreshing && (
          <span className={styles.cacheStatus} role="status">
            {t('quota_management.refreshing_cached')}
          </span>
        )}
        {quota?.refreshError && (
          <span className={styles.cacheStatus} role="status">
            {t('quota_management.cached_refresh_failed')}
          </span>
        )}
      </header>

      <div className={isLedger ? ledger.metrics : styles.body}>
        {entry.type === 'claude' && status === 'success' && (
          <>
            <div className={classes.codexPlan}>
              <span className={classes.codexPlanItem}>
                <span className={classes.codexPlanLabel}>{t('claude_reset.remaining')}</span>
                <span className={classes.codexPlanValue}>{claudeReset.count ?? '--'}</span>
              </span>
            </div>
            {claudeReset.message && (
              <div role="status" className={classes.codexResetCreditsError}>
                {t(`claude_reset.${claudeReset.message}`)}
              </div>
            )}
          </>
        )}
        {status === 'idle' ? (
          <button
            type="button"
            className={styles.idleBody}
            onClick={onRefresh}
            disabled={!canRefresh}
          >
            <IconRefreshCw size={15} aria-hidden="true" className={styles.idleGlyph} />
            <span className={styles.idleHint}>{t(`${adapter.i18nPrefix}.idle`)}</span>
          </button>
        ) : loading ? (
          <div className={styles.skeleton} aria-busy="true">
            <span className={styles.srOnly}>{t(`${adapter.i18nPrefix}.loading`)}</span>
            {[0, 1].map((row) => (
              <div key={row} className={styles.skeletonRow} aria-hidden="true">
                <span className={styles.skeletonLabel} />
                <span className={styles.skeletonTrack} />
              </div>
            ))}
          </div>
        ) : status === 'error' ? (
          <div className={styles.errorStrip} role="alert">
            {t(`${adapter.i18nPrefix}.load_failed`, { message: errorMessage })}
          </div>
        ) : quota ? (
          <adapter.Body
            quota={quota}
            classes={classes}
            section={splitBody ? 'limits' : undefined}
          />
        ) : (
          <div className={styles.idleHint}>{t(`${adapter.i18nPrefix}.idle`)}</div>
        )}
      </div>

      {status !== 'idle' && (
        <footer className={isLedger ? ledger.actions : styles.actionRow}>
          {entry.type === 'claude' && (
            <button
              type="button"
              className={isLedger ? ledger.action : styles.actionPill}
              disabled={claudeReset.blocked}
              onClick={claudeReset.confirm}
              title={t(`claude_reset.${claudeReset.buttonLabel}`)}
            >
              <IconRefreshCw size={13} className={claudeReset.busy ? styles.spinning : undefined} />
              {t(`claude_reset.${claudeReset.buttonLabel}`)}
            </button>
          )}
          {showReset && (
            <button
              type="button"
              className={isLedger ? ledger.action : styles.actionPill}
              onClick={onReset}
              disabled={!canRefresh || loading || Boolean(quota?.refreshing) || resetting}
              title={t('codex_quota.reset_button')}
            >
              <IconRefreshCw size={13} className={resetting ? styles.spinning : undefined} />
              {t('codex_quota.reset_button')}
            </button>
          )}
          <button
            type="button"
            className={isLedger ? ledger.action : styles.actionPill}
            onClick={onRefresh}
            disabled={isQuotaRefreshDisabled(
              canRefresh,
              loading || Boolean(quota?.refreshing),
              resetting || claudeReset.busy
            )}
            title={t('auth_files.quota_refresh_hint')}
          >
            <IconRefreshCw size={13} className={loading ? styles.spinning : undefined} />
            {t('auth_files.quota_refresh_single')}
          </button>
        </footer>
      )}
    </article>
  );
}
