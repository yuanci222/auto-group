/**
 * Compatibility fixture corpus.
 *
 * Each entry is a file-shaped export from another extension (or our own
 * format) plus the canonical rules we expect to get out of it. `conformance.test.ts`
 * runs every entry through `parseImport` and checks the mapping.
 *
 * Adding a new format or a real export:
 *  1. drop the file in `tests/fixtures/real/<importer-id>/` for smoke coverage, or
 *  2. add an entry here with an explicit expectation.
 */
import type { GroupColor, MatchMode, MatchTarget, Rule } from '../../src/core/types';

export interface ExpectedRule {
  target?: MatchTarget;
  mode?: MatchMode;
  pattern?: string;
  /** substring match on `match.pattern` (for generated regexes) */
  patternContains?: string;
  patterns?: string[];
  groupTitle?: string;
  color?: GroupColor;
  enabled?: boolean;
  capturePattern?: string;
}

export interface Fixture {
  name: string;
  /** importer id that must win format detection */
  importer: string;
  /** `result.format` reported by the winning importer */
  format: string;
  /** JSON payload (stringified for the parser) */
  data?: unknown;
  /** raw text for text/HTML formats */
  text?: string;
  rules: number;
  skipped?: number;
  allDisabled?: boolean;
  contains?: ExpectedRule[];
  warningsContain?: string[];
}

export function fixtureText(fixture: Fixture): string {
  return fixture.text ?? JSON.stringify(fixture.data);
}

export function ruleMatches(rule: Rule, expected: ExpectedRule): boolean {
  if (expected.target !== undefined && rule.match.target !== expected.target) return false;
  if (expected.mode !== undefined && rule.match.mode !== expected.mode) return false;
  if (expected.pattern !== undefined && rule.match.pattern !== expected.pattern) return false;
  if (expected.patternContains !== undefined && !rule.match.pattern.includes(expected.patternContains)) {
    return false;
  }
  if (expected.patterns !== undefined) {
    const actual = rule.match.patterns ?? [];
    if (JSON.stringify(actual) !== JSON.stringify(expected.patterns)) return false;
  }
  if (expected.groupTitle !== undefined) {
    const title = rule.group.title ?? rule.group.template ?? '';
    if (title !== expected.groupTitle) return false;
  }
  if (expected.color !== undefined && rule.group.color !== expected.color) return false;
  if (expected.enabled !== undefined && rule.enabled !== expected.enabled) return false;
  if (expected.capturePattern !== undefined && rule.match.capturePattern !== expected.capturePattern) {
    return false;
  }
  return true;
}

const TAB_MODIFIER_LEGACY = {
  settings: { enable_new_version_notification: false },
  rules: [
    {
      name: 'Example intranet',
      detection: 'CONTAINS',
      url_fragment: '.internal',
      tab: {
        title: 'DEV: {title}',
        icon: null,
        pinned: false,
        protected: false,
        unique: false,
        muted: false,
        url_matcher: null,
      },
    },
    {
      name: 'Search pages',
      detection: 'CONTAINS',
      url_fragment: 'search.example.com/',
      tab: {
        title: 'Query: $1',
        icon: null,
        pinned: false,
        protected: false,
        unique: false,
        muted: false,
        url_matcher: 'query=([^&]+)',
      },
    },
  ],
};

const TABEE_CONFIG = {
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
};

const SIMPLE_TAB_GROUPS = {
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
};

const TAB_MANAGER_PLUS = [
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
];

const TAB_SESSION_MANAGER = [
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
];

const LOILO = [
  {
    id: '3f1a9c2e',
    title: 'Work',
    color: 'blue',
    options: { strict: false, merge: false },
    matchers: ['github.com/*', '/^https:\\/\\/docs\\.google\\.com\\//i'],
  },
];

const GUOKAI = {
  'rule-1a2b3c': {
    id: 'rule-1a2b3c',
    ruleName: 'Vendor',
    groupName: 'Vendor Portal',
    groupColor: 'blue',
    enabled: true,
    urlMatches: [{ target: 'hostname', method: 'endsWith', value: 'portal.example.com' }],
    titleMatches: [{ method: 'includes', value: 'Portal', ignoreCase: true }],
  },
  meta: { name: 'tab-groups-rules', version: 1 },
};

const NITZANPAP = {
  version: '1.0',
  exportDate: '2026-09-09T12:34:56.789Z',
  rules: {
    'rule-1': {
      id: 'rule-1',
      name: 'Example',
      domains: ['*.example.net', 'title:Widget', '/^https:\\/\\/intranet\\.example\\.com\\//'],
      color: 'blue',
      enabled: true,
      priority: 1,
      isBlacklist: false,
    },
  },
  totalRules: 1,
};

const NAME_URL_COLOR = [
  {
    group1: { NAME: 'Work', URL: ['https://example.com', 'https://worksite.com'], COLOR: 'blue' },
    group2: { NAME: 'Leisure', URL: ['https://youtube.com'], COLOR: 'red' },
  },
];

const DOMAIN_GROUPS = {
  domainGroups: {
    'github.com': { title: 'GitHub', color: 'purple', isRegex: false, enabled: true },
    '*.google.com': { title: 'Google', color: 'blue', isRegex: false, enabled: true },
    '^https://(www\\.)?youtube\\.com/': { title: 'Video', color: 'red', isRegex: true, enabled: true },
  },
};

const REGEX_ORGANIZER = {
  rules: [
    { regex: '^https://github\\.com/', groupName: 'GitHub', color: 'purple', enabled: true },
    { regex: '^mail\\.google\\.com$', groupName: 'Mail', color: 'blue', enabled: true },
  ],
};

const TABS_MANAGER = {
  groupBy: 'custom-rule',
  activeCustomRule: 'Work',
  customRules: [
    {
      ruleName: 'Work',
      groups: [
        {
          color: 'blue',
          title: 'Atlassian',
          match: {
            hostContains: ['atlassian.net'],
            urlContains: ['/browse/'],
            titleContains: [],
            regexMatches: [],
          },
        },
      ],
    },
  ],
};

export const FIXTURES: Fixture[] = [
  {
    name: 'Auto Group (native)',
    importer: 'auto-group',
    format: 'auto-group',
    data: {
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
    },
    rules: 1,
    contains: [{ target: 'title', mode: 'regex', groupTitle: '$0', enabled: true }],
  },
  {
    name: 'Tab Modifier 0.x',
    importer: 'tab-modifier',
    format: 'tab-modifier',
    data: TAB_MODIFIER_LEGACY,
    rules: 2,
    contains: [
      { target: 'url', mode: 'contains', pattern: '.internal', groupTitle: 'Example intranet' },
      { target: 'url', mode: 'contains', pattern: 'search.example.com/', groupTitle: 'Search pages' },
    ],
    warningsContain: ['no tab group'],
  },
  {
    name: 'Tabee / Tab Modifier 1.x',
    importer: 'tab-modifier',
    format: 'tab-modifier',
    data: TABEE_CONFIG,
    rules: 1,
    contains: [
      {
        target: 'url',
        mode: 'regex',
        groupTitle: 'Example Dev',
        color: 'orange',
        capturePattern: '/(\\d+)',
      },
    ],
  },
  {
    name: 'Tab Modifier pre-0.10 flat map',
    importer: 'tab-modifier',
    format: 'tab-modifier',
    data: {
      '.internal': { title: 'DEV: {title}' },
      'search.example.com': { url_matcher: 'query=([^&]+)' },
    },
    rules: 2,
    contains: [{ target: 'url', mode: 'contains', pattern: '.internal', groupTitle: '.internal' }],
  },
  {
    name: 'Simple Tab Groups backup',
    importer: 'simple-tab-groups',
    format: 'simple-tab-groups',
    data: SIMPLE_TAB_GROUPS,
    rules: 3,
    skipped: 1,
    contains: [
      { target: 'url', mode: 'regex', color: 'cyan', groupTitle: 'GitHub' },
      { groupTitle: 'News' },
    ],
  },
  {
    name: 'Tab Groups Extension (guokai.dev)',
    importer: 'tab-groups-extension',
    format: 'tab-groups-extension',
    data: GUOKAI,
    rules: 2,
    contains: [
      {
        target: 'url',
        mode: 'endsWith',
        pattern: 'portal.example.com',
        groupTitle: 'Vendor Portal',
        color: 'blue',
      },
      { target: 'title', mode: 'contains', pattern: 'Portal', groupTitle: 'Vendor Portal' },
    ],
  },
  {
    name: 'Auto-Group Tabs (loilo)',
    importer: 'auto-group-tabs-loilo',
    format: 'auto-group-tabs-loilo',
    data: LOILO,
    rules: 2,
    contains: [
      { target: 'url', mode: 'regex', groupTitle: 'Work', color: 'blue' },
      { target: 'url', mode: 'regex', patternContains: 'docs\\.google\\.com' },
    ],
  },
  {
    name: 'Auto Tab Groups (nitzanpap)',
    importer: 'auto-tab-groups-nitzanpap',
    format: 'auto-tab-groups-nitzanpap',
    data: NITZANPAP,
    rules: 3,
    contains: [
      { target: 'title', mode: 'contains', pattern: 'Widget', groupTitle: 'Example' },
      { target: 'url', mode: 'regex', patternContains: 'intranet' },
    ],
  },
  {
    name: 'Auto Tab Groups (NAME/URL/COLOR)',
    importer: 'auto-tab-groups-simple',
    format: 'auto-tab-groups-simple',
    data: NAME_URL_COLOR,
    rules: 2,
    contains: [
      {
        target: 'url',
        mode: 'contains',
        pattern: 'https://example.com',
        patterns: ['https://worksite.com'],
        groupTitle: 'Work',
        color: 'blue',
      },
    ],
  },
  {
    name: 'Auto Tab Grouper (diasDominik)',
    importer: 'auto-tab-grouper',
    format: 'auto-tab-grouper',
    data: DOMAIN_GROUPS,
    rules: 3,
    contains: [
      { target: 'url', mode: 'domain', pattern: 'google.com', groupTitle: 'Google' },
      { target: 'url', mode: 'regex', groupTitle: 'Video' },
    ],
  },
  {
    name: 'Regex Tab Organizer',
    importer: 'regex-tab-organizer',
    format: 'regex-tab-organizer',
    data: REGEX_ORGANIZER,
    rules: 2,
    contains: [{ target: 'both', mode: 'regex', groupTitle: 'GitHub', color: 'purple' }],
  },
  {
    name: 'Tabs Manager - Auto Group and Save',
    importer: 'tabs-manager',
    format: 'tabs-manager',
    data: TABS_MANAGER,
    rules: 2,
    contains: [
      { target: 'url', mode: 'domain', groupTitle: 'Atlassian', color: 'blue' },
      { target: 'url', mode: 'contains', pattern: '/browse/' },
    ],
    warningsContain: ['AND'],
  },
  {
    name: 'Tab Manager Plus sessions',
    importer: 'session',
    format: 'tab-manager-plus',
    data: TAB_MANAGER_PLUS,
    rules: 2,
    allDisabled: true,
    contains: [{ groupTitle: 'Work' }],
  },
  {
    name: 'Tab Session Manager sessions',
    importer: 'session',
    format: 'tab-session-manager',
    data: TAB_SESSION_MANAGER,
    rules: 2,
    allDisabled: true,
    contains: [{ groupTitle: 'Work' }],
  },
  {
    name: 'Tablerone backup',
    importer: 'session',
    format: 'tablerone',
    data: {
      export: [
        { title: 'GitHub', tabs: [{ url: 'https://github.com/a', title: 'GH' }], tags: ['dev'], favourite: false },
      ],
    },
    rules: 2,
    allDisabled: true,
    contains: [{ groupTitle: 'GitHub' }],
  },
  {
    name: 'Session Buddy collections',
    importer: 'session',
    format: 'session-buddy',
    data: {
      collections: [
        {
          title: 'Furry friends',
          folders: [
            {
              title: 'Dogs',
              links: [
                { title: 'German Shepherd', url: 'https://en.wikipedia.org/wiki/German_Shepherd' },
              ],
            },
            {
              title: 'Cats',
              links: [{ title: 'Ragdoll', url: 'https://www.youtube.com/results?search_query=Ragdoll' }],
            },
          ],
        },
      ],
    },
    rules: 3,
    allDisabled: true,
    contains: [{ groupTitle: 'Dogs' }, { groupTitle: 'Cats' }],
  },
  {
    name: 'Toby lists',
    importer: 'session',
    format: 'toby',
    data: {
      version: 3,
      lists: [
        {
          title: 'Github actions sample',
          cards: [
            { title: 'Inbox', url: 'https://mail.google.com/mail/u' },
            { title: 'search results', url: 'https://github.com/search' },
          ],
          labels: ['Work'],
        },
      ],
    },
    rules: 2,
    allDisabled: true,
    contains: [{ groupTitle: 'Github actions sample' }],
  },
  {
    name: 'Workona export (capitalised Workspaces)',
    importer: 'session',
    format: 'workona',
    data: {
      User: { email: 'someone@example.com', id: 'xyz' },
      Workspaces: [
        {
          title: 'Title One',
          tabs: [{ title: 'How to Use Workona', url: 'https://workona.com/help/how-to-use-workona/' }],
          resources: [],
          notes: [],
          tasks: [],
        },
      ],
      'My Tasks': { Today: [] },
    },
    rules: 2,
    allDisabled: true,
    contains: [{ groupTitle: 'Title One' }],
  },
  {
    name: 'OneTab text export',
    importer: 'text-list',
    format: 'text-list',
    text: 'https://github.com/a | GH A\nhttps://news.ycombinator.com/ | HN\nhttps://github.com/b | GH B',
    rules: 1,
    contains: [{ target: 'url', mode: 'regex', groupTitle: '$1' }],
  },
  {
    name: 'Bookmarks HTML export',
    importer: 'html',
    format: 'html',
    text: '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><A HREF="https://github.com/a" ADD_DATE="1">GH A</A><DT><A HREF="https://news.ycombinator.com/">HN</A></DL>',
    rules: 1,
  },
  {
    name: 'Generic rules array',
    importer: 'generic',
    format: 'generic',
    data: [{ pattern: 'foo-.*', group: 'Foo' }],
    rules: 1,
    contains: [{ pattern: 'foo-.*', groupTitle: 'Foo' }],
  },
];
