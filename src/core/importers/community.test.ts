import { describe, expect, it } from 'vitest';
import { matchPatternToRegex } from './community';
import { parseImport } from './index';

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

const LOILO = JSON.stringify([
  {
    id: '3f1a9c2e',
    title: 'Work',
    color: 'blue',
    options: { strict: false, merge: false },
    matchers: ['github.com/*', '/^https:\\/\\/docs\\.google\\.com\\//i'],
  },
]);

const GUOKAI = JSON.stringify({
  'rule-1a2b3c': {
    id: 'rule-1a2b3c',
    ruleName: 'Docs',
    groupName: 'Google Docs',
    groupColor: 'blue',
    enabled: true,
    urlMatches: [{ target: 'hostname', method: 'endsWith', value: 'docs.google.com' }],
    titleMatches: [{ method: 'includes', value: 'Document', ignoreCase: true }],
  },
  meta: { name: 'tab-groups-rules', version: 1 },
});

const NITZANPAP = JSON.stringify({
  version: '1.0',
  exportDate: '2026-09-09T12:34:56.789Z',
  rules: {
    'rule-1': {
      id: 'rule-1',
      name: 'Work',
      domains: ['*.atlassian.net', 'title:Jira', '/^https:\\/\\/docs\\.google\\.com\\//'],
      color: 'blue',
      enabled: true,
      priority: 1,
      isBlacklist: false,
    },
  },
  totalRules: 1,
});

const NAME_URL_COLOR = JSON.stringify([
  {
    group1: { NAME: 'Work', URL: ['https://example.com', 'https://worksite.com'], COLOR: 'blue' },
    group2: { NAME: 'Leisure', URL: ['https://youtube.com'], COLOR: 'red' },
  },
]);

const DOMAIN_GROUPS = JSON.stringify({
  domainGroups: {
    'github.com': { title: 'GitHub', color: 'purple', isRegex: false, enabled: true },
    '*.google.com': { title: 'Google', color: 'blue', isRegex: false, enabled: true },
    '^https://(www\\.)?youtube\\.com/': { title: 'Video', color: 'red', isRegex: true, enabled: true },
  },
});

const REGEX_ORGANIZER = JSON.stringify({
  rules: [
    { regex: '^https://github\\.com/', groupName: 'GitHub', color: 'purple', enabled: true },
    { regex: '^mail\\.google\\.com$', groupName: 'Mail', color: 'blue', enabled: true },
  ],
});

const TABS_MANAGER = JSON.stringify({
  groupBy: 'custom-rule',
  activeCustomRule: 'Work',
  customRules: [
    {
      ruleName: 'Work',
      groups: [
        {
          color: 'blue',
          title: 'Atlassian',
          match: { hostContains: ['atlassian.net'], urlContains: ['/browse/'], titleContains: [], regexMatches: [] },
        },
      ],
    },
  ],
});

describe('community importers', () => {
  it('imports loilo Auto-Group Tabs matchers', () => {
    const { result } = parseImport(LOILO);
    expect(result?.format).toBe('auto-group-tabs-loilo');
    expect(result?.rules).toHaveLength(2);
    expect(result?.rules.every((r) => r.group.title === 'Work')).toBe(true);
    const regexRule = result!.rules.find((r) => r.match.pattern.includes('docs'));
    expect(regexRule?.match.mode).toBe('regex');
  });

  it('imports guokai Tab Groups Extension rules', () => {
    const { result } = parseImport(GUOKAI);
    expect(result?.format).toBe('tab-groups-extension');
    expect(result?.rules).toHaveLength(2);
    const titleRule = result!.rules.find((r) => r.match.target === 'title');
    expect(titleRule?.match.mode).toBe('contains');
    expect(titleRule?.group.title).toBe('Google Docs');
  });

  it('imports nitzanpap DSL patterns including title: and regex', () => {
    const { result } = parseImport(NITZANPAP);
    expect(result?.format).toBe('auto-tab-groups-nitzanpap');
    expect(result?.rules).toHaveLength(3);
    const titleRule = result!.rules.find((r) => r.match.target === 'title');
    expect(titleRule?.match.pattern).toBe('Jira');
    const regexRule = result!.rules.find((r) => r.match.pattern.includes('docs'));
    expect(regexRule?.match.mode).toBe('regex');
  });

  it('imports NAME/URL/COLOR maps', () => {
    const { result } = parseImport(NAME_URL_COLOR);
    expect(result?.format).toBe('auto-tab-groups-simple');
    expect(result?.rules).toHaveLength(2);
    const work = result!.rules.find((r) => r.group.title === 'Work')!;
    expect(work.match.mode).toBe('contains');
    expect(work.match.patterns).toEqual(['https://worksite.com']);
  });

  it('imports diasDominik domainGroups', () => {
    const { result } = parseImport(DOMAIN_GROUPS);
    expect(result?.format).toBe('auto-tab-grouper');
    expect(result?.rules).toHaveLength(3);
    const google = result!.rules.find((r) => r.group.title === 'Google')!;
    expect(google.match.mode).toBe('domain');
    expect(google.match.pattern).toBe('google.com');
  });

  it('imports Regex Tab Organizer rules against title and URL', () => {
    const { result } = parseImport(REGEX_ORGANIZER);
    expect(result?.format).toBe('regex-tab-organizer');
    expect(result?.rules).toHaveLength(2);
    expect(result?.rules[0]?.match.target).toBe('both');
  });

  it('imports Tabs Manager custom rules with a warning about AND semantics', () => {
    const { result } = parseImport(TABS_MANAGER);
    expect(result?.format).toBe('tabs-manager');
    expect(result?.rules.some((r) => r.group.title === 'Atlassian')).toBe(true);
    expect(result?.warnings.join(' ')).toContain('AND');
  });
});
