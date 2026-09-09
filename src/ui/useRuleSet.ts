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
