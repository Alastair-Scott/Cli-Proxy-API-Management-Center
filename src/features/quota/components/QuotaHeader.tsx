import { useTranslation } from 'react-i18next';
import { IconRefreshCw } from '@/components/ui/icons';
import styles from './QuotaHeader.module.scss';

export type QuotaHeaderProps = {
  showEmails?: boolean;
  onToggleEmails?: () => void;
  totalCount: number;
  loadedCount: number;
  attentionCount: number;
  refreshing: boolean;
  disableControls: boolean;
  onRefreshAll: () => void;
};

/** Quota totals and explicit refresh/privacy controls. */
export function QuotaHeader(props: QuotaHeaderProps) {
  const { totalCount, loadedCount, attentionCount, refreshing, disableControls, onRefreshAll } =
    props;
  const { t } = useTranslation();

  return (
    <header className={styles.header}>
      <div className={styles.copy}>
        <h1 className={styles.title} data-reveal>
          {t('quota_management.title')}
        </h1>
        <p className={styles.meta} data-reveal>
          <span className={styles.metaTotal}>
            {t('quota_management.meta_credentials', { count: totalCount })}
          </span>
          <span className={styles.metaDot} aria-hidden="true">
            ·
          </span>
          <span className={loadedCount > 0 ? styles.metaLoaded : styles.metaMuted}>
            {t('quota_management.meta_loaded', { count: loadedCount })}
          </span>
          {attentionCount > 0 && (
            <>
              <span className={styles.metaDot} aria-hidden="true">
                ·
              </span>
              <span className={styles.metaAttention}>
                {t('quota_management.meta_attention', { count: attentionCount })}
              </span>
            </>
          )}
        </p>
      </div>
      <div className={styles.actions} data-reveal>
        {props.onToggleEmails && (
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={props.onToggleEmails}
            aria-pressed={props.showEmails}
          >
            {t(props.showEmails ? 'quota_management.hide_emails' : 'quota_management.show_emails')}
          </button>
        )}
        <button
          type="button"
          className={styles.primaryAction}
          onClick={onRefreshAll}
          disabled={disableControls || refreshing}
        >
          <IconRefreshCw size={14} className={refreshing ? styles.spinning : undefined} />
          {t('quota_management.refresh_all_credentials')}
        </button>
      </div>
    </header>
  );
}
