import { useMemo, useState } from 'react';
import { evaluateRule, testPattern, validateMatch } from '../core/matcher';
import { cloneRule } from '../core/rules';
import type {
  GroupNameMode,
  MatchMode,
  MatchTarget,
  Rule,
  TabInfo,
} from '../core/types';
import { ColorDot, ColorPicker } from '../ui/components';
import styles from './options.module.css';

const TARGETS: Array<{ value: MatchTarget; label: string }> = [
  { value: 'title', label: 'Title' },
  { value: 'url', label: 'URL' },
  { value: 'both', label: 'Title or URL' },
];

const MODES: Array<{ value: MatchMode; label: string }> = [
  { value: 'regex', label: 'Regular expression' },
  { value: 'wildcard', label: 'Wildcard (* ?)' },
  { value: 'contains', label: 'Contains' },
  { value: 'startsWith', label: 'Starts with' },
  { value: 'endsWith', label: 'Ends with' },
  { value: 'exact', label: 'Exact match' },
  { value: 'domain', label: 'Domain' },
];

const GROUP_MODES: Array<{ value: GroupNameMode; label: string }> = [
  { value: 'perMatch', label: 'One group per match (dynamic)' },
  { value: 'fixed', label: 'One fixed group' },
  { value: 'template', label: 'One group, templated title' },
];

export function RuleEditor({
  rule,
  tabs,
  onSave,
  onCancel,
}: {
  rule: Rule;
  tabs: TabInfo[];
  onSave: (rule: Rule) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Rule>(() => cloneRule(rule));
  const [sample, setSample] = useState('');

  const isRegex = draft.match.mode === 'regex';
  const error = validateMatch(draft.match);
  const ignoreCase = isRegex
    ? (draft.match.flags ?? 'i').includes('i')
    : !(draft.match.caseSensitive ?? false);

  const updateMatch = (patch: Partial<Rule['match']>) =>
    setDraft((current) => ({ ...current, match: { ...current.match, ...patch } }));
  const updateGroup = (patch: Partial<Rule['group']>) =>
    setDraft((current) => ({ ...current, group: { ...current.group, ...patch } }));
  const updateOptions = (patch: Partial<NonNullable<Rule['options']>>) =>
    setDraft((current) => ({ ...current, options: { ...(current.options ?? {}), ...patch } }));

  const setIgnoreCase = (value: boolean) => {
    if (isRegex) {
      const flags = (draft.match.flags ?? 'i').replace(/i/g, '');
      updateMatch({ flags: value ? `${flags}i` : flags });
    } else {
      updateMatch({ caseSensitive: !value });
    }
  };

  const matches = useMemo(
    () =>
      tabs
        .map((tab) => ({ tab, result: evaluateRule({ ...draft, enabled: true }, tab) }))
        .filter((row): row is { tab: TabInfo; result: NonNullable<typeof row.result> } => row.result !== null),
    [draft, tabs],
  );

  const sampleOutcome = useMemo(
    () => (sample.trim() ? testPattern(draft.match, sample) : null),
    [draft.match, sample],
  );

  return (
    <div className={styles.editor}>
      <div className={styles.editorHeader}>
        <span className={styles.editorTitle}>{rule.name ? 'Edit rule' : 'New rule'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className={styles.btn} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={Boolean(error) || !draft.match.pattern.trim()}
            onClick={() => onSave(draft)}
          >
            Save rule
          </button>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="rule-name">
          Rule name
        </label>
        <input
          id="rule-name"
          className={styles.input}
          value={draft.name}
          placeholder="e.g. Tickets by ID"
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </div>

      <div className={styles.sectionTitle}>Match</div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="rule-target">
            Match against
          </label>
          <select
            id="rule-target"
            className={styles.select}
            value={draft.match.target}
            onChange={(event) => updateMatch({ target: event.target.value as MatchTarget })}
          >
            {TARGETS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="rule-mode">
            Pattern type
          </label>
          <select
            id="rule-mode"
            className={styles.select}
            value={draft.match.mode}
            onChange={(event) => updateMatch({ mode: event.target.value as MatchMode })}
          >
            {MODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="rule-pattern">
          Pattern
        </label>
        <input
          id="rule-pattern"
          className={`${styles.input} ${styles.mono}`}
          value={draft.match.pattern}
          spellCheck={false}
          placeholder="ticket-(\\d+)"
          onChange={(event) => updateMatch({ pattern: event.target.value })}
        />
        {error ? <div className={styles.error}>{error}</div> : null}
      </div>

      <div className={styles.checkboxRow}>
        <input
          id="rule-ignore-case"
          type="checkbox"
          checked={ignoreCase}
          onChange={(event) => setIgnoreCase(event.target.checked)}
        />
        <label htmlFor="rule-ignore-case">Ignore case</label>
      </div>

      <div className={styles.sectionTitle}>Target group</div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="rule-group-mode">
          Grouping mode
        </label>
        <select
          id="rule-group-mode"
          className={styles.select}
          value={draft.group.mode}
          onChange={(event) => updateGroup({ mode: event.target.value as GroupNameMode })}
        >
          {GROUP_MODES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className={styles.hint}>
          Dynamic mode turns each distinct match into its own group — one rule for{' '}
          <code className={styles.inline}>ticket-\d+</code> produces a group per ticket number, even
          when the tabs come from different sites.
        </span>
      </div>

      {draft.group.mode === 'fixed' ? (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="rule-title">
            Group title
          </label>
          <input
            id="rule-title"
            className={styles.input}
            value={draft.group.title ?? ''}
            placeholder="e.g. Tickets"
            onChange={(event) => updateGroup({ title: event.target.value })}
          />
        </div>
      ) : (
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="rule-template">
              Title template
            </label>
            <input
              id="rule-template"
              className={`${styles.input} ${styles.mono}`}
              value={draft.group.template ?? '$0'}
              placeholder="$0 or ticket-$1"
              onChange={(event) => updateGroup({ template: event.target.value })}
            />
            <span className={styles.hint}>Use $0 (whole match), $1, ${'{name}'}.</span>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="rule-capture-group">
              Capture group
            </label>
            <input
              id="rule-capture-group"
              className={styles.input}
              value={draft.group.captureGroup ?? ''}
              placeholder="1"
              onChange={(event) => {
                const value = event.target.value.trim();
                updateGroup({
                  captureGroup: value === '' ? undefined : /^\d+$/.test(value) ? Number(value) : value,
                });
              }}
            />
          </div>
        </div>
      )}

      <div className={styles.field}>
        <span className={styles.label}>Colour</span>
        <ColorPicker value={draft.group.color} onChange={(color) => updateGroup({ color })} />
      </div>

      <details className={styles.advanced}>
        <summary>Advanced</summary>
        <div className={styles.advancedBody}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="rule-alt">
              Alternative patterns (one per line, OR)
            </label>
            <textarea
              id="rule-alt"
              className={styles.textarea}
              style={{ minHeight: 64 }}
              spellCheck={false}
              value={(draft.match.patterns ?? []).join('\n')}
              onChange={(event) => {
                const lines = event.target.value.split('\n').filter((line) => line.trim());
                updateMatch({ patterns: lines.length ? lines : undefined });
              }}
            />
          </div>

          {isRegex ? (
            <>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="rule-flags">
                  Extra regex flags
                </label>
                <input
                  id="rule-flags"
                  className={`${styles.input} ${styles.mono}`}
                  value={(draft.match.flags ?? 'i').replace(/i/g, '')}
                  placeholder="m s u"
                  onChange={(event) =>
                    updateMatch({
                      flags: `${event.target.value.replace(/[^msuy]/g, '')}${ignoreCase ? 'i' : ''}`,
                    })
                  }
                />
                <span className={styles.hint}>
                  `m`, `s`, `u` only — case sensitivity is the Ignore case checkbox. `g` is added
                  automatically.
                </span>
              </div>
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="rule-capture-pattern">
                    Capture pattern (optional)
                  </label>
                  <input
                    id="rule-capture-pattern"
                    className={`${styles.input} ${styles.mono}`}
                    value={draft.match.capturePattern ?? ''}
                    placeholder="e.g. /issues/(\\d+)"
                    onChange={(event) => updateMatch({ capturePattern: event.target.value || undefined })}
                  />
                  <span className={styles.hint}>Extra regex used only to extract $1, $2 …</span>
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="rule-capture-target">
                    Capture from
                  </label>
                  <select
                    id="rule-capture-target"
                    className={styles.select}
                    value={draft.match.captureTarget ?? draft.match.target}
                    onChange={(event) =>
                      updateMatch({ captureTarget: event.target.value as 'title' | 'url' })
                    }
                  >
                    <option value="title">Title</option>
                    <option value="url">URL</option>
                  </select>
                </div>
              </div>
            </>
          ) : null}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="rule-priority">
              Priority (higher wins)
            </label>
            <input
              id="rule-priority"
              type="number"
              className={styles.input}
              value={draft.priority}
              onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) || 0 })}
            />
          </div>

          <div className={styles.checkboxRow}>
            <input
              id="rule-collapse"
              type="checkbox"
              checked={draft.options?.collapse ?? false}
              onChange={(event) => updateOptions({ collapse: event.target.checked })}
            />
            <label htmlFor="rule-collapse">Collapse the group when created</label>
          </div>
          <div className={styles.checkboxRow}>
            <input
              id="rule-move-end"
              type="checkbox"
              checked={draft.options?.moveToEnd !== false}
              onChange={(event) => updateOptions({ moveToEnd: event.target.checked })}
            />
            <label htmlFor="rule-move-end">Place after other groups</label>
          </div>
          <div className={styles.checkboxRow}>
            <input
              id="rule-pinned"
              type="checkbox"
              checked={draft.options?.includePinned ?? false}
              onChange={(event) => updateOptions({ includePinned: event.target.checked })}
            />
            <label htmlFor="rule-pinned">Include pinned tabs</label>
          </div>
        </div>
      </details>

      <div className={styles.sectionTitle}>Try it</div>
      <div className={styles.field}>
        <input
          className={`${styles.input} ${styles.mono}`}
          placeholder="Paste a sample title or URL…"
          value={sample}
          onChange={(event) => setSample(event.target.value)}
        />
        {sampleOutcome ? (
          sampleOutcome.ok ? (
            <div className={sampleOutcome.results.length ? styles.ok : styles.warn}>
              {sampleOutcome.results.length === 0
                ? 'No match.'
                : `Matches: ${sampleOutcome.results.map((r) => r.match).join(', ')}`}
            </div>
          ) : (
            <div className={styles.error}>{sampleOutcome.error}</div>
          )
        ) : null}
      </div>

      {tabs.length ? (
        <div className={styles.preview}>
          <div className={`${styles.previewRow} ${styles.previewHead}`}>
            <span>Open tab</span>
            <span>Match</span>
            <span>Group</span>
          </div>
          {matches.length === 0 ? (
            <div className={`${styles.previewRow} ${styles.truncate}`}>
              <span className={styles.hint}>No open tab matches this rule.</span>
            </div>
          ) : (
            matches.slice(0, 12).map(({ tab, result }) => (
              <div key={tab.id} className={styles.previewRow}>
                <span className={styles.truncate} title={tab.title ?? tab.url}>
                  {tab.title || tab.url}
                </span>
                <span className={`${styles.truncate} ${styles.mono}`}>{result.match}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ColorDot color={draft.group.color} />
                  <span className={styles.truncate}>{result.groupTitle}</span>
                </span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
