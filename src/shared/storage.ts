/**
 * Storage helpers shared by the service worker and the extension pages.
 *
 * - `ruleset` lives in `chrome.storage.local` (rules can exceed sync quotas).
 * - group ownership is persisted as *titles*, because Chrome group ids are not
 *   stable across browser restarts.
 * - manual-move overrides live in `chrome.storage.session` (tab ids are not
 *   stable across restarts either).
 */
import {
  DEFAULT_SETTINGS,
  RULESET_VERSION,
  createEmptyRuleSet,
  type RuleSet,
  type Settings,
} from '../core/types';

export const RULESET_KEY = 'ruleset';
export const OWNED_TITLES_KEY = 'ownedGroupTitles';
export const OVERRIDES_KEY = 'overrides';

function area(): chrome.storage.StorageArea {
  return chrome.storage.local;
}

function sessionArea(): chrome.storage.StorageArea {
  return chrome.storage.session ?? chrome.storage.local;
}

function normalise(ruleSet: Partial<RuleSet> | undefined): RuleSet {
  const base = createEmptyRuleSet();
  if (!ruleSet || typeof ruleSet !== 'object') return base;
  return {
    version: typeof ruleSet.version === 'number' ? ruleSet.version : RULESET_VERSION,
    name: ruleSet.name,
    rules: Array.isArray(ruleSet.rules) ? ruleSet.rules : [],
    settings: { ...DEFAULT_SETTINGS, ...(ruleSet.settings ?? {}) },
  };
}

export async function loadRuleSet(): Promise<RuleSet> {
  const stored = await area().get(RULESET_KEY);
  return normalise(stored[RULESET_KEY] as Partial<RuleSet> | undefined);
}

export async function saveRuleSet(ruleSet: RuleSet): Promise<void> {
  await area().set({ [RULESET_KEY]: ruleSet });
}

export async function patchSettings(patch: Partial<Settings>): Promise<RuleSet> {
  const current = await loadRuleSet();
  const next: RuleSet = { ...current, settings: { ...current.settings, ...patch } };
  await saveRuleSet(next);
  return next;
}

/** Subscribe to ruleset changes from any extension page. */
export function onRuleSetChanged(listener: (ruleSet: RuleSet) => void): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    changedArea: string,
  ) => {
    if (changedArea !== 'local' || !changes[RULESET_KEY]) return;
    listener(normalise(changes[RULESET_KEY].newValue as Partial<RuleSet>));
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

// --- group ownership ---------------------------------------------------------

export function normaliseTitle(title: string): string {
  return title.trim().toLocaleLowerCase();
}

export async function loadOwnedTitles(): Promise<Set<string>> {
  const stored = await area().get(OWNED_TITLES_KEY);
  const raw = stored[OWNED_TITLES_KEY];
  return new Set(Array.isArray(raw) ? (raw as string[]) : []);
}

export async function saveOwnedTitles(titles: Iterable<string>): Promise<void> {
  await area().set({ [OWNED_TITLES_KEY]: [...titles] });
}

export async function addOwnedTitle(title: string): Promise<void> {
  const titles = await loadOwnedTitles();
  titles.add(normaliseTitle(title));
  await saveOwnedTitles(titles);
}

export async function removeOwnedTitle(title: string): Promise<void> {
  const titles = await loadOwnedTitles();
  if (titles.delete(normaliseTitle(title))) await saveOwnedTitles(titles);
}

// --- manual overrides --------------------------------------------------------

export async function loadOverrides(): Promise<Map<number, string>> {
  const stored = await sessionArea().get(OVERRIDES_KEY);
  const raw = (stored[OVERRIDES_KEY] ?? {}) as Record<string, string>;
  return new Map(Object.entries(raw).map(([id, sig]) => [Number(id), sig]));
}

export async function recordOverride(tabId: number, signature: string): Promise<void> {
  const stored = await sessionArea().get(OVERRIDES_KEY);
  const raw = { ...((stored[OVERRIDES_KEY] ?? {}) as Record<string, string>) };
  raw[String(tabId)] = signature;
  // Keep the map from growing forever.
  const entries = Object.entries(raw).slice(-500);
  await sessionArea().set({ [OVERRIDES_KEY]: Object.fromEntries(entries) });
}

export async function clearOverrides(): Promise<void> {
  await sessionArea().remove(OVERRIDES_KEY);
}

export async function removeOverride(tabId: number): Promise<void> {
  const stored = await sessionArea().get(OVERRIDES_KEY);
  const raw = { ...((stored[OVERRIDES_KEY] ?? {}) as Record<string, string>) };
  if (raw[String(tabId)] === undefined) return;
  delete raw[String(tabId)];
  await sessionArea().set({ [OVERRIDES_KEY]: raw });
}
