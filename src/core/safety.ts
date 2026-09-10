/**
 * Pattern safety guards.
 *
 * Rules can be typed by hand, imported from another extension, or shared in a
 * file, so a careless or hostile regular expression must never be able to hang
 * the extension. There are two layers:
 *
 *  1. **Static** (`assessPattern`) rejects absurdly long patterns and the
 *     unambiguous catastrophic-backtracking shapes — nested quantifiers such as
 *     `(a+)+`, `(?:a*)*`, `(a{2,})+`, and a quantified group of literals where
 *     one alternative is a prefix of another, such as `(a|aa)+`.
 *  2. **Runtime** (the circuit breaker in `matcher.ts`) quarantines any pattern
 *     that repeatedly takes too long to execute. It is the backstop for shapes
 *     the static check cannot prove, e.g. `(a|aa|b)+` or `(\d|\w)+`.
 *
 * The static check is deliberately conservative: a false negative costs one
 * slow pass before the runtime breaker steps in, while a false positive would
 * reject a perfectly good rule, so only shapes that are provably pathological
 * are rejected.
 */
import type { Rule } from './types';

/** Patterns longer than this are rejected outright. */
export const MAX_PATTERN_LENGTH = 1000;

export interface PatternAssessment {
  ok: boolean;
  /** Human readable reason, shown in the UI and in import warnings. */
  reason?: string;
}

/** A quantifier that can repeat its atom an unbounded number of times. */
function readUnboundedQuantifier(
  source: string,
  index: number,
): { unbounded: boolean; length: number } | null {
  const char = source[index];
  if (char === '*' || char === '+') {
    let length = 1;
    if (source[index + 1] === '?') length += 1; // lazy
    if (source[index + 1] === '+') length += 1; // possessive
    return { unbounded: true, length };
  }
  if (char === '{') {
    const close = source.indexOf('}', index);
    if (close === -1) return null;
    const body = source.slice(index + 1, close);
    if (!/^\d+(,\d*)?$/.test(body)) return null;
    let length = close - index + 1;
    if (source[index + length] === '?') length += 1;
    return { unbounded: body.endsWith(','), length };
  }
  return null;
}

/** Split a group body on top-level `|` (ignoring nested groups and classes). */
function splitAlternatives(body: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let index = 0;
  while (index < body.length) {
    const char = body[index]!;
    if (char === '\\') {
      current += body.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (char === '[') {
      const close = findClassEnd(body, index);
      current += body.slice(index, close);
      index = close;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === '|' && depth === 0) {
      parts.push(current);
      current = '';
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }
  parts.push(current);
  return parts;
}

/** Index just past the `]` that closes the character class starting at `start`. */
function findClassEnd(source: string, start: number): number {
  let index = start + 1;
  if (source[index] === '^') index += 1;
  if (source[index] === ']') index += 1;
  while (index < source.length && source[index] !== ']') {
    if (source[index] === '\\') index += 1;
    index += 1;
  }
  return Math.min(index + 1, source.length);
}

/** True when the alternative is made only of literal characters. */
function isLiteral(alternative: string): boolean {
  return alternative.length > 0 && !/[\\[\](){}*+?|^$.]/.test(alternative);
}

/**
 * A quantified group of literals where one alternative is a prefix of another
 * can be matched in exponentially many ways (`(a|aa)+`).
 */
function hasOverlappingLiteralAlternatives(body: string): boolean {
  const alternatives = splitAlternatives(body);
  if (alternatives.length < 2) return false;
  if (!alternatives.every(isLiteral)) return false;
  for (let i = 0; i < alternatives.length; i++) {
    for (let j = i + 1; j < alternatives.length; j++) {
      const a = alternatives[i]!;
      const b = alternatives[j]!;
      if (a.startsWith(b) || b.startsWith(a)) return true;
    }
  }
  return false;
}

const NESTED_QUANTIFIER_REASON =
  'Pattern can backtrack catastrophically (a repeated group that itself repeats, e.g. `(a+)+`)';

/**
 * Detect the classic nested-quantifier ReDoS shape. Returns `true` for
 * `(a+)+`, `(?:a*)*`, `(a{2,})+`, `((a+))+`, `(a|aa)+` …
 */
export function hasCatastrophicShape(source: string): boolean {
  interface Frame {
    /** Start of the group body, used for the alternation check. */
    start: number;
    /** Some sub-expression inside this group repeats without bound. */
    unbounded: boolean;
  }
  const stack: Frame[] = [{ start: 0, unbounded: false }];
  let index = 0;

  while (index < source.length) {
    const char = source[index]!;

    if (char === '\\') {
      index += 2;
      continue;
    }

    if (char === '[') {
      index = findClassEnd(source, index);
      continue;
    }

    if (char === '(') {
      index += 1;
      // Skip the group prefix: `?:`, `?=`, `?!`, `?<=`, `?<!`, `?<name>`.
      if (source[index] === '?') {
        index += 1;
        if (source[index] === '<' && source[index + 1] !== '=' && source[index + 1] !== '!') {
          const close = source.indexOf('>', index);
          index = close === -1 ? source.length : close + 1;
        } else if (source[index] === '<' || source[index] === ':') {
          index += 1;
          if (source[index - 1] === '<') index += 1;
        }
      }
      stack.push({ start: index, unbounded: false });
      continue;
    }

    if (char === ')') {
      const frame = stack.pop() ?? { start: 0, unbounded: false };
      const body = source.slice(frame.start, index);
      index += 1;
      const quantifier = readUnboundedQuantifier(source, index);
      if (quantifier) {
        index += quantifier.length;
        if (quantifier.unbounded && (frame.unbounded || hasOverlappingLiteralAlternatives(body))) {
          return true;
        }
        if (quantifier.unbounded && stack.length > 0) {
          stack[stack.length - 1]!.unbounded = true;
        }
      } else if (frame.unbounded && stack.length > 0) {
        stack[stack.length - 1]!.unbounded = true;
      }
      continue;
    }

    if (char === '*' || char === '+' || char === '{') {
      const quantifier = readUnboundedQuantifier(source, index);
      if (quantifier) {
        index += quantifier.length;
        if (quantifier.unbounded && stack.length > 0) {
          stack[stack.length - 1]!.unbounded = true;
        }
        continue;
      }
      index += 1;
      continue;
    }

    index += 1;
  }

  return false;
}

/**
 * Static safety assessment for a single pattern. `mode` is the rule's match
 * mode: the backtracking checks only make sense for real regular expressions.
 */
export function assessPattern(pattern: string, mode = 'regex'): PatternAssessment {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return {
      ok: false,
      reason: `Pattern is too long (${pattern.length} characters, limit ${MAX_PATTERN_LENGTH})`,
    };
  }
  if (mode === 'regex' && hasCatastrophicShape(pattern)) {
    return { ok: false, reason: NESTED_QUANTIFIER_REASON };
  }
  return { ok: true };
}

/**
 * Whether every pattern a rule carries is safe to execute. Rules that fail this
 * are skipped by the planner and imported disabled.
 */
export function isRuleSafe(rule: Rule): boolean {
  if (!assessPattern(rule.match.pattern, rule.match.mode).ok) return false;
  if (!(rule.match.patterns ?? []).every((pattern) => assessPattern(pattern, rule.match.mode).ok)) {
    return false;
  }
  if (rule.match.capturePattern && !assessPattern(rule.match.capturePattern, 'regex').ok) {
    return false;
  }
  return true;
}
