/**
 * Session / workspace export importers.
 *
 * Tab managers export *sessions*, not rules, so there is nothing to merge
 * directly. Instead we turn them into sensible starting rules:
 *
 *  - named groups (Toby lists, Workona workspaces, Simple Tab Groups, Tab
 *    Manager Plus sessions) become one `domain` rule per group, disabled so the
 *    user can review them before they fire;
 *  - everything else produces a single "group every site by domain" rule,
 *    also disabled.
 */
import { hostnameOf } from '../matcher';
import { createRule } from '../rules';
import { isGroupColor, type GroupColor, type Rule } from '../types';
import { asArray, emptyResult, isRecord, str, type ImportResult, type Importer } from './types';

export interface SessionTab {
  url?: string;
  title?: string;
  pinned?: boolean;
}

export interface SessionGroup {
  title?: string;
  color?: GroupColor;
  tabs: SessionTab[];
}

export interface SessionFile {
  format: string;
  label: string;
  groups: SessionGroup[];
  warnings: string[];
}

const MAX_HOSTNAMES_PER_GROUP = 40;
const MAX_NAMED_GROUPS = 50;

function tabFrom(value: unknown): SessionTab | null {
  if (typeof value === 'string') return { url: value };
  if (!isRecord(value)) return null;
  const url = str(value.url) ?? str(value.href) ?? str(value.link);
  if (!url) return null;
  return { url, title: str(value.title), pinned: value.pinned === true };
}

function tabsFrom(value: unknown): SessionTab[] {
  return asArray(value)
    .map(tabFrom)
    .filter((t): t is SessionTab => t !== null);
}

/** Rule that groups a known set of hostnames into a named group. */
function groupRule(title: string, hostnames: string[], color?: GroupColor): Rule | null {
  const unique = [...new Set(hostnames.filter(Boolean))].sort();
  if (unique.length === 0) return null;
  const [first, ...rest] = unique.slice(0, MAX_HOSTNAMES_PER_GROUP);
  const rule = createRule({
    name: `Group: ${title}`,
    enabled: false,
    pattern: first!,
    patterns: rest.length ? rest : undefined,
    target: 'url',
    mode: 'domain',
    groupMode: 'fixed',
    title,
    color,
    note: 'Imported from a saved session — review, then enable.',
    source: { format: 'session' },
  });
  return rule;
}

/** One rule that groups every site by its hostname. */
function domainPerMatchRule(exampleHosts: string[]): Rule {
  return createRule({
    name: 'Group every site by domain',
    enabled: false,
    pattern: '^https?://(?:[^/@]*@)?(?:www\\.)?([^/:?#]+)',
    target: 'url',
    mode: 'regex',
    flags: 'i',
    groupMode: 'perMatch',
    template: '$1',
    captureGroup: 1,
    note:
      'Imported from a session/URL list. Creates one group per hostname; ' +
      `hosts in the file included: ${exampleHosts.slice(0, 5).join(', ')}`,
    source: { format: 'session' },
  });
}

export function sessionToRules(file: SessionFile): ImportResult {
  const rules: Rule[] = [];
  const warnings = [...file.warnings];
  const named = file.groups.filter((g) => (g.title ?? '').trim() && g.tabs.length);
  const allHosts: string[] = [];

  for (const group of file.groups) {
    for (const tab of group.tabs) {
      const host = hostnameOf(tab.url);
      if (host) allHosts.push(host.replace(/^www\./, ''));
    }
  }

  let namedCount = 0;
  for (const group of named.slice(0, MAX_NAMED_GROUPS)) {
    const hosts = group.tabs
      .map((t) => hostnameOf(t.url))
      .filter(Boolean)
      .map((h) => h.replace(/^www\./, ''));
    const rule = groupRule(group.title!.trim(), hosts, group.color);
    if (rule) {
      rules.push(rule);
      namedCount += 1;
    }
  }
  if (named.length > MAX_NAMED_GROUPS) {
    warnings.push(`Only the first ${MAX_NAMED_GROUPS} named groups were converted to rules.`);
  }
  if (namedCount > 0) {
    warnings.push(
      `Created ${namedCount} disabled rule(s) from named groups. Enable the ones you want.`,
    );
  }

  if (allHosts.length) {
    rules.push(domainPerMatchRule([...new Set(allHosts)]));
    warnings.push(
      'Added a disabled "group every site by domain" rule — a good starting point if the file had no group names.',
    );
  }

  return {
    format: file.format,
    label: file.label,
    rules,
    warnings,
    stats: { parsed: rules.length, skipped: 0 },
  };
}

function detectTabManagerPlus(data: unknown): SessionFile | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const items = data.filter(isRecord);
  if (items.length !== data.length) return null;
  if (!items.every((item) => 'tabs' in item)) return null;
  return {
    format: 'tab-manager-plus',
    label: 'Tab Manager Plus (sessions)',
    groups: items.map((item) => ({
      title: str(item.name) ?? str(item.customName),
      color: isGroupColor(str(item.color)) ? (str(item.color) as GroupColor) : undefined,
      tabs: tabsFrom(item.tabs),
    })),
    warnings: [],
  };
}

function detectSessionBuddy(data: unknown): SessionFile | null {
  if (!isRecord(data)) return null;

  // Documented JSON export:
  //   { collections: [{ title, folders: [{ title, links: [{ url, title, pinned }] }] }] }
  const collections = asArray(data.collections).filter(isRecord);
  if (collections.length > 0) {
    const groups: SessionGroup[] = [];
    for (const collection of collections) {
      const folders = asArray(collection.folders).filter(isRecord);
      if (folders.length > 0) {
        for (const folder of folders) {
          groups.push({
            title: str(folder.title) ?? str(collection.title),
            tabs: tabsFrom(folder.links ?? folder.tabs),
          });
        }
      } else {
        groups.push({
          title: str(collection.title),
          tabs: tabsFrom(collection.links ?? collection.tabs),
        });
      }
    }
    return { format: 'session-buddy', label: 'Session Buddy', groups, warnings: [] };
  }

  // Older/simplified shape: { windows: [{ tabs: [...] }] }
  const windows = asArray(data.windows);
  if (windows.length > 0 && windows.every((w) => isRecord(w) && 'tabs' in w)) {
    return {
      format: 'session-buddy',
      label: 'Session Buddy',
      groups: [{ tabs: windows.flatMap((w) => tabsFrom((w as Record<string, unknown>).tabs)) }],
      warnings: [],
    };
  }
  return null;
}

function detectSimpleTabGroups(data: unknown): SessionFile | null {
  if (!isRecord(data)) return null;
  const groups = asArray(data.groups);
  if (groups.length === 0 || !groups.every((g) => isRecord(g) && ('tabs' in g || 'title' in g))) {
    return null;
  }
  return {
    format: 'simple-tab-groups',
    label: 'Simple Tab Groups',
    groups: groups.filter(isRecord).map((g) => ({
      title: str(g.title) ?? str(g.name),
      color: isGroupColor(str(g.color)) ? (str(g.color) as GroupColor) : undefined,
      tabs: tabsFrom(g.tabs),
    })),
    warnings: [],
  };
}

function detectToby(data: unknown): SessionFile | null {  if (!isRecord(data)) return null;
  const lists = asArray(data.lists);
  if (lists.length === 0) return null;
  return {
    format: 'toby',
    label: 'Toby',
    groups: lists.filter(isRecord).map((list) => ({
      title: str(list.title) ?? str(list.name),
      tabs: tabsFrom(list.cards ?? list.tabs),
    })),
    warnings: [],
  };
}

function detectWorkona(data: unknown): SessionFile | null {
  if (!isRecord(data)) return null;
  // The real export uses a capitalised `Workspaces` key (and may carry `resources`).
  const workspaces = asArray(data.Workspaces ?? data.workspaces);
  if (workspaces.length === 0) return null;
  return {
    format: 'workona',
    label: 'Workona',
    groups: workspaces.filter(isRecord).map((ws) => ({
      title: str(ws.title) ?? str(ws.name),
      tabs: tabsFrom(ws.tabs ?? ws.resources),
    })),
    warnings: [],
  };
}

function detectFlatSession(data: unknown): SessionFile | null {
  if (Array.isArray(data)) {
    const tabs = tabsFrom(data);
    if (tabs.length === 0) return null;
    return { format: 'tab-list', label: 'Tab list', groups: [{ tabs }], warnings: [] };
  }
  if (isRecord(data) && Array.isArray(data.tabs)) {
    return {
      format: 'tab-list',
      label: 'Tab list',
      groups: [{ tabs: tabsFrom(data.tabs) }],
      warnings: [],
    };
  }
  return null;
}

/** Tab Session Manager: an array of sessions with `windows` as a keyed map. */
function detectTabSessionManager(data: unknown): SessionFile | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const sessions = data.filter(isRecord);
  if (sessions.length !== data.length) return null;
  if (!sessions.every((s) => isRecord(s.windows) && !Array.isArray(s.windows))) return null;

  const groups: SessionGroup[] = [];
  for (const session of sessions) {
    const windows = session.windows as Record<string, unknown>;
    const rawTabs = Object.values(windows)
      .flatMap((win) => (isRecord(win) ? Object.values(win) : []))
      .filter(isRecord);
    const nativeGroups = asArray(session.tabGroups).filter(isRecord);
    const used = new Set<unknown>();

    for (const native of nativeGroups) {
      const title = str(native.title) ?? '';
      const tabs = rawTabs
        .filter((tab) => tab.groupId !== undefined && tab.groupId === native.id)
        .map((tab) => {
          used.add(tab);
          return { url: str(tab.url), title: str(tab.title), pinned: tab.pinned === true };
        })
        .filter((t) => t.url);
      if (title || tabs.length) groups.push({ title: title || undefined, tabs });
    }

    const rest = rawTabs
      .filter((tab) => !used.has(tab))
      .map((tab) => ({ url: str(tab.url), title: str(tab.title), pinned: tab.pinned === true }))
      .filter((t) => t.url);
    if (rest.length) groups.push({ tabs: rest });
  }

  return { format: 'tab-session-manager', label: 'Tab Session Manager', groups, warnings: [] };
}

/** Tablerone: `{ export: [ { title, tabs, tags } ] }`. */
function detectTablerone(data: unknown): SessionFile | null {
  if (!isRecord(data)) return null;
  const clusters = asArray(data.export);
  if (clusters.length === 0 || !clusters.every((c) => isRecord(c) && 'tabs' in c)) return null;
  return {
    format: 'tablerone',
    label: 'Tablerone',
    groups: clusters.filter(isRecord).map((cluster) => ({
      title: str(cluster.title),
      tabs: tabsFrom(cluster.tabs),
    })),
    warnings: [],
  };
}

const DETECTORS: Array<{ id: string; detect: (data: unknown) => SessionFile | null }> = [
  { id: 'tab-manager-plus', detect: detectTabManagerPlus },
  { id: 'tab-session-manager', detect: detectTabSessionManager },
  { id: 'tablerone', detect: detectTablerone },
  { id: 'simple-tab-groups', detect: detectSimpleTabGroups },
  { id: 'toby', detect: detectToby },
  { id: 'workona', detect: detectWorkona },
  { id: 'session-buddy', detect: detectSessionBuddy },
  { id: 'tab-list', detect: detectFlatSession },
];

export const sessionImporter: Importer = {
  id: 'session',
  label: 'Session / tab-list exports',
  detect(data) {
    for (const detector of DETECTORS) {
      if (detector.detect(data)) return 0.6;
    }
    return 0;
  },
  convert(data) {
    for (const detector of DETECTORS) {
      const file = detector.detect(data);
      if (file) return sessionToRules(file);
    }
    return emptyResult('session', 'Session');
  },
};
