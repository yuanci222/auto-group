/**
 * Importers for the wider auto-grouping ecosystem.
 *
 * Formats are implemented from the published exports / storage schemas of:
 *  - loilo/auto-group-tabs (match patterns + `/regex/flags`)
 *  - Tab Groups Extension by guokai.dev (target/method/value triples)
 *  - nitzanpap/auto-tab-groups (wildcard + `{capture}` + `title:` DSL)
 *  - Auto Tab Groups by jackcellphonerepair (NAME/URL/COLOR maps)
 *  - Auto Tab Grouper by diasDominik (domainGroups map)
 *  - Regex Tab Organizer (regex/groupName)
 *  - Tabs Manager - Auto Group and Save (customRules with AND groups)
 */
import { createRule } from '../rules';
import { isGroupColor, type GroupColor, type GroupNameMode, type MatchMode, type Rule } from '../types';
import { asArray, emptyResult, isRecord, str, type ImportResult, type Importer } from './types';

function color(value: unknown): GroupColor | undefined {
  const raw = str(value);
  return isGroupColor(raw) ? raw : undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Chrome-style match pattern (`*://*.host/path*`) → anchored regex source. */
export function matchPatternToRegex(pattern: string): string {
  let scheme = '*';
  let rest = pattern;
  const schemeMatch = /^([a-z*]+):\/\//i.exec(pattern);
  if (schemeMatch) {
    scheme = schemeMatch[1]!;
    rest = pattern.slice(schemeMatch[0].length);
  }

  const slash = rest.indexOf('/');
  let host = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? '' : rest.slice(slash);

  let port = '';
  const portMatch = /:(\*|\d+)$/.exec(host);
  if (portMatch) {
    port = portMatch[1]!;
    host = host.slice(0, -portMatch[0].length);
  }

  const schemeRe = scheme === '*' ? 'https?' : escapeRegex(scheme);
  let hostRe: string;
  if (host === '*') hostRe = '[^/]+';
  else if (host.startsWith('*.')) hostRe = `([^/]+\\.)?${escapeRegex(host.slice(2))}`;
  else if (host.includes('*')) hostRe = escapeRegex(host).replace(/\\\*/g, '[^/]*');
  else hostRe = escapeRegex(host);

  const portRe = port === '' ? '' : port === '*' ? '(:\\d+)?' : `:${port}`;
  const pathRe = path ? path.split('*').map(escapeRegex).join('.*') : '(/.*)?';
  return `^${schemeRe}://${hostRe}${portRe}${pathRe}`;
}

function parseSlashRegex(value: string): { source: string; flags: string } | null {
  if (!value.startsWith('/')) return null;
  const end = value.lastIndexOf('/');
  if (end <= 0) return null;
  return { source: value.slice(1, end), flags: value.slice(end + 1) };
}

// --- loilo / auto-group-tabs -------------------------------------------------

function isLoilo(data: unknown): boolean {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    data.every(
      (item) =>
        isRecord(item) &&
        Array.isArray(item.matchers) &&
        typeof item.title === 'string' &&
        (isRecord(item.options) || 'color' in item),
    )
  );
}

function convertLoilo(data: unknown): ImportResult {
  const warnings: string[] = [];
  const rules: Rule[] = [];
  let skipped = 0;

  for (const item of asArray(data)) {
    if (!isRecord(item)) continue;
    const title = str(item.title) ?? '';
    const options = isRecord(item.options) ? item.options : {};
    const matchers = asArray(item.matchers).map(str).filter((m): m is string => Boolean(m));
    if (!title || matchers.length === 0) {
      skipped += 1;
      continue;
    }
    for (const matcher of matchers) {
      const slash = parseSlashRegex(matcher);
      rules.push(
        createRule({
          name: `Auto-Group Tabs: ${title}`,
          pattern: slash ? slash.source : matchPatternToRegex(matcher),
          target: 'url',
          mode: 'regex',
          flags: slash ? slash.flags || 'i' : 'i',
          groupMode: 'fixed',
          title,
          color: color(item.color),
          options: { collapse: false },
          note: options.strict ? 'Source rule used strict mode (ungroup when the URL stops matching).' : undefined,
          source: { format: 'auto-group-tabs-loilo', ruleId: str(item.id), raw: item },
        }),
      );
    }
    if (options.merge === true) {
      warnings.push(
        `"${title}": the source rule merged groups across windows; Auto Group is per-window.`,
      );
    }
  }

  return {
    format: 'auto-group-tabs-loilo',
    label: 'Auto-Group Tabs (loilo)',
    rules,
    warnings,
    stats: { parsed: asArray(data).length, skipped },
  };
}

export const loiloImporter: Importer = {
  id: 'auto-group-tabs-loilo',
  label: 'Auto-Group Tabs (loilo)',
  detect: (data) => (isLoilo(data) ? 0.95 : 0),
  convert: convertLoilo,
};

// --- Tab Groups Extension (guokai.dev, 100k users) --------------------------

const METHOD_MAP: Record<string, MatchMode> = {
  includes: 'contains',
  startsWith: 'startsWith',
  endsWith: 'endsWith',
  equal: 'exact',
  regex: 'regex',
};

function isTabGroupsExtension(data: unknown): boolean {
  if (!isRecord(data)) return false;
  if (isRecord(data.meta) && str(data.meta.name) === 'tab-groups-rules') return true;
  const keys = Object.keys(data).filter((key) => key.startsWith('rule-'));
  return (
    keys.length > 0 &&
    keys.every((key) => {
      const rule = data[key];
      return isRecord(rule) && (Array.isArray(rule.urlMatches) || Array.isArray(rule.titleMatches));
    })
  );
}

function convertTabGroupsExtension(data: unknown): ImportResult {
  if (!isRecord(data)) return emptyResult('tab-groups-extension', 'Tab Groups Extension');
  const rules: Rule[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (const [key, raw] of Object.entries(data)) {
    if (!key.startsWith('rule-') || !isRecord(raw)) continue;
    const title = str(raw.groupName) ?? '';
    if (!title) {
      skipped += 1;
      continue;
    }
    const enabled = raw.enabled !== false;
    const groupColor = color(raw.groupColor);

    for (const matcher of asArray(raw.urlMatches).filter(isRecord)) {
      const method = str(matcher.method) ?? 'includes';
      const value = str(matcher.value);
      if (!value) continue;
      rules.push(
        createRule({
          name: `${str(raw.ruleName) ?? title} (url)`,
          enabled,
          pattern: value,
          target: 'url',
          mode: METHOD_MAP[method] ?? 'contains',
          flags: 'iu',
          groupMode: 'fixed',
          title,
          color: groupColor,
          source: { format: 'tab-groups-extension', ruleId: str(raw.id) ?? key, raw },
        }),
      );
    }

    for (const matcher of asArray(raw.titleMatches).filter(isRecord)) {
      const method = str(matcher.method) ?? 'includes';
      const value = str(matcher.value);
      if (!value) continue;
      rules.push(
        createRule({
          name: `${str(raw.ruleName) ?? title} (title)`,
          enabled,
          pattern: value,
          target: 'title',
          mode: METHOD_MAP[method] ?? 'contains',
          flags: matcher.ignoreCase === false ? '' : 'i',
          caseSensitive: matcher.ignoreCase === false,
          groupMode: 'fixed',
          title,
          color: groupColor,
          source: { format: 'tab-groups-extension', ruleId: str(raw.id) ?? key, raw },
        }),
      );
    }
  }

  if (skipped) warnings.push(`${skipped} rule(s) had no group name and were skipped.`);
  return {
    format: 'tab-groups-extension',
    label: 'Tab Groups Extension',
    rules,
    warnings,
    stats: { parsed: Object.keys(data).filter((k) => k.startsWith('rule-')).length, skipped },
  };
}

export const tabGroupsExtensionImporter: Importer = {
  id: 'tab-groups-extension',
  label: 'Tab Groups Extension (guokai.dev)',
  detect: (data) => (isTabGroupsExtension(data) ? 1 : 0),
  convert: convertTabGroupsExtension,
};

// --- nitzanpap / auto-tab-groups --------------------------------------------

function isNitzanpap(data: unknown): boolean {
  if (!isRecord(data) || !isRecord(data.rules)) return false;
  if (Array.isArray(data.rules)) return false;
  return 'exportDate' in data || 'totalRules' in data || 'version' in data;
}

interface DslPattern {
  target: 'url' | 'title';
  mode: MatchMode;
  pattern: string;
  flags?: string;
  groupMode?: GroupNameMode;
  template?: string;
}

function compileDsl(pattern: string): DslPattern | null {
  if (!pattern || pattern.startsWith('!')) return null; // exclusion

  if (pattern.startsWith('title:')) {
    const rest = pattern.slice('title:'.length);
    return { target: 'title', mode: rest.includes('*') ? 'wildcard' : 'contains', pattern: rest };
  }

  const slash = parseSlashRegex(pattern);
  if (slash) return { target: 'url', mode: 'regex', pattern: slash.source, flags: slash.flags || 'i' };

  if (pattern.includes('{') || pattern.includes('*')) {
    let source = '';
    let captures = 0;
    const token = /\{([^}]+)\}|\*\*|\*|[^{}*]+/g;
    let match: RegExpExecArray | null;
    while ((match = token.exec(pattern))) {
      const text = match[0];
      if (text === '**') source += '.*';
      else if (text === '*') source += '[^./]+';
      else if (text.startsWith('{')) {
        source += '([^./]+)';
        captures += 1;
      } else source += escapeRegex(text);
    }
    const anchored = `^https?://${pattern.startsWith('*.') ? '' : '(?:[^/]*\\.)?'}${source}(?::\\d+)?(?:/|$)`;
    return {
      target: 'url',
      mode: 'regex',
      pattern: anchored,
      flags: 'i',
      groupMode: captures > 0 ? 'perMatch' : 'fixed',
      template: captures > 0 ? '$1' : undefined,
    };
  }

  return { target: 'url', mode: 'domain', pattern };
}

function convertNitzanpap(data: unknown): ImportResult {
  if (!isRecord(data)) return emptyResult('auto-tab-groups-nitzanpap', 'Auto Tab Groups (nitzanpap)');
  const rules: Rule[] = [];
  const warnings: string[] = [];
  const entries = Object.values(data.rules as Record<string, unknown>).filter(isRecord);

  for (const raw of entries) {
    const name = str(raw.name) ?? 'Auto Tab Groups';
    const domains = asArray(raw.domains).map(str).filter((d): d is string => Boolean(d));
    for (const domain of domains) {
      const compiled = compileDsl(domain);
      if (!compiled) {
        warnings.push(`"${name}": exclusion pattern "${domain}" is not supported and was skipped.`);
        continue;
      }
      rules.push(
        createRule({
          name: `${name}: ${domain}`,
          enabled: raw.enabled !== false,
          pattern: compiled.pattern,
          target: compiled.target,
          mode: compiled.mode,
          flags: compiled.flags ?? 'i',
          groupMode: compiled.groupMode ?? 'fixed',
          title: name,
          template: compiled.template,
          color: color(raw.color),
          priority: typeof raw.priority === 'number' ? raw.priority : 0,
          note: compiled.groupMode === 'perMatch' ? 'Capture-based dynamic group.' : undefined,
          source: { format: 'auto-tab-groups-nitzanpap', ruleId: str(raw.id), raw },
        }),
      );
    }
    if (raw.isBlacklist === true) {
      warnings.push(`"${name}" was a blacklist rule; imported rules may need review.`);
    }
  }

  return {
    format: 'auto-tab-groups-nitzanpap',
    label: 'Auto Tab Groups (nitzanpap)',
    rules,
    warnings,
    stats: { parsed: entries.length, skipped: 0 },
  };
}

export const nitzanpapImporter: Importer = {
  id: 'auto-tab-groups-nitzanpap',
  label: 'Auto Tab Groups (nitzanpap)',
  detect: (data) => (isNitzanpap(data) ? 1 : 0),
  convert: convertNitzanpap,
};

// --- Auto Tab Groups (jackcellphonerepair) ----------------------------------

function isNameUrlColor(data: unknown): boolean {
  if (!Array.isArray(data) || data.length === 0) return false;
  return data.every(
    (entry) =>
      isRecord(entry) &&
      Object.values(entry).every((value) => isRecord(value) && 'NAME' in value && 'URL' in value),
  );
}

function convertNameUrlColor(data: unknown): ImportResult {
  const rules: Rule[] = [];
  for (const entry of asArray(data)) {
    if (!isRecord(entry)) continue;
    for (const value of Object.values(entry)) {
      if (!isRecord(value)) continue;
      const title = str(value.NAME);
      const urls = asArray(value.URL).map(str).filter((u): u is string => Boolean(u));
      if (!title || urls.length === 0) continue;
      rules.push(
        createRule({
          name: `Auto Tab Groups: ${title}`,
          pattern: urls[0]!,
          patterns: urls.length > 1 ? urls.slice(1) : undefined,
          target: 'url',
          mode: 'contains',
          caseSensitive: true,
          groupMode: 'fixed',
          title,
          color: color(value.COLOR),
          source: { format: 'auto-tab-groups-simple', raw: value },
        }),
      );
    }
  }
  return {
    format: 'auto-tab-groups-simple',
    label: 'Auto Tab Groups (URL list)',
    rules,
    warnings: [],
    stats: { parsed: rules.length, skipped: 0 },
  };
}

export const nameUrlColorImporter: Importer = {
  id: 'auto-tab-groups-simple',
  label: 'Auto Tab Groups (NAME/URL/COLOR)',
  detect: (data) => (isNameUrlColor(data) ? 0.9 : 0),
  convert: convertNameUrlColor,
};

// --- Auto Tab Grouper (diasDominik) -----------------------------------------

function isDomainGroups(data: unknown): boolean {
  return isRecord(data) && isRecord(data.domainGroups);
}

function convertDomainGroups(data: unknown): ImportResult {
  if (!isRecord(data) || !isRecord(data.domainGroups)) {
    return emptyResult('auto-tab-grouper', 'Auto Tab Grouper');
  }
  const rules: Rule[] = [];
  for (const [pattern, raw] of Object.entries(data.domainGroups)) {
    if (!isRecord(raw)) continue;
    const title = str(raw.title);
    if (!title) continue;
    const isRegex = raw.isRegex === true;
    rules.push(
      createRule({
        name: `Auto Tab Grouper: ${title}`,
        enabled: raw.enabled !== false,
        pattern: isRegex ? pattern : pattern.replace(/^\*\./, ''),
        target: 'url',
        mode: isRegex ? 'regex' : 'domain',
        flags: isRegex ? '' : 'i',
        caseSensitive: isRegex,
        groupMode: 'fixed',
        title,
        color: color(raw.color),
        source: { format: 'auto-tab-grouper', raw },
      }),
    );
  }
  return {
    format: 'auto-tab-grouper',
    label: 'Auto Tab Grouper',
    rules,
    warnings: [],
    stats: { parsed: rules.length, skipped: 0 },
  };
}

export const domainGroupsImporter: Importer = {
  id: 'auto-tab-grouper',
  label: 'Auto Tab Grouper (diasDominik)',
  detect: (data) => (isDomainGroups(data) ? 0.9 : 0),
  convert: convertDomainGroups,
};

// --- Regex Tab Organizer -----------------------------------------------------

function isRegexOrganizer(data: unknown): boolean {
  return (
    isRecord(data) &&
    Array.isArray(data.rules) &&
    data.rules.length > 0 &&
    data.rules.every((rule) => isRecord(rule) && typeof rule.regex === 'string' && 'groupName' in rule)
  );
}

function convertRegexOrganizer(data: unknown): ImportResult {
  const rules: Rule[] = [];
  for (const raw of asArray(isRecord(data) ? data.rules : []).filter(isRecord)) {
    const title = str(raw.groupName);
    const pattern = str(raw.regex);
    if (!title || !pattern) continue;
    rules.push(
      createRule({
        name: `Regex Tab Organizer: ${title}`,
        enabled: raw.enabled !== false,
        pattern,
        target: 'both',
        mode: 'regex',
        flags: 'i',
        groupMode: 'fixed',
        title,
        color: color(raw.color),
        source: { format: 'regex-tab-organizer', raw },
      }),
    );
  }
  return {
    format: 'regex-tab-organizer',
    label: 'Regex Tab Organizer',
    rules,
    warnings: [],
    stats: { parsed: rules.length, skipped: 0 },
  };
}

export const regexOrganizerImporter: Importer = {
  id: 'regex-tab-organizer',
  label: 'Regex Tab Organizer',
  detect: (data) => (isRegexOrganizer(data) ? 0.9 : 0),
  convert: convertRegexOrganizer,
};

// --- Tabs Manager - Auto Group and Save -------------------------------------

function isTabsManager(data: unknown): boolean {
  return isRecord(data) && Array.isArray(data.customRules);
}

function convertTabsManager(data: unknown): ImportResult {
  if (!isRecord(data)) return emptyResult('tabs-manager', 'Tabs Manager');
  const rules: Rule[] = [];
  const warnings: string[] = [];

  for (const custom of asArray(data.customRules).filter(isRecord)) {
    for (const group of asArray(custom.groups).filter(isRecord)) {
      const title = str(group.title);
      if (!title) continue;
      const match = isRecord(group.match) ? group.match : {};
      const regexes = asArray(match.regexMatches).map(str).filter(Boolean) as string[];
      const hosts = asArray(match.hostContains).map(str).filter(Boolean) as string[];
      const urls = asArray(match.urlContains).map(str).filter(Boolean) as string[];
      const titles = asArray(match.titleContains).map(str).filter(Boolean) as string[];

      const conditionTypes = [regexes, hosts, urls, titles].filter((list) => list.length > 0).length;
      if (conditionTypes > 1) {
        warnings.push(
          `"${title}": the source rule combined several condition types with AND; imported as OR — please review.`,
        );
      }

      for (const pattern of regexes) {
        rules.push(
          createRule({
            name: `Tabs Manager: ${title} (regex)`,
            pattern,
            target: 'url',
            mode: 'regex',
            flags: 'i',
            groupMode: 'fixed',
            title,
            color: color(group.color),
            source: { format: 'tabs-manager', raw: group },
          }),
        );
      }
      for (const pattern of hosts) {
        rules.push(
          createRule({
            name: `Tabs Manager: ${title} (host)`,
            pattern,
            target: 'url',
            mode: 'domain',
            groupMode: 'fixed',
            title,
            color: color(group.color),
            source: { format: 'tabs-manager', raw: group },
          }),
        );
      }
      for (const pattern of urls) {
        rules.push(
          createRule({
            name: `Tabs Manager: ${title} (url)`,
            pattern,
            target: 'url',
            mode: 'contains',
            groupMode: 'fixed',
            title,
            color: color(group.color),
            source: { format: 'tabs-manager', raw: group },
          }),
        );
      }
      for (const pattern of titles) {
        rules.push(
          createRule({
            name: `Tabs Manager: ${title} (title)`,
            pattern,
            target: 'title',
            mode: 'contains',
            groupMode: 'fixed',
            title,
            color: color(group.color),
            source: { format: 'tabs-manager', raw: group },
          }),
        );
      }
    }
  }

  return {
    format: 'tabs-manager',
    label: 'Tabs Manager - Auto Group and Save',
    rules,
    warnings,
    stats: { parsed: asArray(data.customRules).length, skipped: 0 },
  };
}

export const tabsManagerImporter: Importer = {
  id: 'tabs-manager',
  label: 'Tabs Manager - Auto Group and Save',
  detect: (data) => (isTabsManager(data) ? 0.9 : 0),
  convert: convertTabsManager,
};
