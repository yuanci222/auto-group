/**
 * Importer contract. Every supported third-party format is a small module that
 * detects its own shape and converts it into canonical `Rule` objects.
 */
import type { Rule, Settings } from '../types';

export interface ImportStats {
  /** Candidate rules found in the file. */
  parsed: number;
  /** Rules that could not be represented and were dropped. */
  skipped: number;
}

export interface ImportResult {
  /** Importer id, e.g. `tab-modifier`. */
  format: string;
  /** Human readable format name shown in the UI. */
  label: string;
  rules: Rule[];
  /** Settings carried by the file (only applied when the user opts in). */
  settings?: Partial<Settings>;
  warnings: string[];
  stats: ImportStats;
}

export interface Importer {
  id: string;
  label: string;
  /** 0 = definitely not mine, 1 = definitely mine. */
  detect(data: unknown): number;
  convert(data: unknown): ImportResult;
}

export function emptyResult(
  format: string,
  label: string,
  warnings: string[] = [],
): ImportResult {
  return {
    format,
    label,
    rules: [],
    warnings,
    stats: { parsed: 0, skipped: 0 },
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

export function str(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

export function bool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}
