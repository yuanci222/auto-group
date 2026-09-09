import { useState } from 'react';
import { evaluateRule } from '../core/matcher';
import type { Plan } from '../core/plan';
import { sendMessage } from '../shared/messages';
import type { TabInfo } from '../core/types';
import { Badge, ColorDot } from '../ui/components';
import type { RuleSetStore } from '../ui/useRuleSet';
import styles from './options.module.css';

export function TestPanel({ store, tabs }: { store: RuleSetStore; tabs: TabInfo[] }) {
  const [sample, setSample] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = store.ruleSet?.rules ?? [];
  const trimmed = sample.trim();

  const hits = trimmed
    ? rules
        .map((rule) => ({ rule, result: evaluateRule(rule, { id: 0, windowId: 0, index: 0, pinned: false, groupId: -1, title: trimmed, url: trimmed }) }))
        .filter((row) => row.result !== null)
    : [];

  const runPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await sendMessage({ type: 'preview' });
      if (response.ok && response.kind === 'preview') setPlan(response.plan);
      else setError(!response.ok ? response.error : 'Unexpected response');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.h1}>Test</h1>
          <p className={styles.subtitle}>
            Check what a rule does before you rely on it. The tester matches against the string as
            both a title and a URL.
          </p>
        </div>
      </div>

      <div className={styles.card} style={{ padding: 18, marginBottom: 16 }}>
        <div className={styles.sectionTitle}>Test a title or URL</div>
        <input
          className={`${styles.input} ${styles.mono}`}
          placeholder="e.g. Fix ticket-123 before release"
          value={sample}
          onChange={(event) => setSample(event.target.value)}
        />
        {trimmed ? (
          <div className={styles.preview} style={{ marginTop: 12 }}>
            <div className={`${styles.previewRow} ${styles.previewHead}`}>
              <span>Rule</span>
              <span>Matched text</span>
              <span>Group</span>
            </div>
            {hits.length === 0 ? (
              <div className={styles.previewRow}>
                <span className={styles.hint}>No rule matches.</span>
              </div>
            ) : (
              hits.map(({ rule, result }) => (
                <div key={rule.id} className={styles.previewRow}>
                  <span className={styles.truncate}>
                    {rule.name} {rule.enabled ? null : <Badge>disabled</Badge>}
                  </span>
                  <span className={`${styles.truncate} ${styles.mono}`}>{result!.match}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ColorDot color={rule.group.color} />
                    <span className={styles.truncate}>{result!.groupTitle}</span>
                  </span>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className={styles.card} style={{ padding: 18 }}>
        <div className={styles.sectionTitle}>Dry-run on the current window</div>
        <p className={styles.hint} style={{ marginTop: 0 }}>
          Runs the real planner against your {tabs.length} open tab{tabs.length === 1 ? '' : 's'}{' '}
          without touching anything.
        </p>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy} onClick={() => void runPreview()}>
          {busy ? 'Planning…' : 'Preview current window'}
        </button>
        {error ? <div className={styles.error}>{error}</div> : null}

        {plan ? (
          <>
            <div className={styles.statRow} style={{ marginTop: 14 }}>
              <div className={styles.stat}>
                <strong>{plan.actions.length}</strong> tab moves
              </div>
              <div className={styles.stat}>
                <strong>{plan.createGroups.length}</strong> new groups
              </div>
            </div>
            {plan.createGroups.length ? (
              <div className={styles.chipRow} style={{ marginBottom: 12 }}>
                {plan.createGroups.map((group) => (
                  <Badge key={group.key} accent>
                    <ColorDot color={group.color} />
                    {group.title}
                  </Badge>
                ))}
              </div>
            ) : null}
            <div className={styles.preview}>
              <div className={`${styles.previewRow} ${styles.previewHead}`}>
                <span>Tab</span>
                <span>Matched</span>
                <span>Group</span>
              </div>
              {plan.actions.length === 0 ? (
                <div className={styles.previewRow}>
                  <span className={styles.hint}>Nothing to do — every matching tab is already grouped.</span>
                </div>
              ) : (
                plan.actions.map((action) => {
                  const tab = tabs.find((t) => t.id === action.tabId);
                  return (
                    <div key={action.tabId} className={styles.previewRow}>
                      <span className={styles.truncate} title={tab?.title ?? tab?.url}>
                        {tab?.title || tab?.url || `Tab ${action.tabId}`}
                      </span>
                      <span className={`${styles.truncate} ${styles.mono}`}>{action.match.match}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ColorDot color={action.color} />
                        <span className={styles.truncate}>{action.title}</span>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
