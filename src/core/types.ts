/**
 * Canonical domain model for Auto Group.
 *
 * Everything in the extension funnels through these types. Third-party rule
 * formats (Tab Modifier, Tab Manager Plus, Simple Tab Groups, ...) are
 * normalised into `Rule` objects by the importers in `src/core/importers`.
 */

/** The colours Chrome accepts for a tab group. */
export const GROUP_COLORS = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const;

export type GroupColor = (typeof GROUP_COLORS)[number];

export function isGroupColor(value: unknown): value is GroupColor {
  return typeof value === 'string' && (GROUP_COLORS as readonly string[]).includes(value);
}

/** What part of a tab a rule inspects. */
export type MatchTarget = 'title' | 'url' | 'both';

/** How the pattern is interpreted. */
export type MatchMode =
  /** JavaScript regular expression (default). */
  | 'regex'
  /** Glob: `*` = any run of characters, `?` = one character. */
  | 'wildcard'
  /** Plain substring, case-insensitive unless `caseSensitive`. */
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  /** Whole string equality. */
  | 'exact'
  /** Matches the URL hostname exactly or as a suffix (example.com matches a.example.com). */
  | 'domain';

export interface RuleMatch {
  /**
   * The primary pattern. For `regex` this is the regex source *without*
   * delimiters. The extension always compiles with the `g` flag added so a
   * single rule can yield several distinct matches in one title.
   */
  pattern: string;
  /** Additional alternative patterns (OR). Imported from formats that allow lists. */
  patterns?: string[];
  target: MatchTarget;
  mode: MatchMode;
  /** Regex flags (i, m, s, u). `g` is added automatically. Defaults to `i`. */
  flags?: string;
  /** Overrides the case sensitivity implied by `flags` for non-regex modes. */
  caseSensitive?: boolean;
  /**
   * Optional second regex used only to extract captures for `$1` templating,
   * when the detection pattern and the capture pattern differ. Imported from
   * formats like Tab Modifier that separate `url_fragment` (detection) from
   * `url_matcher` (captures).
   */
  capturePattern?: string;
  /** Which string `capturePattern` runs against. Defaults to `target`. */
  captureTarget?: 'title' | 'url';
}

/**
 * How the target group's title is derived.
 *
 * - `fixed`    : always the same group, titled `title`.
 * - `perMatch` : one group per *distinct matched value*. This is what makes a
 *                single `ticket-\d+` rule produce a `ticket-123` group, a
 *                `ticket-456` group, and so on.
 * - `template` : a single group whose title is interpolated from the match
 *                (`$0`, `$1`, `${name}`). Unlike `perMatch` the group is
 *                shared by every tab the rule matches.
 */
export type GroupNameMode = 'fixed' | 'perMatch' | 'template';

export interface RuleGroup {
  mode: GroupNameMode;
  /** Group title for `fixed`/`template`; also the fallback for `perMatch`. */
  title?: string;
  /** Title template used by `perMatch`/`template`. Defaults to `$0`. */
  template?: string;
  color?: GroupColor;
  /** Rotate through these colours for dynamically created groups. */
  colors?: GroupColor[];
  /**
   * Which capture to use as the dynamic key. `0` (the whole match) by default.
   * Accepts a number or a named capture group.
   */
  captureGroup?: number | string;
}

export interface RuleOptions {
  /** Group pinned tabs too. Defaults to false. */
  includePinned?: boolean;
  /** Collapse the group right after it is created. */
  collapse?: boolean;
  /**
   * Move a newly created group after the existing groups (default true). This
   * is what keeps the tab strip in the `GroupA | GroupB | tabA | tabB` shape.
   */
  moveToEnd?: boolean;
}

export interface Rule {
  id: string;
  /** Human readable rule name, shown in the options UI. */
  name: string;
  enabled: boolean;
  match: RuleMatch;
  group: RuleGroup;
  /** Higher wins when two rules match and `settings.evaluation === 'priority'`. */
  priority: number;
  options?: RuleOptions;
  /** Where the rule came from, so exports can round-trip. */
  source?: RuleSource;
  /** Free-form note shown in the UI. */
  note?: string;
}

export interface RuleSource {
  /** Importer id, e.g. `tab-modifier`, `tab-manager-plus`, `auto-group`. */
  format: string;
  /** Original identifier inside that format. */
  ruleId?: string;
  /** Original file/extension version, when known. */
  version?: string;
  /** The original object, kept so exports can round-trip unknown fields. */
  raw?: Record<string, unknown>;
}

export type EvaluationStrategy = 'priority' | 'firstMatch';

export interface Settings {
  /** Master switch. */
  enabled: boolean;
  /** Only ever move tabs that are currently in no group. */
  onlyUngrouped: boolean;
  /** Never re-group a tab the user moved by hand until its URL/title changes. */
  respectManualMoves: boolean;
  /** Keep groups contiguous on the left and ungrouped tabs on the right. */
  enforceGroupOrder: boolean;
  /** Collapse groups that this extension creates. */
  collapseNewGroups: boolean;
  /** Skip pinned tabs entirely. */
  ignorePinned: boolean;
  /** Only add tabs to groups created by this extension. */
  manageOnlyOwnGroups: boolean;
  /** How rules compete when several match. */
  evaluation: EvaluationStrategy;
  /** Colour rotation for dynamically created groups. */
  defaultColors: GroupColor[];
  /** Debounce (ms) applied before a window is reconciled. */
  debounceMs: number;
  /** Also group tabs that are already open when the extension starts. */
  groupExistingOnStartup: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  onlyUngrouped: true,
  respectManualMoves: true,
  enforceGroupOrder: true,
  collapseNewGroups: false,
  ignorePinned: true,
  manageOnlyOwnGroups: true,
  evaluation: 'priority',
  defaultColors: ['blue', 'green', 'yellow', 'orange', 'pink', 'purple', 'cyan', 'red', 'grey'],
  debounceMs: 250,
  groupExistingOnStartup: true,
};

export const RULESET_VERSION = 1;

export interface RuleSet {
  /** Schema version of the Auto Group ruleset file. */
  version: number;
  /** Optional human label for the exported file. */
  name?: string;
  rules: Rule[];
  settings: Settings;
}

export function createEmptyRuleSet(): RuleSet {
  return { version: RULESET_VERSION, rules: [], settings: { ...DEFAULT_SETTINGS } };
}

/** Minimal tab shape the engine needs. Kept separate from `chrome.tabs.Tab`. */
export interface TabInfo {
  id: number;
  windowId: number;
  index: number;
  url?: string;
  title?: string;
  pinned: boolean;
  groupId: number;
}

/** A single match produced by a rule against a tab. */
export interface MatchResult {
  /** The distinct value used to key dynamic groups. */
  key: string;
  /** The title the group should carry. */
  groupTitle: string;
  /** Full match text (`$0`). */
  match: string;
  /** Captures, index 0 = whole match. */
  captures: string[];
  /** Named captures, if any. */
  named: Record<string, string>;
  /** Which pattern matched (for rules with several alternatives). */
  pattern: string;
}

export interface RuleEvaluation {
  rule: Rule;
  match: MatchResult;
}
