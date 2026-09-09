import { sendMessage } from '../shared/messages';
import { GROUP_COLORS, type GroupColor } from '../core/types';
import { ColorPicker, Switch } from '../ui/components';
import type { RuleSetStore } from '../ui/useRuleSet';
import styles from './options.module.css';

interface ToggleDef {
  key: keyof import('../core/types').Settings;
  label: string;
  hint: string;
}

const TOGGLES: ToggleDef[] = [
  {
    key: 'enabled',
    label: 'Automatic grouping on',
    hint: 'Master switch. Turn off to stop all automatic moves without losing your rules.',
  },
  {
    key: 'enforceGroupOrder',
    label: 'Keep groups on the left',
    hint: 'Groups stay contiguous on the left, ungrouped tabs on the right, so a new group lands after the existing ones.',
  },
  {
    key: 'onlyUngrouped',
    label: 'Leave the user’s groups alone',
    hint: 'Only move tabs that are ungrouped or in groups this extension created.',
  },
  {
    key: 'manageOnlyOwnGroups',
    label: 'Only manage our own groups',
    hint: 'Never add tabs to groups you made by hand.',
  },
  {
    key: 'respectManualMoves',
    label: 'Respect manual moves',
    hint: 'If you drag a tab into or out of a group, don’t undo it until the tab’s title or URL changes.',
  },
  {
    key: 'ignorePinned',
    label: 'Skip pinned tabs',
    hint: 'Pinned tabs are left exactly where they are.',
  },
  {
    key: 'collapseNewGroups',
    label: 'Collapse new groups',
    hint: 'Collapse a group as soon as it is created.',
  },
  {
    key: 'groupExistingOnStartup',
    label: 'Group existing tabs on startup',
    hint: 'Run the rules over every open tab when Chrome starts or the extension loads.',
  },
];

export function SettingsPanel({
  store,
  notify,
}: {
  store: RuleSetStore;
  notify: (message: string, error?: boolean) => void;
}) {
  const settings = store.ruleSet?.settings;
  if (!settings) return null;

  const toggleColor = (color: GroupColor) => {
    const colors = settings.defaultColors.includes(color)
      ? settings.defaultColors.filter((c) => c !== color)
      : [...settings.defaultColors, color];
    void store.updateSettings({ defaultColors: colors.length ? colors : ['blue'] });
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.h1}>Settings</h1>
          <p className={styles.subtitle}>
            Behaviour applies to every window. Changes take effect immediately.
          </p>
        </div>
      </div>

      <div className={styles.card} style={{ padding: 18, marginBottom: 16 }}>
        <div className={styles.sectionTitle}>Behaviour</div>
        {TOGGLES.map((toggle) => (
          <div
            key={toggle.key}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: 14,
              padding: '10px 0',
              borderBottom: '1px solid var(--border)',
              alignItems: 'start',
            }}
          >
            <Switch
              checked={Boolean(settings[toggle.key])}
              label={toggle.label}
              onChange={(value) => void store.updateSettings({ [toggle.key]: value })}
            />
            <div>
              <div style={{ fontWeight: 600 }}>{toggle.label}</div>
              <div className={styles.hint}>{toggle.hint}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.card} style={{ padding: 18, marginBottom: 16 }}>
        <div className={styles.sectionTitle}>Dynamic group colours</div>
        <p className={styles.hint} style={{ marginTop: 0 }}>
          Colour rotation used when a rule does not set a colour itself.
        </p>
        <div className={styles.chipRow}>
          {GROUP_COLORS.map((color) => (
            <label key={color} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={settings.defaultColors.includes(color)}
                onChange={() => toggleColor(color)}
                style={{ accentColor: 'var(--accent)' }}
              />
              {color}
            </label>
          ))}
        </div>
        <div className={styles.field} style={{ marginTop: 12 }}>
          <span className={styles.label}>Preview</span>
          <ColorPicker
            value={settings.defaultColors[0]}
            allowNone={false}
            onChange={() => undefined}
          />
        </div>
      </div>

      <div className={styles.card} style={{ padding: 18 }}>
        <div className={styles.sectionTitle}>Actions</div>
        <div className={styles.toolbar} style={{ marginBottom: 0 }}>
          <button
            type="button"
            className={styles.btn}
            onClick={async () => {
              const response = await sendMessage({ type: 'reconcile-now' });
              if (response.ok && response.kind === 'reconcile') {
                const report = response.reports[0];
                notify(
                  report
                    ? `Grouped ${report.grouped} tab(s), ${report.createdGroups} new group(s), ${report.moved} move(s)`
                    : 'Done',
                );
              } else if (!response.ok) {
                notify(response.error, true);
              }
            }}
          >
            Run rules on this window now
          </button>
          <span className={styles.hint}>
            Debounce before a window is reconciled: {settings.debounceMs} ms
          </span>
        </div>
      </div>
    </div>
  );
}
