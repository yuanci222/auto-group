/**
 * Exporters. The native format is lossless; the Tab Modifier exporter tries to
 * round-trip imported rules (including unknown fields via `source.raw`).
 */
import { newId } from './rules';
import type { MatchMode, Rule, RuleSet } from './types';
import { DEFAULT_SETTINGS } from './types';

export const NATIVE_FILE_VERSION = 1;

export function exportNative(ruleSet: RuleSet): string {
  return JSON.stringify(
    {
      version: NATIVE_FILE_VERSION,
      name: ruleSet.name ?? 'Auto Group rules',
      rules: ruleSet.rules,
      settings: ruleSet.settings,
    },
    null,
    2,
  );
}

/** Rules only, no settings — handy for sharing a rule pack. */
export function exportRulesOnly(ruleSet: RuleSet): string {
  return JSON.stringify({ version: NATIVE_FILE_VERSION, rules: ruleSet.rules }, null, 2);
}

function toTabModifierDetection(mode: MatchMode): string {
  switch (mode) {
    case 'startsWith':
      return 'STARTS_WITH';
    case 'endsWith':
      return 'ENDS_WITH';
    case 'exact':
      return 'EXACT';
    case 'regex':
    case 'wildcard':
    case 'domain':
      return 'REGEX';
    case 'contains':
    default:
      return 'CONTAINS';
  }
}

/**
 * Tabee: Tab Modifier `{rules, groups, settings}` format. Group titles carry
 * the invisible `U+200B` marker Tabee uses to recognise its own groups.
 */
export function exportTabModifier(ruleSet: RuleSet): string {
  const groupIdByTitle = new Map<string, string>();
  const groups: Array<{ id: string; title: string; color: string; collapsed: boolean }> = [];

  const ensureGroup = (title: string, color: string, collapsed: boolean): string => {
    const key = title.trim().toLocaleLowerCase();
    const existing = groupIdByTitle.get(key);
    if (existing) return existing;
    const id = newId('g').slice(0, 7);
    groupIdByTitle.set(key, id);
    groups.push({ id, title: `${title}\u200b`, color, collapsed });
    return id;
  };

  const rules = ruleSet.rules.map((rule) => {
    const raw = rule.source?.format === 'tab-modifier' ? rule.source.raw : undefined;
    const rawTab = (raw?.tab ?? {}) as Record<string, unknown>;
    const title = rule.group.title ?? rule.group.template ?? rule.name;
    const color = rule.group.color ?? 'grey';
    const groupId = rule.group.mode === 'fixed' ? ensureGroup(title, color, rule.options?.collapse ?? false) : null;

    const tab: Record<string, unknown> = {
      title: typeof rawTab.title === 'string' ? rawTab.title : null,
      icon: rawTab.icon ?? null,
      muted: rawTab.muted ?? false,
      pinned: rawTab.pinned ?? false,
      protected: rawTab.protected ?? false,
      unique: rawTab.unique ?? false,
      group_id: groupId,
      title_matcher: rawTab.title_matcher ?? null,
      url_matcher:
        typeof rawTab.url_matcher === 'string' ? rawTab.url_matcher : rule.match.capturePattern ?? null,
    };

    return {
      id: rule.source?.ruleId ?? rule.id,
      is_enabled: rule.enabled,
      name: rule.name,
      detection: toTabModifierDetection(rule.match.mode),
      url_fragment: rule.match.pattern,
      tab,
    };
  });

  return JSON.stringify(
    {
      rules,
      groups,
      settings: {
        enable_new_version_notification: false,
        theme: 'tabee',
        lightweight_mode_enabled: false,
        lightweight_mode_patterns: [],
        lightweight_mode_apply_to_rules: true,
        lightweight_mode_apply_to_tab_hive: true,
        auto_close_enabled: false,
        auto_close_timeout: 30,
        tab_hive_reject_list: [],
        debug_mode: false,
      },
    },
    null,
    4,
  );
}

/** Markdown table of the rules, for pasting into a README or issue. */
export function exportMarkdown(ruleSet: RuleSet): string {
  const lines = [
    `# ${ruleSet.name ?? 'Auto Group rules'}`,
    '',
    '| Rule | Target | Mode | Pattern | Group | Enabled |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const rule of ruleSet.rules) {
    const group =
      rule.group.mode === 'fixed'
        ? rule.group.title ?? ''
        : `${rule.group.mode}: ${rule.group.template ?? '$0'}`;
    lines.push(
      `| ${rule.name} | ${rule.match.target} | ${rule.match.mode} | \`${rule.match.pattern.replace(/\|/g, '\\|')}\` | ${group} | ${rule.enabled ? 'yes' : 'no'} |`,
    );
  }
  return lines.join('\n');
}

export type ExportFormat = 'native' | 'tab-modifier' | 'markdown';

export interface ExportOption {
  id: ExportFormat;
  label: string;
  extension: string;
  description: string;
}

export const EXPORT_OPTIONS: ExportOption[] = [
  {
    id: 'native',
    label: 'Auto Group (JSON)',
    extension: 'json',
    description: 'Lossless backup: rules + settings. Import merges without overwriting.',
  },
  {
    id: 'tab-modifier',
    label: 'Tabee / Tab Modifier (JSON)',
    extension: 'json',
    description: 'Compatible with tabee.config.json so Tab Modifier users can import it.',
  },
  {
    id: 'markdown',
    label: 'Markdown table',
    extension: 'md',
    description: 'Human readable summary of the rules.',
  },
];

export function exportRuleSet(ruleSet: RuleSet, format: ExportFormat): string {
  switch (format) {
    case 'tab-modifier':
      return exportTabModifier(ruleSet);
    case 'markdown':
      return exportMarkdown(ruleSet);
    case 'native':
    default:
      return exportNative(ruleSet);
  }
}

export function defaultSettings(): typeof DEFAULT_SETTINGS {
  return { ...DEFAULT_SETTINGS };
}
