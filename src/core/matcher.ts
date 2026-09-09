/**
 * Pattern compilation and tab matching.
 *
 * Pure functions only: no `chrome.*` access, so this module is fully unit
 * testable under Node/Vitest.
 */
import type { MatchResult, Rule, RuleMatch, TabInfo } from './types';

/** Thrown when a rule contains an invalid pattern. Never thrown at match time. */
export class PatternError extends Error {
  constructor(
    message: string,
    readonly pattern: string,
  ) {
    super(message);
    this.name = 'PatternError';
  }
}

const regexCache = new Map<string, RegExp>();

/** Compile a JS regex source, caching the result. `g` is always added. */
export function compileRegex(source: string, flags = 'i'): RegExp {
  const cleanFlags = (flags || '').replace(/[gy]/g, '');
  const cacheKey = `${source}\u0000${cleanFlags}`;
  const cached = regexCache.get(cacheKey);
  if (cached) {
    cached.lastIndex = 0;
    return cached;
  }
  let re: RegExp;
  try {
    re = new RegExp(source, `${cleanFlags}g`);
  } catch (err) {
    throw new PatternError(err instanceof Error ? err.message : String(err), source);
  }
  regexCache.set(cacheKey, re);
  return re;
}

/** Turn a glob (`*`, `?`) into an anchored regex source. */
export function globToRegex(glob: string): string {
  let out = '';
  for (const ch of glob) {
    if (ch === '*') out += '.*';
    else if (ch === '?') out += '.';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return `^${out}$`;
}

/** Hostname of a URL, or an empty string when it cannot be parsed. */
export function hostnameOf(url: string | undefined): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.hostname;
    return parsed.hostname || '';
  } catch {
    return '';
  }
}

/**
 * Validate a rule's pattern without touching a tab. Returns an error message
 * or `null` when the rule is usable.
 */
export function validateMatch(match: RuleMatch): string | null {
  const patterns = [match.pattern, ...(match.patterns ?? [])].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  if (patterns.length === 0) return 'Pattern is empty';
  if (match.mode !== 'regex') return null;
  for (const pattern of patterns) {
    try {
      compileRegex(pattern, match.flags);
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }
  return null;
}

function haystacks(match: RuleMatch, tab: TabInfo): Array<{ kind: 'title' | 'url'; value: string }> {
  const title = tab.title ?? '';
  const url = tab.url ?? '';
  switch (match.target) {
    case 'title':
      return [{ kind: 'title', value: title }];
    case 'url':
      return [{ kind: 'url', value: url }];
    case 'both':
      return [
        { kind: 'title', value: title },
        { kind: 'url', value: url },
      ];
  }
}

interface RawMatch {
  match: string;
  captures: string[];
  named: Record<string, string>;
  pattern: string;
}

function execRegex(re: RegExp, value: string, pattern: string): RawMatch | null {
  re.lastIndex = 0;
  const m = re.exec(value);
  if (!m) return null;
  return {
    match: m[0],
    captures: Array.from(m),
    named: m.groups ? { ...m.groups } as Record<string, string> : {},
    pattern,
  };
}

function matchOne(pattern: string, match: RuleMatch, value: string): RawMatch | null {
  const caseSensitive = match.caseSensitive ?? !(match.flags ?? 'i').includes('i');
  const hay = caseSensitive ? value : value.toLowerCase();
  const needle = caseSensitive ? pattern : pattern.toLowerCase();
  switch (match.mode) {
    case 'regex': {
      let flags = match.flags ?? 'i';
      if (match.caseSensitive === true) flags = flags.replace(/i/g, '');
      else if (match.caseSensitive === false && !flags.includes('i')) flags += 'i';
      return execRegex(compileRegex(pattern, flags), value, pattern);
    }
    case 'wildcard': {
      const flags = caseSensitive ? '' : 'i';
      return execRegex(compileRegex(globToRegex(pattern), flags), value, pattern);
    }
    case 'contains':
      return hay.includes(needle) ? { match: value, captures: [value], named: {}, pattern } : null;
    case 'startsWith':
      return hay.startsWith(needle) ? { match: value, captures: [value], named: {}, pattern } : null;
    case 'endsWith':
      return hay.endsWith(needle) ? { match: value, captures: [value], named: {}, pattern } : null;
    case 'exact':
      return hay === needle ? { match: value, captures: [value], named: {}, pattern } : null;
    case 'domain': {
      const host = hostnameOf(value).toLowerCase();
      const domain = pattern.toLowerCase().replace(/^www\./, '');
      if (!host) return null;
      const bare = host.replace(/^www\./, '');
      const hit = bare === domain || bare.endsWith(`.${domain}`);
      return hit ? { match: host, captures: [host], named: {}, pattern } : null;
    }
  }
}

/** Find the first match of a rule against a tab, or `null`. */
export function matchTab(rule: Rule, tab: TabInfo): RawMatch | null {
  const { match } = rule;
  const patterns = [match.pattern, ...(match.patterns ?? [])].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  for (const { kind, value } of haystacks(match, tab)) {
    if (!value) continue;
    for (const pattern of patterns) {
      const hit = matchOne(pattern, match, value);
      if (!hit) continue;
      if (match.capturePattern) {
        const capTarget = match.captureTarget ?? kind;
        const capValue = capTarget === 'title' ? tab.title ?? '' : tab.url ?? '';
        const captured = execRegex(compileRegex(match.capturePattern, match.flags), capValue, pattern);
        if (captured) return { ...captured, pattern };
      }
      return hit;
    }
  }
  return null;
}

const TEMPLATE_RE = /\$(\d+)|\$\{([A-Za-z0-9_]+)\}|\{(\d+)\}/g;

/** Interpolate `$0`, `$1`, `${name}`, `{1}` in a title template. */
export function interpolate(
  template: string,
  raw: Pick<RawMatch, 'match' | 'captures' | 'named'>,
): string {
  return template.replace(TEMPLATE_RE, (whole, num: string, named: string, braceNum: string) => {
    if (num !== undefined) return raw.captures[Number(num)] ?? '';
    if (braceNum !== undefined) return raw.captures[Number(braceNum)] ?? '';
    if (named !== undefined) return raw.named[named] ?? '';
    return whole;
  });
}

function pickKey(raw: RawMatch, rule: Rule): string {
  const capture = rule.group.captureGroup;
  if (capture === undefined) return raw.match;
  if (typeof capture === 'number') return raw.captures[capture] ?? raw.match;
  return raw.named[capture] ?? raw.match;
}

/**
 * Resolve a raw match into the final `MatchResult`: the distinct key that
 * decides which group the tab belongs to, plus the group title.
 */
export function resolveMatch(rule: Rule, raw: RawMatch): MatchResult {
  const key = pickKey(raw, rule);
  const template = rule.group.template ?? rule.group.title ?? '$0';
  let groupTitle: string;
  switch (rule.group.mode) {
    case 'fixed':
      groupTitle = rule.group.title ?? template;
      break;
    case 'template':
      groupTitle = interpolate(template, raw);
      break;
    case 'perMatch':
      groupTitle = interpolate(template, raw) || key;
      break;
  }
  return {
    key: rule.group.mode === 'perMatch' ? key : groupTitle,
    groupTitle,
    match: raw.match,
    captures: raw.captures,
    named: raw.named,
    pattern: raw.pattern,
  };
}

/** Convenience: match a tab and resolve the result in one call. */
export function evaluateRule(rule: Rule, tab: TabInfo): MatchResult | null {
  if (!rule.enabled) return null;
  const raw = matchTab(rule, tab);
  if (!raw) return null;
  return resolveMatch(rule, raw);
}

/** Test a pattern against a string, for the options-page live tester. */
export function testPattern(
  match: RuleMatch,
  value: string,
): { ok: true; results: RawMatch[] } | { ok: false; error: string } {
  const patterns = [match.pattern, ...(match.patterns ?? [])].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  if (patterns.length === 0) return { ok: false, error: 'Pattern is empty' };
  const results: RawMatch[] = [];
  for (const pattern of patterns) {
    try {
      if (match.mode === 'regex') {
        const re = compileRegex(pattern, match.flags);
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        let guard = 0;
        while ((m = re.exec(value)) && guard++ < 100) {
          results.push({
            match: m[0],
            captures: Array.from(m),
            named: m.groups ? { ...m.groups } as Record<string, string> : {},
            pattern,
          });
          if (m.index === re.lastIndex) re.lastIndex++;
        }
      } else {
        const hit = matchOne(pattern, match, value);
        if (hit) results.push(hit);
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { ok: true, results };
}
