import { describe, expect, it } from 'vitest';
import { matchPatternToRegex } from '../src/core/importers/community';
import { mergeImport, parseImport } from '../src/core/importers';
import { splitCatchTabRules } from '../src/core/importers/simpleTabGroups';
import { createRule } from '../src/core/rules';
import { createEmptyRuleSet } from '../src/core/types';

describe('matchPatternToRegex', () => {
  it('compiles host/path patterns', () => {
    const re = new RegExp(matchPatternToRegex('github.com/*'));
    expect(re.test('https://github.com/a/b')).toBe(true);
    expect(re.test('https://gitlab.com/a')).toBe(false);
  });

  it('handles wildcard subdomains', () => {
    const re = new RegExp(matchPatternToRegex('*://*.example.com/*'));
    expect(re.test('https://a.example.com/x')).toBe(true);
    expect(re.test('https://example.com/x')).toBe(true);
    expect(re.test('https://notexample.com/x')).toBe(false);
  });

  it('handles ports', () => {
    const re = new RegExp(matchPatternToRegex('http://localhost:3000/*'));
    expect(re.test('http://localhost:3000/app')).toBe(true);
    expect(re.test('http://localhost:4000/app')).toBe(false);
  });
});

describe('splitCatchTabRules', () => {
  it('splits on newlines and trims', () => {
    expect(splitCatchTabRules('a\n  b \n\nc')).toEqual(['a', 'b', 'c']);
    expect(splitCatchTabRules(undefined)).toEqual([]);
  });
});

describe('parseImport error handling', () => {
  it('reports a helpful error for junk input', () => {
    const outcome = parseImport('not a config file at all');
    expect(outcome.result).toBeNull();
    expect(outcome.errors.length).toBeGreaterThan(0);
  });

  it('reports an empty file', () => {
    expect(parseImport('   ').errors[0]).toContain('empty');
  });
});

describe('mergeImport', () => {
  const base = createEmptyRuleSet();
  base.rules = [
    createRule({ id: 'keep', pattern: 'keep-me', target: 'url', groupMode: 'fixed', title: 'Mine' }),
  ];

  it('adds new rules without touching existing ones', () => {
    const incoming = {
      format: 'test',
      label: 'test',
      rules: [
        createRule({ pattern: 'new-one', target: 'url', groupMode: 'fixed', title: 'New' }),
        createRule({ pattern: 'new-two', target: 'url', groupMode: 'fixed', title: 'New2' }),
      ],
      warnings: [],
      stats: { parsed: 2, skipped: 0 },
    };
    const report = mergeImport(base, incoming);
    expect(report.added).toHaveLength(2);
    expect(report.ruleSet.rules[0]?.id).toBe('keep');
    expect(report.ruleSet.rules).toHaveLength(3);
  });

  it('skips semantically duplicate rules instead of overwriting', () => {
    const duplicate = createRule({
      id: 'other-id',
      pattern: 'keep-me',
      target: 'url',
      groupMode: 'fixed',
      title: 'Mine',
    });
    const report = mergeImport(base, {
      format: 'test',
      label: 'test',
      rules: [duplicate],
      warnings: [],
      stats: { parsed: 1, skipped: 0 },
    });
    expect(report.added).toHaveLength(0);
    expect(report.duplicates).toHaveLength(1);
    expect(report.ruleSet.rules).toHaveLength(1);
    expect(report.ruleSet.rules[0]?.id).toBe('keep');
  });

  it('reassigns colliding ids for genuinely different rules', () => {
    const clash = createRule({
      id: 'keep',
      pattern: 'different',
      target: 'url',
      groupMode: 'fixed',
      title: 'Different',
    });
    const report = mergeImport(base, {
      format: 'test',
      label: 'test',
      rules: [clash],
      warnings: [],
      stats: { parsed: 1, skipped: 0 },
    });
    expect(report.reidentified).toHaveLength(1);
    expect(report.ruleSet.rules.map((r) => r.id)).toEqual(['keep', expect.not.stringMatching(/^keep$/)]);
  });

  it('does not apply settings unless asked', () => {
    const incoming = {
      format: 'test',
      label: 'test',
      rules: [],
      settings: { debounceMs: 999 },
      warnings: [],
      stats: { parsed: 0, skipped: 0 },
    };
    expect(mergeImport(base, incoming).settingsApplied).toBe(false);
    const withSettings = mergeImport(base, incoming, { includeSettings: true });
    expect(withSettings.settingsApplied).toBe(true);
    expect(withSettings.ruleSet.settings.debounceMs).toBe(999);
  });
});
