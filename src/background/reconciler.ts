/**
 * The reconciler: the only place that mutates Chrome's tab strip.
 *
 * It is intentionally idempotent and serialised per window. Events from the
 * browser are debounced into a `scheduleReconcile` call, so a burst of tab
 * updates produces a single pass.
 */
import { applyTabOrder, computeDesiredOrder, NO_GROUP, type OrderableTab } from '../core/order';
import { planWindow, type GroupInfo, type Plan } from '../core/plan';
import type { TabInfo } from '../core/types';
import {
  loadOwnedTitles,
  loadOverrides,
  loadRuleSet,
  normaliseTitle,
  saveOwnedTitles,
} from '../shared/storage';

const timers = new Map<number, ReturnType<typeof setTimeout>>();
const applying = new Map<number, number>();
const running = new Map<number, Promise<ReconcileReport>>();
const dirty = new Set<number>();
let quietUntil = 0;

/** True while the extension itself is mutating tabs (used to ignore echoes). */
export function isSelfInflicted(): boolean {
  return applying.size > 0 || Date.now() < quietUntil;
}

function beginApply(windowId: number): void {
  applying.set(windowId, (applying.get(windowId) ?? 0) + 1);
}

function endApply(windowId: number): void {
  const next = (applying.get(windowId) ?? 1) - 1;
  if (next <= 0) applying.delete(windowId);
  else applying.set(windowId, next);
  quietUntil = Date.now() + 900;
}

export function scheduleReconcile(windowId: number, delay?: number): void {
  if (!Number.isFinite(windowId) || windowId < 0) return;
  const existing = timers.get(windowId);
  if (existing) clearTimeout(existing);
  const wait = delay ?? 250;
  timers.set(
    windowId,
    setTimeout(() => {
      timers.delete(windowId);
      void reconcileWindow(windowId).catch((err) => console.error('[auto-group] reconcile failed', err));
    }, wait),
  );
}

/**
 * Reconcile a window, serialised per window. If another pass is already
 * running, this marks the window dirty and returns the in-flight promise; the
 * running pass schedules a follow-up when it finishes. This is what makes it
 * safe to react to *every* tab event, including ones caused by our own moves.
 */
export function reconcileWindow(windowId: number): Promise<ReconcileReport> {
  const inFlight = running.get(windowId);
  if (inFlight) {
    dirty.add(windowId);
    return inFlight;
  }
  const promise = runReconcile(windowId).finally(() => {
    running.delete(windowId);
    if (dirty.delete(windowId)) scheduleReconcile(windowId, 50);
  });
  running.set(windowId, promise);
  return promise;
}

export function cancelScheduledReconcile(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}

function toTabInfo(tab: chrome.tabs.Tab): TabInfo | null {
  if (tab.id === undefined || tab.windowId === undefined) return null;
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    url: tab.url ?? tab.pendingUrl,
    title: tab.title,
    pinned: tab.pinned,
    groupId: tab.groupId ?? NO_GROUP,
  };
}

function toGroupInfo(group: chrome.tabGroups.TabGroup): GroupInfo {
  return {
    id: group.id,
    windowId: group.windowId,
    title: group.title ?? '',
    color: group.color as GroupInfo['color'],
    collapsed: group.collapsed,
  };
}

function toOrderable(tab: chrome.tabs.Tab): OrderableTab | null {
  if (tab.id === undefined) return null;
  return {
    id: tab.id,
    index: tab.index,
    groupId: tab.groupId ?? NO_GROUP,
    pinned: tab.pinned,
  };
}

export interface ReconcileReport {
  windowId: number;
  grouped: number;
  createdGroups: number;
  moved: number;
  skipped: boolean;
  errors: string[];
}

const SKIPPED: (windowId: number) => ReconcileReport = (windowId) => ({
  windowId,
  grouped: 0,
  createdGroups: 0,
  moved: 0,
  skipped: true,
  errors: [],
});

async function buildPlan(windowId: number): Promise<Plan | null> {
  const { rules, settings } = await loadRuleSet();
  if (!settings.enabled) return null;

  const [tabs, groups, ownedTitles, overrides] = await Promise.all([
    chrome.tabs.query({ windowId }),
    chrome.tabGroups.query({ windowId }),
    loadOwnedTitles(),
    loadOverrides(),
  ]);

  const ownedGroupIds = groups
    .filter((g) => ownedTitles.has(normaliseTitle(g.title ?? '')))
    .map((g) => g.id);

  return planWindow({
    tabs: tabs.map(toTabInfo).filter((t): t is TabInfo => t !== null),
    rules,
    settings,
    groups: groups.map(toGroupInfo),
    ownedGroupIds,
    overrides,
  });
}

/** Dry-run the rules for a window; used by the options page preview. */
export async function previewWindow(windowId: number): Promise<Plan | null> {
  return buildPlan(windowId);
}

async function runReconcile(windowId: number): Promise<ReconcileReport> {
  const plan = await buildPlan(windowId);
  if (!plan) return SKIPPED(windowId);
  if (plan.actions.length === 0) {
    // Still enforce ordering: the user may have dragged tabs around.
    const { settings } = await loadRuleSet();
    if (!settings.enforceGroupOrder) return SKIPPED(windowId);
    const ordered = await applyOrdering(windowId, new Set());
    return {
      windowId,
      grouped: 0,
      createdGroups: 0,
      moved: ordered.moved,
      skipped: false,
      errors: ordered.errors,
    };
  }

  const { settings } = await loadRuleSet();
  const errors: string[] = [];
  const createdGroupIds = new Set<number>();
  const createdGroupIdByKey = new Map<string, number>();
  const ownedTitles = await loadOwnedTitles();

  beginApply(windowId);
  try {
    for (const action of plan.actions) {
      try {
        let groupId: number | undefined = action.existingGroupId;
        if (groupId === undefined && action.newGroupKey) {
          groupId = createdGroupIdByKey.get(action.newGroupKey);
          if (groupId === undefined) {
            groupId = await chrome.tabs.group({
              tabIds: [action.tabId],
              createProperties: { windowId },
            });
            createdGroupIdByKey.set(action.newGroupKey, groupId);
            if (action.moveToEnd) createdGroupIds.add(groupId);
            await chrome.tabGroups.update(groupId, {
              title: action.title,
              color: action.color,
              collapsed: action.collapse,
            });
            ownedTitles.add(normaliseTitle(action.title));
            continue; // the tab is already in the freshly created group
          }
        }
        if (groupId === undefined) continue;
        await chrome.tabs.group({ tabIds: [action.tabId], groupId });
      } catch (err) {
        errors.push(`tab ${action.tabId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (ownedTitles.size) await saveOwnedTitles(ownedTitles);
  } finally {
    endApply(windowId);
  }

  let moved = 0;
  if (settings.enforceGroupOrder) {
    const result = await applyOrdering(windowId, createdGroupIds);
    moved = result.moved;
    errors.push(...result.errors);
  }

  return {
    windowId,
    grouped: plan.actions.length,
    createdGroups: createdGroupIds.size,
    moved,
    skipped: false,
    errors,
  };
}

async function applyOrdering(
  windowId: number,
  newGroupIds: Set<number>,
): Promise<{ moved: number; errors: string[] }> {
  const errors: string[] = [];
  beginApply(windowId);
  try {
    const initial = await chrome.tabs.query({ windowId });
    const orderable = initial.map(toOrderable).filter((t): t is OrderableTab => t !== null);
    const desired = computeDesiredOrder(orderable, { newGroupIds, enforceGroupOrder: true });
    const result = await applyTabOrder(desired, {
      getOrder: async () => {
        const tabs = await chrome.tabs.query({ windowId });
        return tabs
          .filter((t): t is chrome.tabs.Tab & { id: number } => t.id !== undefined)
          .sort((a, b) => a.index - b.index)
          .map((t) => t.id);
      },
      move: async (tabId, index) => {
        await chrome.tabs.move(tabId, { index });
      },
    });
    return { moved: result.moves, errors };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { moved: 0, errors };
  } finally {
    endApply(windowId);
  }
}

export async function reconcileAllWindows(): Promise<ReconcileReport[]> {
  const windows = await chrome.windows.getAll({ populate: false });
  const reports: ReconcileReport[] = [];
  for (const win of windows) {
    if (win.id === undefined) continue;
    reports.push(await reconcileWindow(win.id));
  }
  return reports;
}
