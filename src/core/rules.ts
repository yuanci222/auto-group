/**
 * Rule construction helpers and identity/deduplication logic.
 */
import type {
  GroupNameMode,
  GroupColor,
  MatchMode,
  MatchTarget,
  Rule,
  RuleGroup,
  RuleMatch,
  RuleOptions,
  RuleSet,
  Settings,
} from './types';
import { DEFAULT_SETTINGS } from './types';

export function newId(prefix = 'rule'): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${uuid.replace(/-/g, '').slice(0, 12)}`;
}

export interface RuleInit {
  name?: string;
  enabled?: boolean;
  pattern: string;
  patterns?: string[];
  target?: MatchTarget;
  mode?: MatchMode;
  flags?: string;
  caseSensitive?: boolean;
  capturePattern?: string;
  captureTarget?: 'title' | 'url';
  groupMode?: GroupNameMode;
  title?: string;
  template?: string;
  color?: GroupColor;
  colors?: GroupColor[];
  captureGroup?: number | string;
  priority?: number;
  options?: RuleOptions;
  note?: string;
  source?: Rule['source'];
  id?: string;
}

export function createRule(init: RuleInit): Rule {
  const match: RuleMatch = {
    pattern: init.pattern,
    target: init.target ?? 'url',
    mode: init.mode ?? 'regex',
    flags: init.flags ?? 'i',
  };
  if (init.patterns?.length) match.patterns = init.patterns;
  if (init.caseSensitive !== undefined) match.caseSensitive = init.caseSensitive;
  if (init.capturePattern !== undefined) match.capturePattern = init.capturePattern;
  if (init.captureTarget !== undefined) match.captureTarget = init.captureTarget;

  const group: RuleGroup = {
    mode: init.groupMode ?? 'fixed',
  };
  if (init.title !== undefined) group.title = init.title;
  if (init.template !== undefined) group.template = init.template;
  if (init.color !== undefined) group.color = init.color;
  if (init.colors?.length) group.colors = init.colors;
  if (init.captureGroup !== undefined) group.captureGroup = init.captureGroup;

  const rule: Rule = {
    id: init.id ?? newId(),
    name: init.name ?? init.title ?? init.pattern,
    enabled: init.enabled ?? true,
    match,
    group,
    priority: init.priority ?? 0,
  };
  if (init.options) rule.options = init.options;
  if (init.note) rule.note = init.note;
  if (init.source) rule.source = init.source;
  return rule;
}

/** Stable identity used to deduplicate rules during import. */
export function ruleKey(rule: Rule): string {
  const patterns = [rule.match.pattern, ...(rule.match.patterns ?? [])]
    .map((p) => p.trim())
    .sort()
    .join('|');
  return [
    rule.match.mode,
    rule.match.target,
    patterns,
    rule.group.mode,
    (rule.group.title ?? '').trim(),
    (rule.group.template ?? '').trim(),
  ]
    .join('\u0000')
    .toLocaleLowerCase();
}

export function cloneRule(rule: Rule, overrides: Partial<Rule> = {}): Rule {
  return {
    ...rule,
    ...overrides,
    match: { ...rule.match, ...(overrides.match ?? {}) },
    group: { ...rule.group, ...(overrides.group ?? {}) },
    options: overrides.options ?? (rule.options ? { ...rule.options } : undefined),
  };
}

export function normaliseSettings(settings?: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
}

export function normaliseRuleSet(input: Partial<RuleSet> | undefined): RuleSet {
  return {
    version: typeof input?.version === 'number' ? input.version : 1,
    name: input?.name,
    rules: Array.isArray(input?.rules) ? input.rules.map(sanitiseRule) : [],
    settings: normaliseSettings(input?.settings),
  };
}

/** Defensive normalisation for rules coming from a file. */
export function sanitiseRule(input: unknown): Rule {
  const raw = (input ?? {}) as Record<string, unknown>;
  const match = (raw.match ?? {}) as Record<string, unknown>;
  const group = (raw.group ?? {}) as Record<string, unknown>;
  const options = (raw.options ?? undefined) as Record<string, unknown> | undefined;

  const rule = createRule({
    id: typeof raw.id === 'string' ? raw.id : undefined,
    name: typeof raw.name === 'string' ? raw.name : undefined,
    enabled: raw.enabled !== false,
    pattern: typeof match.pattern === 'string' ? match.pattern : '',
    patterns: Array.isArray(match.patterns) ? match.patterns.filter((p): p is string => typeof p === 'string') : undefined,
    target: (match.target as MatchTarget) ?? 'url',
    mode: (match.mode as MatchMode) ?? 'regex',
    flags: typeof match.flags === 'string' ? match.flags : 'i',
    caseSensitive: typeof match.caseSensitive === 'boolean' ? match.caseSensitive : undefined,
    groupMode: (group.mode as GroupNameMode) ?? 'fixed',
    title: typeof group.title === 'string' ? group.title : undefined,
    template: typeof group.template === 'string' ? group.template : undefined,
    color: group.color as GroupColor | undefined,
    colors: Array.isArray(group.colors) ? (group.colors as GroupColor[]) : undefined,
    captureGroup:
      typeof group.captureGroup === 'number' || typeof group.captureGroup === 'string'
        ? group.captureGroup
        : undefined,
    priority: typeof raw.priority === 'number' ? raw.priority : 0,
    note: typeof raw.note === 'string' ? raw.note : undefined,
    source: raw.source as Rule['source'],
    options: options as RuleOptions | undefined,
  });
  return rule;
}
