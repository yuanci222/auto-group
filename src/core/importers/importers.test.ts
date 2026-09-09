import { describe, expect, it } from 'vitest';
import { createRule } from '../rules';
import { createEmptyRuleSet } from '../types';
import { mergeImport, parseImport } from './index';
import { splitCatchTabRules } from './simpleTabGroups';

const TAB_MODIFIER_LEGACY = JSON.stringify({
  settings: { enable_new_version_notification: false },
  rules: [
    {
      name: 'Example intranet',
      detection: 'CONTAINS',
      url_fragment: '.internal',
      tab: { title: 'DEV: {title}', icon: null, pinned: false, protected: false, unique: false, muted: false, url_matcher: null },
    },
    {
      name: 'Search pages',
      detection: 'CONTAINS',
      url_fragment: 'search.example.com/',
      tab: { title: 'Query: $1', icon: null, pinned: false, protected: false, unique: false, muted: false, url_matcher: 'query=([^&]+)' },
    },
  ],
});

const TABEE_CONFIG = JSON.stringify({
  rules: [
    {
      id: 'abc1234',
      is_enabled: true,
      name: 'Issue tracker',
      detection: 'REGEX',
      url_fragment: 'issues\\.example\\.com/(\\d+)',
      tab: {
        title: 'Issue #$1',
        icon: null,
        muted: false,
        pinned: false,
        protected: false,
        unique: false,
        group_id: 'grp1',
        title_matcher: null,
        url_matcher: '/(\\d+)',
      },
    },
  ],
  groups: [{ id: 'grp1', title: 'Example Dev\u200b', color: 'orange', collapsed: true }],
  settings: { theme: 'tabee' },
});

const SIMPLE_TAB_GROUPS = JSON.stringify({
  version: '6.0',
  defaultGroupProps: {},
  groups: [
    {
      id: 'g1',
      title: 'GitHub',
      iconColor: 'turquoise',
      catchTabRules: '^https?://(.*\\.)?github\\.com/.*\n^https?://gist\\.github\\.com/.*',
      tabs: [],
    },
    {
      id: 'g2',
      title: 'News',
      catchTabRules: '',
      tabs: [{ id: 1, url: 'https://news.ycombinator.com/', title: 'HN' }],
    },
  ],
});

const TAB_MANAGER_PLUS = JSON.stringify([
  {
    tabs: [{ url: 'https://github.com/a', title: 'GH', pinned: false }],
    windowsInfo: { id: 1 },
    name: 'Work',
    color: 'color3',
    date: 1,
    sessionStartTime: 1,
    id: 's1',
    customName: false,
    incognito: false,
  },
]);

const TAB_SESSION_MANAGER = JSON.stringify([
  {
    windows: {
      '1': {
        '101': { id: 101, url: 'https://github.com/a', title: 'GH', groupId: 5 },
        '102': { id: 102, url: 'https://news.ycombinator.com/', title: 'HN', groupId: -1 },
      },
    },
    windowsNumber: 1,
    windowsInfo: {},
    tabsNumber: 2,
    name: 'Session 1',
    date: 1,
    lastEditedTime: 1,
    tag: [],
    sessionStartTime: 1,
    id: 'tsm1',
    tabGroups: [{ id: 5, collapsed: false, color: 'blue', title: 'Work', windowId: 1 }],
  },
]);

const TABLERONE = JSON.stringify({
  export: [
    { title: 'GitHub', tabs: [{ url: 'https://github.com/a', title: 'GH' }], tags: ['dev'], favourite: false },
  ],
});

const ONETAB_TEXT = `https://github.com/a | GH A
https://news.ycombinator.com/ | HN
https://github.com/b | GH B`;

const NATIVE = JSON.stringify({
  version: 1,
  rules: [
    {
      id: 'r1',
      name: 'Tickets',
      enabled: true,
      match: { pattern: 'ticket-\\d+', target: 'title', mode: 'regex' },
      group: { mode: 'perMatch', template: '$0' },
      priority: 0,
    },
  ],
  settings: { enabled: true, debounceMs: 100 },
});

describe('parseImport format detection', () => {
  it('detects the native format', () => {
    const { result } = parseImport(NATIVE);
    expect(result?.format).toBe('auto-group');
    expect(result?.rules[0]?.group.mode).toBe('perMatch');
  });

  it('detects legacy Tab Modifier', () => {
    const { result } = parseImport(TAB_MODIFIER_LEGACY);
    expect(result?.format).toBe('tab-modifier');
    expect(result?.rules).toHaveLength(2);
    expect(result?.rules[0]?.match.mode).toBe('contains');
    expect(result?.rules[0]?.group.title).toBe('Example intranet');
  });

  it('uses the rule name as the group when Tab Modifier has no group', () => {
    const { result } = parseImport(TAB_MODIFIER_LEGACY);
    expect(result?.warnings.join(' ')).toContain('no tab group');
  });

  it('detects Tabee and resolves group_id, colour and the invisible marker', () => {
    const { result } = parseImport(TABEE_CONFIG);
    expect(result?.format).toBe('tab-modifier');
    const rule = result!.rules[0]!;
    expect(rule.group.title).toBe('Example Dev');
    expect(rule.group.color).toBe('orange');
    expect(rule.match.capturePattern).toBe('/(\\d+)');
    expect(rule.options?.collapse).toBe(true);
    expect(rule.source?.ruleId).toBe('abc1234');
  });

  it('detects Simple Tab Groups and imports catchTabRules as regex rules', () => {
    const { result } = parseImport(SIMPLE_TAB_GROUPS);
    expect(result?.format).toBe('simple-tab-groups');
    const github = result!.rules.find((r) => r.group.title === 'GitHub')!;
    expect(github.match.mode).toBe('regex');
    expect(github.match.pattern).toContain('github');
    expect(github.match.patterns).toHaveLength(1);
    expect(github.group.color).toBe('cyan');
  });

  it('detects Tab Manager Plus sessions and suggests rules', () => {
    const { result } = parseImport(TAB_MANAGER_PLUS);
    expect(result?.format).toBe('tab-manager-plus');
    expect(result?.rules.some((r) => r.group.title === 'Work')).toBe(true);
    expect(result?.rules.every((r) => !r.enabled)).toBe(true);
  });

  it('detects Tab Session Manager exports', () => {
    const { result } = parseImport(TAB_SESSION_MANAGER);
    expect(result?.format).toBe('tab-session-manager');
    expect(result?.rules.some((r) => r.group.title === 'Work')).toBe(true);
  });

  it('detects Tablerone exports', () => {
    const { result } = parseImport(TABLERONE);
    expect(result?.format).toBe('tablerone');
    expect(result?.rules.some((r) => r.group.title === 'GitHub')).toBe(true);
  });

  it('parses a OneTab text export', () => {
    const { result } = parseImport(ONETAB_TEXT);
    expect(result?.format).toBe('text-list');
    expect(result?.rules).toHaveLength(1);
    expect(result?.rules[0]?.group.mode).toBe('perMatch');
  });

  it('reports a helpful error for junk input', () => {
    const outcome = parseImport('not a config file at all');
    expect(outcome.result).toBeNull();
    expect(outcome.errors.length).toBeGreaterThan(0);
  });

  it('reports an empty file', () => {
    expect(parseImport('   ').errors[0]).toContain('empty');
  });
});

describe('splitCatchTabRules', () => {
  it('splits on newlines and trims', () => {
    expect(splitCatchTabRules('a\n  b \n\nc')).toEqual(['a', 'b', 'c']);
    expect(splitCatchTabRules(undefined)).toEqual([]);
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
