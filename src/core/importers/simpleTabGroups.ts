/**
 * Importer for Simple Tab Groups (Drive4ik/simple-tab-groups).
 *
 * STG is the closest thing to a reference "regex auto-grouping" extension:
 * every group carries `catchTabRules`, a newline-separated list of regular
 * expressions tested (case-sensitively, no flags) against the full URL.
 * First matching group wins.
 *
 * Export shape: a big options object whose `groups` array holds the rules and
 * the tabs. We import `catchTabRules` as real rules; groups without rules fall
 * back to hostname-based rules via the session converter.
 */
import { createRule } from '../rules';
import { isGroupColor, type GroupColor, type Rule } from '../types';
import { sessionToRules, type SessionFile } from './sessions';
import { asArray, emptyResult, isRecord, str, type ImportResult, type Importer } from './types';

export const SIMPLE_TAB_GROUPS_FORMAT = 'simple-tab-groups';

/** STG uses its own colour names; map the ones Chrome understands. */
const COLOR_ALIASES: Record<string, GroupColor> = {
  turquoise: 'cyan',
  grey: 'grey',
  gray: 'grey',
};

function mapColor(value: string | undefined): GroupColor | undefined {
  if (!value) return undefined;
  if (isGroupColor(value)) return value;
  return COLOR_ALIASES[value];
}

export function splitCatchTabRules(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s*\n\s*/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isSimpleTabGroups(data: unknown): data is Record<string, unknown> {
  if (!isRecord(data) || !Array.isArray(data.groups)) return false;
  if ('defaultGroupProps' in data || 'browserSettings' in data) return true;
  return data.groups.some((g) => isRecord(g) && 'catchTabRules' in g);
}

function convert(data: unknown): ImportResult {
  if (!isRecord(data)) return emptyResult(SIMPLE_TAB_GROUPS_FORMAT, 'Simple Tab Groups');
  const warnings: string[] = [];
  const rules: Rule[] = [];
  const leftoverGroups: SessionFile['groups'] = [];
  let skipped = 0;

  for (const raw of asArray(data.groups)) {
    if (!isRecord(raw)) continue;
    const title = (str(raw.title) ?? '').trim();
    const patterns = splitCatchTabRules(str(raw.catchTabRules));
    if (patterns.length && title) {
      const [first, ...rest] = patterns;
      rules.push(
        createRule({
          name: `STG: ${title}`,
          enabled: true,
          pattern: first!,
          patterns: rest.length ? rest : undefined,
          target: 'url',
          mode: 'regex',
          flags: '',
          caseSensitive: true,
          groupMode: 'fixed',
          title,
          color: mapColor(str(raw.iconColor)),
          options: { collapse: false },
          note: 'Imported from Simple Tab Groups catchTabRules.',
          source: { format: SIMPLE_TAB_GROUPS_FORMAT, ruleId: str(raw.id), raw },
        }),
      );
    } else {
      skipped += 1;
      leftoverGroups.push({
        title: title || undefined,
        color: mapColor(str(raw.iconColor)),
        tabs: asArray(raw.tabs)
          .map((tab) => (isRecord(tab) ? { url: str(tab.url), title: str(tab.title) } : null))
          .filter(
            (t): t is { url: string | undefined; title: string | undefined } => t !== null,
          )
          .filter((t) => Boolean(t.url)),
      });
    }
  }

  if (leftoverGroups.length) {
    const fallback = sessionToRules({
      format: SIMPLE_TAB_GROUPS_FORMAT,
      label: 'Simple Tab Groups',
      groups: leftoverGroups,
      warnings: [],
    });
    rules.push(...fallback.rules);
    warnings.push(...fallback.warnings);
  }

  if (rules.length) {
    warnings.push(
      'Simple Tab Groups patterns are case-sensitive and match the full URL, exactly like the original.',
    );
  }

  return {
    format: SIMPLE_TAB_GROUPS_FORMAT,
    label: 'Simple Tab Groups',
    rules,
    warnings,
    stats: { parsed: asArray(data.groups).length, skipped },
  };
}

export const simpleTabGroupsImporter: Importer = {
  id: SIMPLE_TAB_GROUPS_FORMAT,
  label: 'Simple Tab Groups',
  detect(data) {
    return isSimpleTabGroups(data) ? 0.95 : 0;
  },
  convert,
};
