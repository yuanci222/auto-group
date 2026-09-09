import { useCallback, useEffect, useRef, useState } from 'react';
import { loadRuleSet, onRuleSetChanged, saveRuleSet } from '../shared/storage';
import type { Rule, RuleSet, Settings } from '../core/types';

export interface RuleSetStore {
  ruleSet: RuleSet | null;
  ready: boolean;
  save: (next: RuleSet) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  addRule: (rule: Rule) => Promise<void>;
  replaceRule: (rule: Rule) => Promise<void>;
  removeRule: (id: string) => Promise<void>;
  toggleRule: (id: string, enabled: boolean) => Promise<void>;
  setRules: (rules: Rule[]) => Promise<void>;
  reload: () => Promise<void>;
}

/**
 * Loads the ruleset from chrome.storage and keeps it in sync across every
 * extension page (options, popup, service worker).
 */
export function useRuleSet(): RuleSetStore {
  const [ruleSet, setRuleSet] = useState<RuleSet | null>(null);
  const latest = useRef<RuleSet | null>(null);
  latest.current = ruleSet;

  useEffect(() => {
    let alive = true;
    void loadRuleSet().then((value) => {
      if (alive) setRuleSet(value);
    });
    const unsubscribe = onRuleSetChanged((value) => {
      if (alive) setRuleSet(value);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const save = useCallback(async (next: RuleSet) => {
    setRuleSet(next);
    await saveRuleSet(next);
  }, []);

  const mutate = useCallback(
    async (fn: (current: RuleSet) => RuleSet) => {
      const current = latest.current ?? (await loadRuleSet());
      await save(fn(current));
    },
    [save],
  );

  const reload = useCallback(async () => {
    setRuleSet(await loadRuleSet());
  }, []);

  return {
    ruleSet,
    ready: ruleSet !== null,
    save,
    reload,
    updateSettings: (patch) => mutate((c) => ({ ...c, settings: { ...c.settings, ...patch } })),
    addRule: (rule) => mutate((c) => ({ ...c, rules: [...c.rules, rule] })),
    replaceRule: (rule) =>
      mutate((c) => ({ ...c, rules: c.rules.map((r) => (r.id === rule.id ? rule : r)) })),
    removeRule: (id) => mutate((c) => ({ ...c, rules: c.rules.filter((r) => r.id !== id) })),
    toggleRule: (id, enabled) =>
      mutate((c) => ({ ...c, rules: c.rules.map((r) => (r.id === id ? { ...r, enabled } : r)) })),
    setRules: (rules) => mutate((c) => ({ ...c, rules })),
  };
}

function rulesEqual(a: readonly Rule[], b: readonly Rule[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface DraftRulesStore {
  rules: Rule[];
  ready: boolean;
  /** True when the draft differs from what is stored. */
  dirty: boolean;
  /** True for a few seconds after a successful save, for the fade-out bar. */
  saved: boolean;
  saving: boolean;
  addRule: (rule: Rule) => void;
  replaceRule: (rule: Rule) => void;
  removeRule: (id: string) => void;
  toggleRule: (id: string, enabled: boolean) => void;
  discard: () => void;
  save: () => Promise<void>;
}

/**
 * Draft layer for the Rules panel.
 *
 * Rule edits never touch storage immediately — they accumulate here so the user
 * has to press Save before anything is applied (and before tabs get grouped).
 * The draft is kept in the parent component so it survives switching panels.
 */
export function useDraftRules(store: RuleSetStore): DraftRulesStore {
  const persisted = store.ruleSet?.rules;
  const [draft, setDraft] = useState<Rule[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Adopt the persisted rules on first load, and re-sync when they change
  // externally (import, another tab) as long as we have no unsaved edits.
  useEffect(() => {
    if (!persisted) return;
    setDraft((current) => {
      if (current === null) return persisted;
      return rulesEqual(current, persisted) ? persisted : current;
    });
  }, [persisted]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 4000);
    return () => clearTimeout(timer);
  }, [saved]);

  const dirty = persisted !== undefined && draft !== null && !rulesEqual(draft, persisted);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await store.setRules(draft);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }, [draft, store]);

  return {
    rules: draft ?? [],
    ready: draft !== null,
    dirty,
    saved,
    saving,
    addRule: (rule) => setDraft((current) => [...(current ?? []), rule]),
    replaceRule: (rule) =>
      setDraft((current) => (current ?? []).map((r) => (r.id === rule.id ? rule : r))),
    removeRule: (id) => setDraft((current) => (current ?? []).filter((r) => r.id !== id)),
    toggleRule: (id, enabled) =>
      setDraft((current) => (current ?? []).map((r) => (r.id === id ? { ...r, enabled } : r))),
    discard: () => setDraft(persisted ?? []),
    save,
  };
}
