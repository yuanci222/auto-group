/**
 * Native Auto Group ruleset format.
 *
 *   { "version": 1, "name": "...", "rules": [...], "settings": {...} }
 */
import { normaliseRuleSet, sanitiseRule } from '../rules';
import type { RuleSet } from '../types';
import { asArray, emptyResult, isRecord, type ImportResult, type Importer } from './types';

export const NATIVE_FORMAT = 'auto-group';

export function isNativeRuleSet(data: unknown): data is Partial<RuleSet> {
  if (!isRecord(data)) return false;
  if (!Array.isArray(data.rules)) return false;
  const first = data.rules[0];
  if (first === undefined) return 'version' in data && 'settings' in data;
  if (!isRecord(first)) return false;
  return isRecord(first.match) || isRecord(first.group);
}

function convert(data: unknown): ImportResult {
  const ruleSet = normaliseRuleSet(data as Partial<RuleSet>);
  return {
    format: NATIVE_FORMAT,
    label: 'Auto Group',
    rules: ruleSet.rules,
    settings: ruleSet.settings,
    warnings: [],
    stats: { parsed: ruleSet.rules.length, skipped: 0 },
  };
}

export const nativeImporter: Importer = {
  id: NATIVE_FORMAT,
  label: 'Auto Group',
  detect(data) {
    if (!isNativeRuleSet(data)) return 0;
    const record = data as Record<string, unknown>;
    if ('version' in record && 'settings' in record) return 1;
    return 0.85;
  },
  convert,
};

/** Also exported for the importer that handles bare `Rule[]` arrays. */
export function convertRuleArray(data: unknown): ImportResult {
  const rules = asArray(data).map(sanitiseRule).filter((r) => r.match.pattern);
  return {
    format: NATIVE_FORMAT,
    label: 'Auto Group (rules array)',
    rules,
    warnings: [],
    stats: { parsed: rules.length, skipped: asArray(data).length - rules.length },
  };
}
