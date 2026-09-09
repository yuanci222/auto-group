/**
 * Typed message protocol between the extension pages and the service worker.
 */
import type { Plan } from '../core/plan';
import type { RuleSet } from '../core/types';

export type ReconcileSummary = {
  windowId: number;
  grouped: number;
  createdGroups: number;
  moved: number;
  skipped: boolean;
  errors: string[];
};

export type Request =
  | { type: 'ping' }
  | { type: 'get-status' }
  | { type: 'reconcile-now'; windowId?: number }
  | { type: 'preview'; windowId?: number }
  | { type: 'apply-ruleset'; ruleSet: RuleSet };

export type Response =
  | { ok: true; kind: 'pong' }
  | { ok: true; kind: 'status'; enabled: boolean; rules: number; version: number }
  | { ok: true; kind: 'reconcile'; reports: ReconcileSummary[] }
  | { ok: true; kind: 'preview'; plan: Plan | null; windowId: number }
  | { ok: true; kind: 'applied' }
  | { ok: false; error: string };

export async function sendMessage(request: Request): Promise<Response> {
  return (await chrome.runtime.sendMessage(request)) as Response;
}
