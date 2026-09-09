/**
 * Importer registry, format sniffing, and the merge strategy used by
 * "Import → merge" (the default, and the only strategy that never destroys
 * existing rules).
 */
import { createRule, newId, normaliseSettings, ruleKey } from '../rules';
import type { Rule, RuleSet, Settings } from '../types';
import {
  domainGroupsImporter,
  loiloImporter,
  nameUrlColorImporter,
  nitzanpapImporter,
  regexOrganizerImporter,
  tabGroupsExtensionImporter,
  tabsManagerImporter,
} from './community';
import { nativeImporter, convertRuleArray, isNativeRuleSet } from './native';
import { sessionImporter } from './sessions';
import { simpleTabGroupsImporter } from './simpleTabGroups';
import { tabModifierImporter } from './tabModifier';
import { htmlImporter, textListImporter } from './urlList';
import { isRecord, type ImportResult, type Importer } from './types';

export * from './types';
export {
  nativeImporter,
  convertRuleArray,
  tabModifierImporter,
  simpleTabGroupsImporter,
  sessionImporter,
  textListImporter,
  htmlImporter,
  loiloImporter,
  tabGroupsExtensionImporter,
  nitzanpapImporter,
  nameUrlColorImporter,
  domainGroupsImporter,
  regexOrganizerImporter,
  tabsManagerImporter,
};
export const NATIVE_FORMAT = 'auto-group';

/**
 * Last-resort importer for third-party rule files that use obvious field
 * names. Low confidence, so it only wins when nothing else understands the
 * file.
 */
const genericImporter: Importer = {
  id: 'generic',
  label: 'Generic rules',
  detect(data) {
    const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.rules) ? data.rules : null;
    if (!list || list.length === 0) return 0;
    const score =
      list.filter(
        (r) =>
          isRecord(r) &&
          ['pattern', 'regex', 'urlPattern', 'url_pattern', 'urlFragment', 'match'].some((k) => k in r) &&
          ['group', 'groupName', 'group_name', 'groupTitle', 'group_title', 'title'].some((k) => k in r),
      ).length / list.length;
    return score * 0.5;
  },
  convert(data) {
    const list = Array.isArray(data)
      ? data
      : isRecord(data) && Array.isArray(data.rules)
        ? data.rules
        : [];
    const rules: Rule[] = [];
    for (const item of list) {
      if (!isRecord(item)) continue;
      const pattern =
        pickString(item, ['pattern', 'regex', 'urlPattern', 'url_pattern', 'urlFragment', 'url_fragment']) ??
        (typeof item.match === 'string' ? item.match : undefined);
      const title =
        pickString(item, ['groupTitle', 'group_title', 'groupName', 'group_name']) ??
        (typeof item.group === 'string' ? item.group : undefined) ??
        pickString(item, ['title', 'name']);
      if (!pattern) continue;
      rules.push(
        createRule({
          name: pickString(item, ['name', 'title']) ?? title ?? pattern,
          pattern,
          target: /^https?:|\.com|\.org|\.net|:\/\//.test(pattern) ? 'url' : 'both',
          mode: 'regex',
          groupMode: 'fixed',
          title: title ?? pattern,
          source: { format: 'generic', raw: item },
        }),
      );
    }
    return {
      format: 'generic',
      label: 'Generic rules',
      rules,
      warnings: rules.length ? [] : ['No recognisable rules found.'],
      stats: { parsed: list.length, skipped: list.length - rules.length },
    };
  },
};

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

export const IMPORTERS: Importer[] = [
  nativeImporter,
  tabModifierImporter,
  simpleTabGroupsImporter,
  tabGroupsExtensionImporter,
  loiloImporter,
  nitzanpapImporter,
  nameUrlColorImporter,
  domainGroupsImporter,
  regexOrganizerImporter,
  tabsManagerImporter,
  sessionImporter,
  htmlImporter,
  textListImporter,
  genericImporter,
];

export interface FormatGuess {
  format: string;
  label: string;
  confidence: number;
}

export interface ParseOutcome {
  result: ImportResult | null;
  guesses: FormatGuess[];
  errors: string[];
}

function runImporters(data: unknown): { result: ImportResult | null; guesses: FormatGuess[] } {
  const guesses: FormatGuess[] = [];
  let best: { result: ImportResult; confidence: number } | null = null;
  for (const importer of IMPORTERS) {
    let confidence = 0;
    try {
      confidence = importer.detect(data);
    } catch {
      confidence = 0;
    }
    if (confidence <= 0) continue;
    guesses.push({ format: importer.id, label: importer.label, confidence });
    try {
      const result = importer.convert(data);
      if (result.rules.length > 0 || (result.stats.parsed > 0 && !best)) {
        if (!best || confidence > best.confidence) best = { result, confidence };
      }
    } catch {
      // A mis-detected importer must not break the whole parse.
    }
  }
  guesses.sort((a, b) => b.confidence - a.confidence);
  return { result: best?.result ?? null, guesses };
}

/** Parse a file's text, sniffing the format. */
export function parseImport(text: string): ParseOutcome {
  const trimmed = text.trim();
  if (!trimmed) return { result: null, guesses: [], errors: ['The file is empty.'] };

  const errors: string[] = [];
  let data: unknown;
  let parsedJson = false;
  try {
    data = JSON.parse(trimmed);
    parsedJson = true;
  } catch (err) {
    errors.push(`Not valid JSON (${err instanceof Error ? err.message : String(err)}) — trying text formats.`);
  }

  if (parsedJson) {
    const { result, guesses } = runImporters(data);
    if (result && result.rules.length > 0) return { result, guesses, errors };

    // A bare array of our own rules.
    if (Array.isArray(data) && data.length && isRecord(data[0]) && 'match' in data[0]) {
      return { result: convertRuleArray(data), guesses: [{ format: NATIVE_FORMAT, label: 'Auto Group', confidence: 0.8 }], errors };
    }
    if (isNativeRuleSet(data)) {
      return { result: runImporters(data).result, guesses, errors };
    }
    errors.push('JSON parsed, but no supported rule format was recognised.');
    return { result: null, guesses, errors };
  }

  // Text / HTML fallbacks.
  const { result, guesses } = runImporters(trimmed);
  if (result && result.rules.length > 0) return { result, guesses, errors };
  if (result) return { result, guesses, errors };
  errors.push('No URLs or rules could be extracted from this file.');
  return { result: null, guesses, errors };
}

// --- merge -------------------------------------------------------------------

export interface MergeOptions {
  /** Also apply the settings carried by the file. Defaults to false. */
  includeSettings?: boolean;
}

export interface MergeReport {
  ruleSet: RuleSet;
  added: Rule[];
  duplicates: Rule[];
  /** Rules that had to be given a fresh id to avoid a collision. */
  reidentified: Rule[];
  settingsApplied: boolean;
}

const SETTING_KEYS: Array<keyof Settings> = [
  'enabled',
  'onlyUngrouped',
  'respectManualMoves',
  'enforceGroupOrder',
  'collapseNewGroups',
  'ignorePinned',
  'manageOnlyOwnGroups',
  'evaluation',
  'defaultColors',
  'debounceMs',
  'groupExistingOnStartup',
];

/**
 * Merge imported rules into an existing ruleset without overwriting anything
 * the user already has. Duplicate rules (same semantics) are skipped.
 */
export function mergeImport(
  base: RuleSet,
  incoming: ImportResult,
  options: MergeOptions = {},
): MergeReport {
  const seenKeys = new Set(base.rules.map(ruleKey));
  const seenIds = new Set(base.rules.map((r) => r.id));
  const added: Rule[] = [];
  const duplicates: Rule[] = [];
  const reidentified: Rule[] = [];

  for (const rule of incoming.rules) {
    const key = ruleKey(rule);
    if (seenKeys.has(key)) {
      duplicates.push(rule);
      continue;
    }
    let next = rule;
    if (seenIds.has(rule.id)) {
      next = { ...rule, id: newId() };
      reidentified.push(next);
    }
    seenKeys.add(key);
    seenIds.add(next.id);
    added.push(next);
  }

  let settings = base.settings;
  let settingsApplied = false;
  if (options.includeSettings && incoming.settings) {
    const patch: Partial<Settings> = {};
    for (const key of SETTING_KEYS) {
      const value = incoming.settings[key];
      if (value !== undefined) (patch as Record<string, unknown>)[key] = value;
    }
    settings = normaliseSettings({ ...base.settings, ...patch });
    settingsApplied = true;
  }

  return {
    ruleSet: { ...base, rules: [...base.rules, ...added], settings },
    added,
    duplicates,
    reidentified,
    settingsApplied,
  };
}
