/**
 * Service worker entry point: wires Chrome events into the reconciler.
 */
import { tabSignature } from '../core/plan';
import type { Request, Response } from '../shared/messages';
import {
  RULESET_KEY,
  loadRuleSet,
  recordOverride,
  removeOverride,
  saveRuleSet,
} from '../shared/storage';
import {
  isSelfInflicted,
  previewWindow,
  reconcileAllWindows,
  reconcileWindow,
  scheduleReconcile,
} from './reconciler';

const DEBUG = false;
function log(...args: unknown[]): void {
  if (DEBUG) console.log('[auto-group]', ...args);
}

function scheduleForTab(windowId: number | undefined): void {
  if (windowId === undefined || windowId < 0) return;
  scheduleReconcile(windowId, debounceMs);
}

/** Cached so a burst of tab events does not hit storage on every event. */
let debounceMs = 250;
void loadRuleSet().then(({ settings }) => {
  debounceMs = settings.debounceMs;
});

chrome.runtime.onInstalled.addListener(() => {
  log('installed');
  void loadRuleSet().then(({ settings }) => {
    if (settings.groupExistingOnStartup) void reconcileAllWindows();
  });
});

chrome.runtime.onStartup.addListener(() => {
  void loadRuleSet().then(({ settings }) => {
    if (settings.groupExistingOnStartup) void reconcileAllWindows();
  });
});

chrome.tabs.onCreated.addListener((tab) => {
  // Always schedule, even while we are applying: the reconcile is idempotent and
  // serialised, so deferring is safe and ensures tabs opened mid-pass are seen.
  scheduleForTab(tab.windowId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.groupId !== undefined && changeInfo.groupId >= 0 && !isSelfInflicted()) {
    // The user moved the tab into (or between) groups by hand: remember it so
    // we do not immediately undo the move.
    void recordOverride(tabId, tabSignature(tab));
    log('manual group override', tabId, changeInfo.groupId);
  }

  if (
    changeInfo.url !== undefined ||
    changeInfo.title !== undefined ||
    changeInfo.groupId !== undefined ||
    changeInfo.status === 'complete' ||
    changeInfo.pinned !== undefined
  ) {
    scheduleForTab(tab.windowId);
  }
});

chrome.tabs.onMoved.addListener((_tabId, moveInfo) => {
  scheduleForTab(moveInfo.windowId);
});

chrome.tabs.onAttached.addListener((_tabId, info) => {
  scheduleForTab(info.newWindowId);
});

chrome.tabs.onDetached.addListener((_tabId, info) => {
  scheduleForTab(info.oldWindowId);
});

chrome.tabs.onRemoved.addListener((tabId, info) => {
  void removeOverride(tabId);
  scheduleForTab(info.windowId);
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  void removeOverride(removedTabId);
  void chrome.tabs
    .get(addedTabId)
    .then((tab) => scheduleForTab(tab.windowId))
    .catch(() => undefined);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[RULESET_KEY]) return;
  const next = changes[RULESET_KEY].newValue as { settings?: { debounceMs?: number } } | undefined;
  if (typeof next?.settings?.debounceMs === 'number') debounceMs = next.settings.debounceMs;
  log('ruleset changed, reconciling');
  void reconcileAllWindows();
});

async function activeWindowId(): Promise<number | undefined> {
  const win = await chrome.windows.getCurrent();
  return win?.id;
}

async function handle(request: Request): Promise<Response> {
  switch (request.type) {
    case 'ping':
      return { ok: true, kind: 'pong' };
    case 'get-status': {
      const ruleSet = await loadRuleSet();
      return {
        ok: true,
        kind: 'status',
        enabled: ruleSet.settings.enabled,
        rules: ruleSet.rules.length,
        version: ruleSet.version,
      };
    }
    case 'reconcile-now': {
      const windowId = request.windowId ?? (await activeWindowId());
      if (windowId === undefined) return { ok: false, error: 'no active window' };
      const report = await reconcileWindow(windowId);
      return { ok: true, kind: 'reconcile', reports: [report] };
    }
    case 'preview': {
      const windowId = request.windowId ?? (await activeWindowId());
      if (windowId === undefined) return { ok: false, error: 'no active window' };
      const plan = await previewWindow(windowId);
      return { ok: true, kind: 'preview', plan, windowId };
    }
    case 'apply-ruleset': {
      await saveRuleSet(request.ruleSet);
      const reports = await reconcileAllWindows();
      return { ok: true, kind: 'reconcile', reports };
    }
  }
}

chrome.runtime.onMessage.addListener((message: Request, _sender, sendResponse) => {
  handle(message)
    .then(sendResponse)
    .catch((err: unknown) => {
      const response: Response = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
      sendResponse(response);
    });
  return true; // keep the channel open for the async response
});

export {};
