import { useEffect, useState } from 'react';
import { sendMessage } from '../shared/messages';
import { Switch } from '../ui/components';
import { useRuleSet } from '../ui/useRuleSet';
import styles from './popup.module.css';

export function Popup() {
  const store = useRuleSet();
  const [tabCount, setTabCount] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void chrome.tabs.query({ currentWindow: true }).then((tabs) => setTabCount(tabs.length));
  }, []);

  const ruleCount = store.ruleSet?.rules.length ?? 0;
  const enabled = store.ruleSet?.settings.enabled ?? false;

  const runNow = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await sendMessage({ type: 'reconcile-now' });
      if (response.ok && response.kind === 'reconcile') {
        const report = response.reports[0];
        setMessage(
          report
            ? `Grouped ${report.grouped} tab(s) · ${report.createdGroups} new group(s) · ${report.moved} move(s)`
            : 'Done',
        );
      } else if (!response.ok) {
        setMessage(response.error);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.popup}>
      <div className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.mark}>AG</div>
          <div>
            <div className={styles.title}>Auto Group</div>
            <div className={styles.sub}>{enabled ? 'Grouping is on' : 'Grouping is paused'}</div>
          </div>
        </div>
        <Switch
          checked={enabled}
          label="Toggle automatic grouping"
          disabled={!store.ready}
          onChange={(value) => void store.updateSettings({ enabled: value })}
        />
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <strong>{ruleCount}</strong> rules
        </div>
        <div className={styles.stat}>
          <strong>{tabCount}</strong> tabs in this window
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={busy || !store.ready}
          onClick={() => void runNow()}
        >
          {busy ? 'Working…' : 'Run rules on this window'}
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={() => void chrome.runtime.openOptionsPage()}
        >
          Manage rules &amp; import
        </button>
      </div>

      <div className={`${styles.message} ${message ? styles.messageOk : ''}`}>{message}</div>
    </div>
  );
}
