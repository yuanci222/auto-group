import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IMPORTERS, parseImport } from '../src/core/importers';
import { FIXTURES, fixtureText, ruleMatches } from './fixtures';

const REAL_DIR = new URL('./fixtures/real/', import.meta.url).pathname;

describe('documented format conformance', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.name} → ${fixture.format}`, () => {
      const outcome = parseImport(fixtureText(fixture));
      const result = outcome.result;
      expect(result, outcome.errors.join(' | ')).not.toBeNull();
      if (!result) return;

      expect(outcome.guesses[0]?.format).toBe(fixture.importer);
      expect(result.format).toBe(fixture.format);
      expect(result.rules).toHaveLength(fixture.rules);
      if (fixture.skipped !== undefined) expect(result.stats.skipped).toBe(fixture.skipped);

      if (fixture.allDisabled) {
        expect(result.rules.every((rule) => !rule.enabled)).toBe(true);
      }

      for (const expected of fixture.contains ?? []) {
        const hit = result.rules.some((rule) => ruleMatches(rule, expected));
        expect(
          hit,
          `no rule matched ${JSON.stringify(expected)} in ${JSON.stringify(
            result.rules.map((r) => ({
              target: r.match.target,
              mode: r.match.mode,
              pattern: r.match.pattern,
              group: r.group.title ?? r.group.template,
            })),
          )}`,
        ).toBe(true);
      }

      const warnings = result.warnings.join(' ');
      for (const fragment of fixture.warningsContain ?? []) {
        expect(warnings).toContain(fragment);
      }

      // Importing must never lose rules silently.
      expect(result.stats.skipped + result.rules.length).toBeGreaterThanOrEqual(fixture.rules);
    });
  }

  it('covers every registered importer', () => {
    const covered = new Set(FIXTURES.map((fixture) => fixture.importer));
    const missing = IMPORTERS.map((importer) => importer.id).filter((id) => !covered.has(id));
    expect(missing, `no fixture exercises: ${missing.join(', ')}`).toEqual([]);
  });
});

/**
 * Drop a real export from another extension into
 * `tests/fixtures/real/<name>/` and it is smoke-tested automatically. `<name>`
 * may be either an importer id (`tab-modifier`) or a concrete result format
 * (`tab-manager-plus`, `session-buddy`, …) so session formats stay separated.
 */
function listRealFixtures(): Array<{ target: string; file: string; text: string }> {
  if (!existsSync(REAL_DIR)) return [];
  const found: Array<{ target: string; file: string; text: string }> = [];
  for (const entry of readdirSync(REAL_DIR)) {
    const dir = join(REAL_DIR, entry);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      if (file.startsWith('.') || file.toLowerCase() === 'readme.md') continue;
      found.push({
        target: entry,
        file: `${entry}/${file}`,
        text: readFileSync(join(dir, file), 'utf8'),
      });
    }
  }
  return found;
}

describe('real export drop-in', () => {
  const real = listRealFixtures();
  const curated = new Set(
    FIXTURES.map((fixture) => fixture.file).filter((file): file is string => Boolean(file)),
  );

  it('has a drop-in folder', () => {
    expect(existsSync(REAL_DIR)).toBe(true);
  });

  for (const item of real) {
    // Files with a curated expectation are already covered by the strict block above.
    if (curated.has(item.file)) continue;
    it(`${item.file} is detected as ${item.target}`, () => {
      const outcome = parseImport(item.text);
      const result = outcome.result;
      expect(result, outcome.errors.join(' | ')).not.toBeNull();
      if (!result) return;
      const detected = new Set(
        [result.format, outcome.guesses[0]?.format].filter((value): value is string => Boolean(value)),
      );
      expect(
        [...detected],
        `${item.file}: folder "${item.target}" must match the detected importer id or format`,
      ).toContain(item.target);
    });
  }
});
