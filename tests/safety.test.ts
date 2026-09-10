import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeImport, parseImport } from '../src/core/importers';
import {
  getQuarantinedPatterns,
  isQuarantined,
  matchTab,
  notePatternTiming,
  resetPatternSafety,
  validateMatch,
} from '../src/core/matcher';
import { planWindow } from '../src/core/plan';
import { createRule } from '../src/core/rules';
import {
  MAX_PATTERN_LENGTH,
  assessPattern,
  hasCatastrophicShape,
  isRuleSafe,
} from '../src/core/safety';
import { DEFAULT_SETTINGS, createEmptyRuleSet, type TabInfo } from '../src/core/types';

beforeEach(() => {
  // The breaker warns on the console; keep the test output clean and assert on it.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetPatternSafety();
});

function tab(partial: Partial<TabInfo> = {}): TabInfo {
  return { id: 1, windowId: 1, index: 0, pinned: false, groupId: -1, ...partial };
}

describe('static ReDoS detection', () => {
  const SAFE = [
    'ticket-\\d+',
    '^https?://github\\.com/',
    '(foo|bar)+',
    '(ab|ac)+',
    '(GET|POST)+',
    'a+',
    '(?:abc)+',
    '[a-z]+',
    '\\d{2,4}',
    'a{2,}',
    '(a+)?',
    '^https?://(?:[^/@]*@)?(?:www\\.)?([^/:?#]+)',
    '^https?://([^/]+)?githubusercontent\\.com/.*',
    '^https?://[^./]+\\.example\\.com(?::\\d+)?(?:/|$)',
    '^https?://(?:[^/]*\\.)?([^./]+)-[^./]+\\.([^./]+)\\.console\\.aws\\.amazon\\.com(?::\\d+)?(?:/|$)',
    'developer\\.mozilla\\.org|docs\\.|/documentation/|readthedocs',
  ];
  for (const pattern of SAFE) {
    it(`accepts ${pattern}`, () => {
      expect(hasCatastrophicShape(pattern)).toBe(false);
      expect(assessPattern(pattern).ok).toBe(true);
    });
  }

  const UNSAFE = [
    '(a+)+',
    '(?:a*)*',
    '(a{2,})+',
    '((a+))+',
    '(a|aa)+',
    '(a|a)+',
    '(foo|foobar)+',
    '(\\d+)+',
    '(.*)*',
    '(x+x+)+y',
  ];
  for (const pattern of UNSAFE) {
    it(`flags ${pattern}`, () => {
      expect(hasCatastrophicShape(pattern)).toBe(true);
      expect(assessPattern(pattern).ok).toBe(false);
    });
  }

  it('rejects an over-long pattern', () => {
    const assessment = assessPattern('a'.repeat(MAX_PATTERN_LENGTH + 1));
    expect(assessment.ok).toBe(false);
    expect(assessment.reason).toContain('too long');
  });

  it('only applies the backtracking check to regex mode', () => {
    expect(assessPattern('(a+)+', 'contains').ok).toBe(true);
    expect(assessPattern('(a+)+', 'regex').ok).toBe(false);
  });
});

describe('rule safety', () => {
  it('marks a catastrophic rule unsafe', () => {
    expect(
      isRuleSafe(
        createRule({ pattern: '(a+)+', target: 'title', mode: 'regex', groupMode: 'fixed', title: 'Bad' }),
      ),
    ).toBe(false);
  });

  it('marks a normal rule safe', () => {
    expect(
      isRuleSafe(
        createRule({
          pattern: 'ticket-\\d+',
          target: 'title',
          mode: 'regex',
          groupMode: 'perMatch',
        }),
      ),
    ).toBe(true);
  });

  it('checks alternatives and the capture pattern too', () => {
    const viaAlternatives = createRule({
      pattern: 'alpha',
      patterns: ['(a+)+'],
      target: 'url',
      mode: 'regex',
    });
    expect(isRuleSafe(viaAlternatives)).toBe(false);

    const viaCapture = createRule({
      pattern: 'alpha',
      target: 'url',
      mode: 'regex',
      capturePattern: '(a+)+',
      groupMode: 'fixed',
      title: 'X',
    });
    expect(isRuleSafe(viaCapture)).toBe(false);
  });

  it('surfaces the reason through validateMatch', () => {
    const reason = validateMatch({ pattern: '(a+)+', target: 'title', mode: 'regex' });
    expect(reason).toContain('backtrack');
  });
});

describe('matcher never throws on a bad pattern', () => {
  it('returns null for an uncompilable rule', () => {
    const rule = createRule({ pattern: '(', target: 'title', mode: 'regex', groupMode: 'fixed', title: 'X' });
    expect(() => matchTab(rule, tab({ title: 'anything' }))).not.toThrow();
    expect(matchTab(rule, tab({ title: 'anything' }))).toBeNull();
  });

  it('returns null when the capture pattern is uncompilable', () => {
    const rule = createRule({
      pattern: 'ticket',
      target: 'title',
      mode: 'regex',
      capturePattern: '(',
      groupMode: 'fixed',
      title: 'X',
    });
    expect(() => matchTab(rule, tab({ title: 'ticket' }))).not.toThrow();
    expect(matchTab(rule, tab({ title: 'ticket' }))).not.toBeNull();
  });
});

describe('runtime circuit breaker', () => {
  it('quarantines a pattern only after repeated slow executions', () => {
    notePatternTiming('slow', 'i', 5); // fast, ignored
    notePatternTiming('slow', 'i', 100);
    notePatternTiming('slow', 'i', 100);
    expect(isQuarantined('slow', 'i')).toBe(false);

    notePatternTiming('slow', 'i', 100);
    expect(isQuarantined('slow', 'i')).toBe(true);
    expect(getQuarantinedPatterns()).toContain('slow');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('quarantined'));
  });

  it('stops matching a quarantined pattern', () => {
    const rule = createRule({
      pattern: 'ticket-\\d+',
      target: 'title',
      mode: 'regex',
      groupMode: 'fixed',
      title: 'Tickets',
    });
    expect(matchTab(rule, tab({ title: 'ticket-1' }))).not.toBeNull();

    for (let i = 0; i < 3; i++) notePatternTiming('ticket-\\d+', 'i', 50);
    expect(matchTab(rule, tab({ title: 'ticket-1' }))).toBeNull();
  });

  it('ignores unrelated flags when matching the quarantine key', () => {
    for (let i = 0; i < 3; i++) notePatternTiming('flagged', '', 50);
    expect(isQuarantined('flagged')).toBe(true);
    expect(isQuarantined('flagged', 'g')).toBe(true);
  });
});

describe('planner skips unsafe rules', () => {
  const settings = { ...DEFAULT_SETTINGS };

  it('does nothing with an unsafe rule', () => {
    const plan = planWindow({
      tabs: [tab({ title: 'aaaa', id: 1 })],
      rules: [
        createRule({ pattern: '(a+)+', target: 'title', mode: 'regex', groupMode: 'fixed', title: 'Bad' }),
      ],
      settings,
      groups: [],
      ownedGroupIds: [],
    });
    expect(plan.actions).toHaveLength(0);
  });

  it('still applies safe rules next to an unsafe one', () => {
    const plan = planWindow({
      tabs: [tab({ title: 'ticket-1', id: 1 })],
      rules: [
        createRule({ pattern: '(a+)+', target: 'title', mode: 'regex', groupMode: 'fixed', title: 'Bad' }),
        createRule({ pattern: 'ticket-\\d+', target: 'title', mode: 'regex', groupMode: 'fixed', title: 'Good' }),
      ],
      settings,
      groups: [],
      ownedGroupIds: [],
    });
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]?.title).toBe('Good');
  });
});

describe('import disables unsafe rules', () => {
  it('keeps the rule but switches it off, with a warning', () => {
    const text = JSON.stringify({
      version: 1,
      rules: [
        {
          id: 'bad',
          name: 'Bad',
          enabled: true,
          match: { pattern: '(a+)+', target: 'title', mode: 'regex' },
          group: { mode: 'fixed', title: 'Bad' },
        },
        {
          id: 'good',
          name: 'Good',
          enabled: true,
          match: { pattern: 'ticket-\\d+', target: 'title', mode: 'regex' },
          group: { mode: 'fixed', title: 'Good' },
        },
      ],
    });
    const { result } = parseImport(text);
    expect(result).not.toBeNull();

    const report = mergeImport(createEmptyRuleSet(), result!);
    expect(report.added).toHaveLength(2);
    expect(report.added.find((rule) => rule.name === 'Bad')?.enabled).toBe(false);
    expect(report.added.find((rule) => rule.name === 'Good')?.enabled).toBe(true);
    expect(report.warnings.join(' ')).toContain('backtrack catastrophically');
  });

  it('reports no warning when every rule is safe', () => {
    const text = JSON.stringify({
      version: 1,
      rules: [
        {
          id: 'good',
          name: 'Good',
          enabled: true,
          match: { pattern: 'ticket-\\d+', target: 'title', mode: 'regex' },
          group: { mode: 'fixed', title: 'Good' },
        },
      ],
    });
    const { result } = parseImport(text);
    const report = mergeImport(createEmptyRuleSet(), result!);
    expect(report.warnings).toHaveLength(0);
  });
});
