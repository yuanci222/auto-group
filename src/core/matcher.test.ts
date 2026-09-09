import { describe, expect, it } from 'vitest';
import { evaluateRule, interpolate, matchTab, testPattern, validateMatch } from './matcher';
import { createRule } from './rules';
import type { TabInfo } from './types';

function tab(partial: Partial<TabInfo>): TabInfo {
  return {
    id: 1,
    windowId: 1,
    index: 0,
    pinned: false,
    groupId: -1,
    ...partial,
  };
}

describe('matchTab', () => {
  it('matches a regex against the title', () => {
    const rule = createRule({
      pattern: 'ticket-\\d+',
      target: 'title',
      mode: 'regex',
      groupMode: 'perMatch',
    });
    const result = matchTab(rule, tab({ title: 'Fix ticket-123 urgently' }));
    expect(result?.match).toBe('ticket-123');
  });

  it('does not match when the pattern is absent', () => {
    const rule = createRule({ pattern: 'ticket-\\d+', target: 'title' });
    expect(matchTab(rule, tab({ title: 'nothing here' }))).toBeNull();
  });

  it('supports alternative patterns', () => {
    const rule = createRule({ pattern: 'alpha', patterns: ['beta', 'gamma'], target: 'url' });
    expect(matchTab(rule, tab({ url: 'https://x.dev/beta' }))?.match).toBe('beta');
  });

  it('supports wildcard globs anchored to the whole string', () => {
    const rule = createRule({ pattern: '*github.com*', mode: 'wildcard', target: 'url' });
    expect(matchTab(rule, tab({ url: 'https://github.com/a/b' }))).not.toBeNull();
    expect(matchTab(rule, tab({ url: 'https://gitlab.com' }))).toBeNull();
  });

  it('supports contains / startsWith / endsWith / exact', () => {
    const cases: Array<[Parameters<typeof createRule>[0]['mode'], string, string, boolean]> = [
      ['contains', 'foo', 'a foo b', true],
      ['contains', 'FOO', 'a foo b', true],
      ['startsWith', 'https://', 'https://x', true],
      ['endsWith', '/edit', 'https://x/edit', true],
      ['exact', 'https://x', 'https://x', true],
      ['exact', 'https://x', 'https://x/y', false],
    ];
    for (const [mode, pattern, url, expected] of cases) {
      const rule = createRule({ pattern, mode: mode!, target: 'url' });
      expect(Boolean(matchTab(rule, tab({ url }))), `${mode} ${pattern}`).toBe(expected);
    }
  });

  it('matches domains exactly or as a suffix', () => {
    const rule = createRule({ pattern: 'example.com', mode: 'domain', target: 'url' });
    expect(matchTab(rule, tab({ url: 'https://example.com/x' }))).not.toBeNull();
    expect(matchTab(rule, tab({ url: 'https://www.example.com/x' }))).not.toBeNull();
    expect(matchTab(rule, tab({ url: 'https://sub.example.com/x' }))).not.toBeNull();
    expect(matchTab(rule, tab({ url: 'https://notexample.com/x' }))).toBeNull();
  });

  it('honours caseSensitive', () => {
    const rule = createRule({ pattern: 'FOO', mode: 'contains', target: 'url', caseSensitive: true });
    expect(matchTab(rule, tab({ url: 'https://x/foo' }))).toBeNull();
    expect(matchTab(rule, tab({ url: 'https://x/FOO' }))).not.toBeNull();
  });

  it('uses capturePattern with a separate capture target', () => {
    const rule = createRule({
      pattern: 'github\\.com/.+/issues/\\d+',
      target: 'url',
      mode: 'regex',
      flags: '',
      capturePattern: '/issues/(\\d+)',
      captureTarget: 'url',
      groupMode: 'perMatch',
      template: 'Issue #$1',
    });
    const result = matchTab(rule, tab({ url: 'https://github.com/a/b/issues/42' }));
    expect(result?.captures[1]).toBe('42');
  });
});

describe('resolveMatch / perMatch grouping', () => {
  it('creates a distinct key and title per matched value', () => {
    const rule = createRule({
      pattern: 'ticket-(\\d+)',
      target: 'title',
      mode: 'regex',
      groupMode: 'perMatch',
      template: 'T-$1',
    });
    const a = evaluateRule(rule, tab({ title: 'ticket-123' }));
    const b = evaluateRule(rule, tab({ title: 'ticket-456' }));
    expect(a?.key).toBe('ticket-123');
    expect(a?.groupTitle).toBe('T-123');
    expect(b?.key).toBe('ticket-456');
    expect(b?.groupTitle).toBe('T-456');
  });

  it('defaults the perMatch title to the whole match', () => {
    const rule = createRule({ pattern: 'ticket-\\d+', target: 'title', groupMode: 'perMatch' });
    expect(evaluateRule(rule, tab({ title: 'x ticket-789' }))?.groupTitle).toBe('ticket-789');
  });

  it('keeps one shared group in fixed mode', () => {
    const rule = createRule({
      pattern: 'ticket-\\d+',
      target: 'title',
      groupMode: 'fixed',
      title: 'Tickets',
    });
    const a = evaluateRule(rule, tab({ title: 'ticket-1' }));
    const b = evaluateRule(rule, tab({ title: 'ticket-2' }));
    expect(a?.key).toBe('Tickets');
    expect(b?.key).toBe('Tickets');
  });

  it('interpolates named captures', () => {
    const rule = createRule({
      pattern: 'user/(?<name>[a-z]+)',
      target: 'url',
      mode: 'regex',
      groupMode: 'perMatch',
      template: 'User ${name}',
    });
    expect(evaluateRule(rule, tab({ url: 'https://x/user/alice' }))?.groupTitle).toBe('User alice');
  });
});

describe('interpolate', () => {
  it('replaces $0, $1, ${name} and {1}', () => {
    const raw = { match: 'abc', captures: ['abc', 'a', 'c'], named: { x: 'A' } };
    expect(interpolate('$0/$1/{2}/${x}', raw)).toBe('abc/a/c/A');
    expect(interpolate('$9', raw)).toBe('');
  });
});

describe('validateMatch / testPattern', () => {
  it('reports invalid regex', () => {
    expect(validateMatch({ pattern: '(', target: 'url', mode: 'regex' })).toContain('Invalid');
    expect(validateMatch({ pattern: 'ok', target: 'url', mode: 'regex' })).toBeNull();
  });

  it('returns every match for the tester', () => {
    const outcome = testPattern(
      { pattern: 'ticket-\\d+', target: 'title', mode: 'regex', flags: 'i' },
      'ticket-1 and ticket-2',
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.results.map((r) => r.match)).toEqual(['ticket-1', 'ticket-2']);
  });
});
