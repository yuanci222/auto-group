/**
 * Plain-text and HTML importers: OneTab exports, bookmark exports, and any
 * file that is simply a list of URLs.
 */
import { createRule } from '../rules';
import type { Rule } from '../types';
import type { ImportResult, Importer } from './types';

const URL_RE = /https?:\/\/[^\s"'<>|]+/g;

export function extractUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  return [...new Set(found.map((u) => u.replace(/[.,;)]+$/, '')))];
}

function domainPerMatchRule(count: number): Rule {
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
    note: `Imported from a list of ${count} URL(s). Creates one group per hostname.`,
    source: { format: 'url-list' },
  });
}

function resultFromUrls(format: string, label: string, urls: string[]): ImportResult {
  const warnings: string[] = [];
  const rules: Rule[] = [];
  if (urls.length) {
    rules.push(domainPerMatchRule(urls.length));
    warnings.push(
      'A URL list contains no grouping rules, so a disabled "group every site by domain" rule was created instead.',
    );
  }
  return {
    format,
    label,
    rules,
    warnings,
    stats: { parsed: urls.length, skipped: 0 },
  };
}

export const textListImporter: Importer = {
  id: 'text-list',
  label: 'OneTab / URL list (text)',
  detect(data) {
    return typeof data === 'string' && URL_RE.test(data) ? 0.4 : 0;
  },
  convert(data) {
    const text = typeof data === 'string' ? data : '';
    return resultFromUrls('text-list', 'OneTab / URL list', extractUrls(text));
  },
};

export const htmlImporter: Importer = {
  id: 'html',
  label: 'Bookmarks / HTML export',
  detect(data) {
    if (typeof data !== 'string') return 0;
    return /<a\s[^>]*href=/i.test(data) ? 0.5 : 0;
  },
  convert(data) {
    const text = typeof data === 'string' ? data : '';
    return resultFromUrls('html', 'Bookmarks / HTML', extractUrls(text));
  },
};
