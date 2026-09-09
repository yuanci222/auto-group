/**
 * Pure planning layer: decides which tabs should join which groups.
 *
 * `planWindow` never touches the browser. The background reconciler takes the
 * returned `Plan` and performs the `chrome.*` calls. This split keeps the
 * interesting logic unit-testable.
 */
import { evaluateRule } from './matcher';
import { NO_GROUP } from './order';
import type {
  GroupColor,
  MatchResult,
  Rule,
  Settings,
  TabInfo,
} from './types';

export interface GroupInfo {
  id: number;
  windowId: number;
  title: string;
  color: GroupColor;
  collapsed: boolean;
}

export interface PlanInput {
  tabs: TabInfo[];
  rules: Rule[];
  settings: Settings;
  /** Groups that already exist in the window. */
  groups: GroupInfo[];
  /** Group ids created by this extension. */
  ownedGroupIds: Iterable<number>;
  /** tabId -> tab signature recorded when the user moved it by hand. */
  overrides?: ReadonlyMap<number, string>;
}

export interface GroupingAction {
  tabId: number;
  ruleId: string;
  /** Title of the target group. */
  title: string;
  color: GroupColor;
  /** Reuse this existing group. */
  existingGroupId?: number;
  /** Otherwise the reconciler creates the group described by `newGroupKey`. */
  newGroupKey?: string;
  collapse: boolean;
  moveToEnd: boolean;
  match: MatchResult;
}

export interface NewGroupSpec {
  key: string;
  title: string;
  color: GroupColor;
  collapse: boolean;
  moveToEnd: boolean;
  ruleId: string;
}

export interface Plan {
  actions: GroupingAction[];
  createGroups: NewGroupSpec[];
}

/** Stable identity for a tab's content, used to expire manual overrides. */
export function tabSignature(tab: Pick<TabInfo, 'url' | 'title'>): string {
  return `${tab.url ?? ''}\u0000${tab.title ?? ''}`;
}

export function sameGroupTitle(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/** Sort rules into evaluation order. Ties keep their original order. */
export function orderRules(rules: Rule[], strategy: Settings['evaluation']): Rule[] {
  const enabled = rules.filter((r) => r.enabled);
  if (strategy === 'firstMatch') return enabled;
  return enabled
    .map((rule, i) => ({ rule, i }))
    .sort((a, b) => b.rule.priority - a.rule.priority || a.i - b.i)
    .map(({ rule }) => rule);
}

interface Winner {
  rule: Rule;
  match: MatchResult;
}

function pickWinner(tab: TabInfo, rules: Rule[]): Winner | null {
  for (const rule of rules) {
    const match = evaluateRule(rule, tab);
    if (match && match.groupTitle.trim()) return { rule, match };
  }
  return null;
}

/**
 * Build the grouping plan for one window.
 */
export function planWindow(input: PlanInput): Plan {
  const { tabs, settings, groups } = input;
  const owned = new Set(input.ownedGroupIds);
  const overrides = input.overrides ?? new Map<number, string>();
  const actions: GroupingAction[] = [];
  const createGroups: NewGroupSpec[] = [];
  const createByKey = new Map<string, NewGroupSpec>();

  if (!settings.enabled) return { actions, createGroups };

  const rules = orderRules(input.rules, settings.evaluation);
  if (rules.length === 0) return { actions, createGroups };

  const groupByTitle = new Map<string, GroupInfo>();
  for (const group of groups) groupByTitle.set(group.title.trim().toLocaleLowerCase(), group);

  const dynamicColorCursor = new Map<string, number>();

  for (const tab of [...tabs].sort((a, b) => a.index - b.index)) {
    if (tab.pinned && settings.ignorePinned) continue;

    if (settings.respectManualMoves && overrides.get(tab.id) === tabSignature(tab)) {
      continue;
    }

    const winner = pickWinner(tab, rules);
    if (!winner) continue;

    const title = winner.match.groupTitle.trim();
    if (!title) continue;

    const inGroup = tab.groupId !== NO_GROUP;
    if (inGroup) {
      const isOwned = owned.has(tab.groupId);
      if (!isOwned && settings.onlyUngrouped) continue;
      if (!isOwned && settings.manageOnlyOwnGroups) continue;
    }

    const key = title.toLocaleLowerCase();

    // A group with this title is being created earlier in this same pass:
    // every matching tab shares it.
    const pending = createByKey.get(key);
    if (pending) {
      actions.push({
        tabId: tab.id,
        ruleId: winner.rule.id,
        title: pending.title,
        color: pending.color,
        newGroupKey: pending.key,
        collapse: pending.collapse,
        moveToEnd: pending.moveToEnd,
        match: winner.match,
      });
      continue;
    }

    const existing = groupByTitle.get(key);
    if (existing) {
      if (tab.groupId === existing.id) continue; // already there
      actions.push({
        tabId: tab.id,
        ruleId: winner.rule.id,
        title: existing.title,
        color: existing.color,
        existingGroupId: existing.id,
        collapse: false,
        moveToEnd: winner.rule.options?.moveToEnd !== false,
        match: winner.match,
      });
      continue;
    }

    // A group with this title does not exist yet: create it once and share it
    // between every tab that resolves to the same title.
    const rule = winner.rule;
    let color: GroupColor;
    if (rule.group.color) {
      color = rule.group.color;
    } else {
      const palette = rule.group.colors?.length ? rule.group.colors : settings.defaultColors;
      const cursor = dynamicColorCursor.get(rule.id) ?? 0;
      dynamicColorCursor.set(rule.id, cursor + 1);
      color = palette[cursor % palette.length] ?? 'blue';
    }
    const spec: NewGroupSpec = {
      key,
      title,
      color,
      collapse: rule.options?.collapse ?? settings.collapseNewGroups,
      moveToEnd: rule.options?.moveToEnd !== false,
      ruleId: rule.id,
    };
    createByKey.set(key, spec);
    createGroups.push(spec);

    actions.push({
      tabId: tab.id,
      ruleId: winner.rule.id,
      title: spec.title,
      color: spec.color,
      newGroupKey: spec.key,
      collapse: spec.collapse,
      moveToEnd: spec.moveToEnd,
      match: winner.match,
    });
  }

  return { actions, createGroups };
}
