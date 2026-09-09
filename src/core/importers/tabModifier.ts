/**
 * Importer for Tab Modifier / Tabee: Tab Modifier (furybee/chrome-tab-modifier).
 *
 * Three historical shapes are accepted:
 *  - 1.x  `{ rules, groups, settings }` — rules carry `tab.group_id`
 *  - 0.x  `{ settings, rules }`         — no group data at all
 *  - pre-0.10 flat map `{ "<url fragment>": { title, ... } }`
 *
 * Tab Modifier matches `url_fragment` against the full URL with no flags.
 * Captures live in `tab.url_matcher` (`$n`) / `tab.title_matcher` (`@n`).
 */
import { createRule } from '../rules';
import { isGroupColor, type GroupColor, type GroupNameMode, type MatchMode, type Rule } from '../types';
import { asArray, bool, emptyResult, isRecord, str, type ImportResult, type Importer } from './types';

export const TAB_MODIFIER_FORMAT = 'tab-modifier';

const INVISIBLE = /\u200b/g;

function stripInvisible(value: string): string {
  return value.replace(INVISIBLE, '').trim();
}

function mapDetection(detection: string | undefined): { mode: MatchMode; caseSensitive: boolean; flags: string } {
  switch ((detection ?? 'CONTAINS').toUpperCase()) {
    case 'STARTS':
    case 'STARTS_WITH':
      return { mode: 'startsWith', caseSensitive: true, flags: '' };
    case 'ENDS':
    case 'ENDS_WITH':
      return { mode: 'endsWith', caseSensitive: true, flags: '' };
    case 'EXACT':
      return { mode: 'exact', caseSensitive: true, flags: '' };
    case 'REGEX':
    case 'REGEXP':
      return { mode: 'regex', caseSensitive: true, flags: '' };
    case 'CONTAINS':
    default:
      return { mode: 'contains', caseSensitive: true, flags: '' };
  }
}

interface ResolvedGroup {
  title: string;
  color?: GroupColor;
  collapsed?: boolean;
}

function resolveGroup(
  rule: Record<string, unknown>,
  groupsById: Map<string, ResolvedGroup>,
): ResolvedGroup | null {
  const tab = isRecord(rule.tab) ? rule.tab : {};
  const groupId = str(tab.group_id);
  if (groupId && groupsById.has(groupId)) return groupsById.get(groupId) ?? null;

  // Older/other Tab Modifier builds store the group inline on `tab`.
  const inline = str(tab.group);
  if (inline && inline.trim()) {
    const color = str(tab.color);
    return { title: stripInvisible(inline), color: isGroupColor(color) ? color : undefined };
  }
  return null;
}

function convertRule(
  raw: Record<string, unknown>,
  index: number,
  groupsById: Map<string, ResolvedGroup>,
  warnings: string[],
): Rule | null {
  const urlFragment = str(raw.url_fragment);
  if (!urlFragment) return null;

  const detection = mapDetection(str(raw.detection));
  const tab = isRecord(raw.tab) ? raw.tab : {};
  const tabTitle = str(tab.title) ?? undefined;
  const urlMatcher = str(tab.url_matcher) ?? undefined;
  const titleMatcher = str(tab.title_matcher) ?? undefined;
  const name = str(raw.name) ?? `Tab Modifier rule ${index + 1}`;

  const resolved = resolveGroup(raw, groupsById);

  let groupMode: GroupNameMode = 'fixed';
  let groupTitle = resolved?.title ?? name;
  let template: string | undefined;
  let capturePattern: string | undefined;
  let captureTarget: 'title' | 'url' | undefined;

  if (!resolved) {
    // No group in the source file: derive a useful group from the rule.
    if (tabTitle && /\$\d/.test(tabTitle) && urlMatcher) {
      groupMode = 'perMatch';
      template = tabTitle;
    } else if (tabTitle && /@\d/.test(tabTitle) && titleMatcher) {
      groupMode = 'perMatch';
      template = tabTitle.replace(/@(\d)/g, '$$$1');
    } else {
      groupTitle = name;
      warnings.push(
        `"${name}": no tab group in the source file — imported with a fixed group named after the rule.`,
      );
    }
  }

  // Keep the capture source even for fixed groups so exports round-trip.
  if (urlMatcher) {
    capturePattern = urlMatcher;
    captureTarget = 'url';
  } else if (titleMatcher) {
    capturePattern = titleMatcher;
    captureTarget = 'title';
  }

  const rule = createRule({
    name,
    enabled: raw.is_enabled !== false && raw.active !== false,
    pattern: urlFragment,
    target: 'url',
    mode: detection.mode,
    flags: detection.flags,
    caseSensitive: detection.caseSensitive,
    groupMode,
    title: groupTitle,
    template,
    color: resolved?.color,
    capturePattern,
    captureTarget,
    id: str(raw.id),
    source: { format: TAB_MODIFIER_FORMAT, ruleId: str(raw.id), raw },
  });

  if (resolved?.collapsed) rule.options = { ...(rule.options ?? {}), collapse: true };
  return rule;
}

function convertFlatMap(data: Record<string, unknown>, warnings: string[]): ImportResult {
  const rules: Rule[] = [];
  let index = 0;
  for (const [fragment, value] of Object.entries(data)) {
    const tab = isRecord(value) ? value : {};
    const name = str(tab.name) ?? fragment;
    rules.push(
      createRule({
        name,
        pattern: fragment,
        target: 'url',
        mode: 'contains',
        flags: '',
        caseSensitive: true,
        groupMode: 'fixed',
        title: name,
        source: { format: TAB_MODIFIER_FORMAT, raw: { url_fragment: fragment, tab } },
      }),
    );
    index += 1;
  }
  if (rules.length) {
    warnings.push(
      `Imported ${rules.length} rule(s) from the pre-0.10 Tab Modifier map format; group names default to the URL fragment.`,
    );
  }
  return {
    format: TAB_MODIFIER_FORMAT,
    label: 'Tab Modifier (legacy map)',
    rules,
    warnings,
    stats: { parsed: index, skipped: 0 },
  };
}

function isFlatMap(data: Record<string, unknown>): boolean {
  if ('rules' in data) return false;
  const entries = Object.entries(data);
  if (entries.length === 0) return false;
  return entries.every(
    ([, value]) =>
      isRecord(value) &&
      ['title', 'icon', 'pinned', 'protected', 'unique', 'url_matcher', 'title_matcher', 'muted'].some(
        (key) => key in value,
      ),
  );
}

function convert(data: unknown): ImportResult {
  if (!isRecord(data)) return emptyResult(TAB_MODIFIER_FORMAT, 'Tab Modifier');
  if (isFlatMap(data)) {
    const warnings: string[] = [];
    const result = convertFlatMap(data, warnings);
    result.warnings = warnings;
    return result;
  }

  const warnings: string[] = [];
  const groupsById = new Map<string, ResolvedGroup>();
  for (const group of asArray(data.groups)) {
    if (!isRecord(group)) continue;
    const id = str(group.id);
    const title = stripInvisible(str(group.title) ?? '');
    if (!id || !title) continue;
    const color = str(group.color);
    groupsById.set(id, {
      title,
      color: isGroupColor(color) ? color : undefined,
      collapsed: bool(group.collapsed) ?? false,
    });
  }

  const rawRules = asArray(data.rules).filter(isRecord);
  const rules: Rule[] = [];
  let skipped = 0;
  rawRules.forEach((raw, index) => {
    const rule = convertRule(raw, index, groupsById, warnings);
    if (rule) rules.push(rule);
    else skipped += 1;
  });

  const hasGroups = groupsById.size > 0;
  return {
    format: TAB_MODIFIER_FORMAT,
    label: hasGroups ? 'Tabee: Tab Modifier' : 'Tab Modifier',
    rules,
    warnings,
    stats: { parsed: rawRules.length, skipped },
  };
}

export const tabModifierImporter: Importer = {
  id: TAB_MODIFIER_FORMAT,
  label: 'Tab Modifier / Tabee',
  detect(data) {
    if (!isRecord(data)) return 0;
    if (isFlatMap(data)) return 0.7;
    const rules = asArray(data.rules);
    if (rules.length === 0) return 0;
    const score = rules.filter((r) => isRecord(r) && 'url_fragment' in r).length / rules.length;
    if (score === 0) return 0;
    // Distinguish from our own format, which uses `match`/`group`.
    const looksNative = rules.some((r) => isRecord(r) && ('match' in r || 'group' in r));
    return looksNative ? score * 0.4 : score;
  },
  convert,
};
