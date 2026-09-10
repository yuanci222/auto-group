import { describe, expect, it } from 'vitest';
import { mergeImport, parseImport } from '../src/core/importers';
import { createEmptyRuleSet } from '../src/core/types';
import { FIXTURES, fixtureText } from './fixtures';

/** Deterministic PRNG so failures are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEYS = [
  'rules',
  'match',
  'group',
  'pattern',
  'target',
  'mode',
  'title',
  'url',
  'tabs',
  'links',
  'cards',
  'groups',
  'id',
  'name',
  'url_fragment',
  'detection',
  'catchTabRules',
  'domainGroups',
  'matchers',
  'collections',
  'folders',
  'Workspaces',
  'export',
  'meta',
  'customRules',
  '__proto__',
  'constructor',
  'prototype',
];

const CHARS = 'abcXYZ0123 \t\n{}[]":,.\\/<>|*?$^()+-_=@#%&';

function randomString(rng: () => number): string {
  const length = Math.floor(rng() * 20);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CHARS[Math.floor(rng() * CHARS.length)];
  }
  return out;
}

function randomValue(rng: () => number, depth = 0): unknown {
  const roll = rng();
  if (depth > 3 || roll < 0.4) {
    const pick = rng();
    if (pick < 0.4) return randomString(rng);
    if (pick < 0.55) return Math.floor(rng() * 1e6);
    if (pick < 0.65) return rng() < 0.5;
    if (pick < 0.75) return null;
    if (pick < 0.9) return rng() * 1000;
    return randomString(rng);
  }
  if (roll < 0.7) {
    const length = Math.floor(rng() * 4);
    return Array.from({ length }, () => randomValue(rng, depth + 1));
  }
  // Null-prototype object so a literal `__proto__` key survives JSON.stringify.
  const obj: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const length = Math.floor(rng() * 4);
  for (let i = 0; i < length; i++) {
    obj[KEYS[Math.floor(rng() * KEYS.length)]!] = randomValue(rng, depth + 1);
  }
  return obj;
}

const MALFORMED: string[] = [
  '',
  '   ',
  'null',
  'true',
  '0',
  '"just a string"',
  '[]',
  '{}',
  '[[]]',
  '[[[]]]',
  '{',
  '[',
  '{"a":',
  'not a config file at all',
  '<html><body>',
  '<a href=',
  'https://',
  '\u0000\u0001\u0002',
  '{"rules":null}',
  '{"rules":"nope"}',
  '{"rules":[null,1,"x",[]]}',
  '{"rules":{}}',
  '{"groups":null}',
  '{"export":[]}',
  '{"collections":[]}',
  '{"domainGroups":{}}',
  '{"__proto__":{"polluted":true}}',
  '{"__proto__":{"polluted":true},"rules":[{"__proto__":{"polluted":true}}]}',
  '[{"__proto__":{"polluted":true}}]',
  '{"rules":[{"match":{"pattern":"("}}]}',
  JSON.stringify({ rules: [{ match: { pattern: 'a'.repeat(5000) } }] }),
];

describe('parser robustness', () => {
  it('never throws on malformed input', () => {
    for (const text of MALFORMED) {
      let outcome;
      expect(() => {
        outcome = parseImport(text);
      }, `threw on ${JSON.stringify(text.slice(0, 40))}`).not.toThrow();
      expect(Array.isArray(outcome!.errors)).toBe(true);
      expect(Array.isArray(outcome!.guesses)).toBe(true);
    }
  });

  it('never throws on random JSON', () => {
    const rng = mulberry32(20260910);
    for (let i = 0; i < 800; i++) {
      const text = JSON.stringify(randomValue(rng));
      expect(() => parseImport(text)).not.toThrow();
      const outcome = parseImport(text);
      if (outcome.result) {
        expect(typeof outcome.result.format).toBe('string');
        for (const rule of outcome.result.rules) {
          expect(typeof rule.id).toBe('string');
          expect(rule.id.length).toBeGreaterThan(0);
          expect(typeof rule.match.pattern).toBe('string');
          expect(typeof rule.name).toBe('string');
          expect(['title', 'url', 'both']).toContain(rule.match.target);
        }
      }
    }
  });

  it('does not pollute Object.prototype', () => {
    for (const text of MALFORMED) parseImport(text);
    expect('polluted' in {}).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('handles a large session without losing tabs', () => {
    const tabs = Array.from({ length: 500 }, (_, i) => ({
      url: `https://site${i % 20}.example.com/page/${i}`,
      title: `Tab ${i}`,
    }));
    const text = JSON.stringify([
      { tabs, windowsInfo: { id: 1 }, name: 'Big', id: 'big', date: 1, sessionStartTime: 1 },
    ]);
    const { result } = parseImport(text);
    expect(result).not.toBeNull();
    // One named-group rule plus the "group every site by domain" fallback.
    expect(result!.rules.length).toBe(2);
    expect(result!.format).toBe('tab-manager-plus');
  });
});

describe('merge invariants', () => {
  for (const fixture of FIXTURES) {
    it(`re-importing ${fixture.name} adds nothing`, () => {
      const { result } = parseImport(fixtureText(fixture));
      if (!result || result.rules.length === 0) return;

      const first = mergeImport(createEmptyRuleSet(), result);
      expect(first.added.length).toBeGreaterThan(0);
      expect(first.added.length).toBeLessThanOrEqual(result.rules.length);

      const second = mergeImport(first.ruleSet, result);
      expect(second.added).toHaveLength(0);
      expect(second.duplicates).toHaveLength(result.rules.length);
      expect(second.ruleSet.rules).toHaveLength(first.ruleSet.rules.length);
    });
  }

  it('never mutates the base ruleset', () => {
    const base = createEmptyRuleSet();
    const before = JSON.stringify(base);
    for (const fixture of FIXTURES) {
      const { result } = parseImport(fixtureText(fixture));
      if (result) mergeImport(base, result);
    }
    expect(JSON.stringify(base)).toBe(before);
  });
});
