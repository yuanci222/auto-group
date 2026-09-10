import { describe, expect, it } from 'vitest';
import { exportMarkdown, exportNative, exportTabModifier } from '../src/core/exporters';
import { mergeImport, parseImport } from '../src/core/importers';
import { createRule } from '../src/core/rules';
import { createEmptyRuleSet, type Rule } from '../src/core/types';
import { FIXTURES, fixtureText } from './fixtures';

/** Key-order-insensitive serialisation, like Chrome storage needs. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(val).sort()) {
        sorted[key] = (val as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return val;
  });
}

function project(rule: Rule) {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    priority: rule.priority,
    match: rule.match,
    group: rule.group,
    options: rule.options ?? null,
    note: rule.note ?? null,
  };
}

describe('native export → import round-trip', () => {
  for (const fixture of FIXTURES) {
    it(`survives a full round-trip: ${fixture.name}`, () => {
      const { result } = parseImport(fixtureText(fixture));
      if (!result || result.rules.length === 0) return;

      const first = mergeImport(createEmptyRuleSet(), result);
      const reimported = parseImport(exportNative(first.ruleSet));

      expect(reimported.result?.format).toBe('auto-group');
      expect(reimported.result?.rules).toHaveLength(first.ruleSet.rules.length);
      expect(stable(reimported.result!.rules.map(project))).toBe(
        stable(first.ruleSet.rules.map(project)),
      );
    });
  }

  it('preserves capture pattern and target', () => {
    const ruleSet = createEmptyRuleSet();
    ruleSet.rules = [
      createRule({
        pattern: 'github\\.com/.+/issues/\\d+',
        target: 'url',
        mode: 'regex',
        flags: '',
        capturePattern: '/issues/(\\d+)',
        captureTarget: 'url',
        groupMode: 'perMatch',
        template: 'Issue $1',
      }),
    ];
    const { result } = parseImport(exportNative(ruleSet));
    expect(result?.rules[0]?.match.capturePattern).toBe('/issues/(\\d+)');
    expect(result?.rules[0]?.match.captureTarget).toBe('url');
  });
});

describe('Tabee / Tab Modifier export → import round-trip', () => {
  const ruleSet = createEmptyRuleSet();
  ruleSet.rules = [
    createRule({
      id: 'a',
      name: 'Docs',
      pattern: 'developer\\.mozilla\\.org',
      target: 'url',
      mode: 'regex',
      flags: '',
      caseSensitive: true,
      groupMode: 'fixed',
      title: 'Docs',
      color: 'green',
    }),
    createRule({
      id: 'b',
      name: 'Mail',
      pattern: 'mail\\.example\\.com',
      target: 'url',
      mode: 'contains',
      caseSensitive: true,
      groupMode: 'fixed',
      title: 'Mail',
      color: 'blue',
    }),
  ];

  it('is detected as Tab Modifier after export', () => {
    expect(parseImport(exportTabModifier(ruleSet)).result?.format).toBe('tab-modifier');
  });

  it('preserves pattern, mode, group title and colour', () => {
    const { result } = parseImport(exportTabModifier(ruleSet));
    expect(result?.rules).toHaveLength(2);
    expect(result?.rules.map((rule) => rule.match.pattern)).toEqual([
      'developer\\.mozilla\\.org',
      'mail\\.example\\.com',
    ]);
    expect(result?.rules.map((rule) => rule.match.mode)).toEqual(['regex', 'contains']);
    expect(result?.rules.map((rule) => rule.group.title)).toEqual(['Docs', 'Mail']);
    expect(result?.rules.map((rule) => rule.group.color)).toEqual(['green', 'blue']);
  });
});

describe('Markdown export', () => {
  it('lists every rule', () => {
    const ruleSet = createEmptyRuleSet();
    ruleSet.rules = [
      createRule({ name: 'Docs', pattern: 'docs\\.', target: 'url', groupMode: 'fixed', title: 'Docs' }),
    ];
    const markdown = exportMarkdown(ruleSet);
    expect(markdown).toContain('| Docs |');
    expect(markdown).toContain('docs\\.');
  });
});
