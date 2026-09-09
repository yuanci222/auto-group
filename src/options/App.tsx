import { useState } from 'react';
import { sendMessage } from '../shared/messages';
import { Toast, useToast } from '../ui/components';
import { useTabs } from '../ui/useTabs';
import { useRuleSet, useDraftRules } from '../ui/useRuleSet';
import { HelpPanel } from './HelpPanel';
import { RulesPanel } from './RulesPanel';
import { SettingsPanel } from './SettingsPanel';
import { TestPanel } from './TestPanel';
import { TransferPanel } from './TransferPanel';
import styles from './options.module.css';

type Section = 'rules' | 'test' | 'transfer' | 'settings' | 'help';

const NAV: Array<{ id: Section; label: string }> = [
  { id: 'rules', label: 'Rules' },
  { id: 'test', label: 'Test' },
  { id: 'transfer', label: 'Import & export' },
  { id: 'settings', label: 'Settings' },
  { id: 'help', label: 'How it works' },
];

export function App() {
  const store = useRuleSet();
  const draftRules = useDraftRules(store);
  const tabs = useTabs();
  const { toast, show } = useToast();
  const [section, setSection] = useState<Section>('rules');
  const [reconciling, setReconciling] = useState(false);

  const ruleCount = draftRules.rules.length;

  const reconcileNow = async () => {
    setReconciling(true);
    try {
      const response = await sendMessage({ type: 'reconcile-now' });
      if (response.ok && response.kind === 'reconcile') {
        const report = response.reports[0];
        show(
          report
            ? `Grouped ${report.grouped} tab(s), created ${report.createdGroups} group(s), moved ${report.moved}`
            : 'Done',
        );
      } else if (!response.ok) {
        show(response.error, true);
      }
    } catch (err) {
      show(err instanceof Error ? err.message : 'Reconcile failed', true);
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>AG</div>
          <div>
            <div className={styles.brandName}>Auto Group</div>
            <div className={styles.brandSub}>regex tab grouping</div>
          </div>
        </div>

        <nav className={styles.nav}>
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.navItem} ${section === item.id ? styles.navItemActive : ''}`}
              onClick={() => setSection(item.id)}
            >
              <span>{item.label}</span>
              {item.id === 'rules' ? <span className={styles.navCount}>{ruleCount}</span> : null}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={reconciling}
            onClick={() => void reconcileNow()}
          >
            {reconciling ? 'Working…' : 'Run rules now'}
          </button>
          <p style={{ marginTop: 12 }}>
            {store.ruleSet?.settings.enabled ? 'Grouping is on' : 'Grouping is off'} · {tabs.length}{' '}
            open tabs
          </p>
        </div>
      </aside>

      <main className={styles.main}>
        {!store.ready ? (
          <div className={styles.empty}>Loading rules…</div>
        ) : section === 'rules' ? (
          <RulesPanel draft={draftRules} tabs={tabs} />
        ) : section === 'test' ? (
          <TestPanel store={store} tabs={tabs} />
        ) : section === 'transfer' ? (
          <TransferPanel store={store} notify={show} />
        ) : section === 'settings' ? (
          <SettingsPanel store={store} notify={show} />
        ) : (
          <HelpPanel />
        )}
      </main>

      <Toast toast={toast} />
    </div>
  );
}
