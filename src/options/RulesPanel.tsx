import { useMemo, useState } from 'react';
import { createRule, cloneRule, newId } from '../core/rules';
import { validateMatch } from '../core/matcher';
import type { Rule, TabInfo } from '../core/types';
import { Badge, ColorDot, Switch } from '../ui/components';
import type { RuleSetStore } from '../ui/useRuleSet';
import { EXAMPLE_RULES } from './examples';
import { RuleEditor } from './RuleEditor';
import styles from './options.module.css';

const MODE_LABEL: Record<Rule['match']['mode'], string> = {
  regex: 'regex',
  wildcard: 'wildcard',
  contains: 'contains',
  startsWith: 'starts with',
  endsWith: 'ends with',
  exact: 'exact',
  domain: 'domain',
};

function groupLabel(rule: Rule): string {
  switch (rule.group.mode) {
    case 'fixed':
      return rule.group.title ?? '(untitled)';
    case 'perMatch':
      return `per match → ${rule.group.template ?? '$0'}`;
    case 'template':
      return rule.group.template ?? '$0';
  }
}

export function RulesPanel({
  store,
  tabs,
  notify,
}: {
  store: RuleSetStore;
  tabs: TabInfo[];
  notify: (message: string, error?: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Rule | null>(null);
  const [showExamples, setShowExamples] = useState(false);

  const rules = store.ruleSet?.rules ?? [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rules;
    return rules.filter(
      (rule) =>
        rule.name.toLowerCase().includes(needle) ||
        rule.match.pattern.toLowerCase().includes(needle) ||
        groupLabel(rule).toLowerCase().includes(needle),
    );
  }, [rules, query]);

  const invalidCount = rules.filter((rule) => validateMatch(rule.match)).length;

  const saveRule = async (rule: Rule) => {
    if (rules.some((existing) => existing.id === rule.id)) await store.replaceRule(rule);
    else await store.addRule(rule);
    setEditing(null);
    notify('Rule saved');
  };

  const addExample = async (index: number) => {
    const example = EXAMPLE_RULES[index];
    if (!example) return;
    await store.addRule(example.build());
    notify(`Added example: ${example.label}`);
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.h1}>Rules</h1>
          <p className={styles.subtitle}>
            Rules run top-down by priority whenever a tab is opened, its title changes, or its URL
            changes. The first match wins.
          </p>
        </div>
      </div>

      {editing ? (
        <RuleEditor
          rule={editing}
          tabs={tabs}
          onSave={saveRule}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      <div className={styles.toolbar}>
        <input
          className={styles.input}
          style={{ maxWidth: 280 }}
          placeholder="Search rules…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className={styles.spacer} />
        <button type="button" className={styles.btn} onClick={() => setShowExamples((v) => !v)}>
          Examples
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() =>
            setEditing(
              createRule({
                pattern: '',
                target: 'title',
                mode: 'regex',
                groupMode: 'perMatch',
                template: '$0',
              }),
            )
          }
        >
          + New rule
        </button>
      </div>

      {showExamples ? (
        <div className={`${styles.card} ${styles.panel}`} style={{ marginBottom: 14 }}>
          <div className={styles.sectionTitle}>Starter rules</div>
          <div className={styles.exampleList}>
            {EXAMPLE_RULES.map((example, index) => (
              <div key={example.label} className={styles.exampleCard}>
                <div>
                  <div style={{ fontWeight: 600 }}>{example.label}</div>
                  <div className={styles.hint}>{example.description}</div>
                </div>
                <button type="button" className={styles.btn} onClick={() => void addExample(index)}>
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {invalidCount > 0 ? (
        <div className={styles.warn} style={{ marginBottom: 10 }}>
          {invalidCount} rule{invalidCount === 1 ? ' has' : 's have'} an invalid pattern and will be
          skipped.
        </div>
      ) : null}

      {rules.length === 0 ? (
        <div className={`${styles.card} ${styles.empty}`}>
          <div className={styles.emptyTitle}>No rules yet</div>
          <p>Add a rule, or load one of the starter examples to see how matching works.</p>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => setShowExamples(true)}
          >
            Browse examples
          </button>
        </div>
      ) : (
        <div className={styles.ruleList}>
          {filtered.map((rule) => {
            const error = validateMatch(rule.match);
            return (
              <div key={rule.id} className={`${styles.card} ${styles.ruleCard}`}>
                <Switch
                  checked={rule.enabled}
                  label={`Enable ${rule.name}`}
                  onChange={(value) => void store.toggleRule(rule.id, value)}
                />
                <div className={styles.ruleMain}>
                  <div className={`${styles.ruleName} ${rule.enabled ? '' : styles.ruleNameDisabled}`}>
                    {rule.name || '(untitled rule)'}
                    {rule.priority !== 0 ? <Badge>priority {rule.priority}</Badge> : null}
                    {rule.source ? <Badge>from {rule.source.format}</Badge> : null}
                  </div>
                  <div className={styles.ruleMeta}>
                    <Badge accent>{rule.match.target === 'both' ? 'title + url' : rule.match.target}</Badge>
                    <Badge>{MODE_LABEL[rule.match.mode]}</Badge>
                    {rule.match.patterns?.length ? <Badge>+{rule.match.patterns.length} alt</Badge> : null}
                  </div>
                  <code className={styles.pattern}>{rule.match.pattern}</code>
                  {error ? <div className={styles.error}>{error}</div> : null}
                  <div className={styles.groupRow}>
                    <ColorDot color={rule.group.color} />
                    <span>
                      {rule.group.mode === 'fixed' ? 'Group: ' : 'Dynamic groups: '}
                      <strong>{groupLabel(rule)}</strong>
                    </span>
                  </div>
                </div>
                <div className={styles.ruleActions}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    onClick={() => setEditing(cloneRule(rule))}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    title="Duplicate"
                    onClick={() =>
                      void store.addRule({
                        ...cloneRule(rule),
                        id: newId(),
                        name: `${rule.name} copy`,
                      })
                    }
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnDanger}`}
                    onClick={() => {
                      void store.removeRule(rule.id);
                      notify('Rule deleted');
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 ? (
            <div className={`${styles.card} ${styles.empty}`}>No rule matches “{query}”.</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
