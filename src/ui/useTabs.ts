import { useEffect, useState } from 'react';
import type { TabInfo } from '../core/types';

function toTabInfo(tab: chrome.tabs.Tab): TabInfo | null {
  if (tab.id === undefined || tab.windowId === undefined) return null;
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    url: tab.url ?? tab.pendingUrl,
    title: tab.title,
    pinned: tab.pinned,
    groupId: tab.groupId ?? -1,
  };
}

/** Live list of open tabs, refreshed when the browser reports a change. */
export function useTabs(): TabInfo[] {
  const [tabs, setTabs] = useState<TabInfo[]>([]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      const result = await chrome.tabs.query({});
      if (!alive) return;
      setTabs(result.map(toTabInfo).filter((t): t is TabInfo => t !== null));
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 200);
    };

    void refresh();
    chrome.tabs.onCreated.addListener(schedule);
    chrome.tabs.onRemoved.addListener(schedule);
    chrome.tabs.onUpdated.addListener(schedule);
    chrome.tabs.onMoved.addListener(schedule);
    chrome.tabs.onAttached.addListener(schedule);
    chrome.tabs.onDetached.addListener(schedule);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      chrome.tabs.onCreated.removeListener(schedule);
      chrome.tabs.onRemoved.removeListener(schedule);
      chrome.tabs.onUpdated.removeListener(schedule);
      chrome.tabs.onMoved.removeListener(schedule);
      chrome.tabs.onAttached.removeListener(schedule);
      chrome.tabs.onDetached.removeListener(schedule);
    };
  }, []);

  return tabs;
}
