/**
 * Background service worker: Chrome listener registration and lifecycle only.
 * Message dispatch lives in background-router.ts and shared helpers in
 * background-services.ts.
 */

import { i18n } from "./i18n.js";
import { getSiteKey, isBrowserNewTabUrl, validateRecentlyClosedTab, type RecentlyClosedTab } from "./shared.js";
import {
  loadState,
  loadDeferredTabs,
  saveDeferredTabs,
  appendRecentlyClosedTab,
  removeTabCreatedAt,
  recordTabCreatedAt,
  saveTabCreatedAtEntries,
  loadTabCreatedAtMap,
} from "./storage.js";
import { handleBackgroundMessage, type PopupMessage } from "./background-router.js";
import {
  DEFERRED_CHECK_ALARM,
  DEFERRED_DUE_ALARM_PREFIX,
  NOTIFICATION_DEFERRED_PREFIX,
  checkDueDeferredTabs,
  clearDeferredDueAlarm,
  deferActiveTabFromCommand,
  ensureDeferredCheckAlarm,
  forgetNotifiedId,
  openBoardFromCommand,
  requireBoardUser,
  restoreDeferredDueAlarms,
  saveActiveWindowAsWorkspace,
  syncBoardMutation,
} from "./background-services.js";

void i18n.initFromStorage();
void seedTabCreatedAtForExistingTabs();

async function seedTabCreatedAtForExistingTabs(): Promise<void> {
  try {
    const map = await loadTabCreatedAtMap();
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
    const now = Date.now();
    let changed = false;
    for (const window of windows) {
      for (const tab of window.tabs ?? []) {
        if (typeof tab.id !== "number") continue;
        if (map[tab.id] != null) continue;
        map[tab.id] = now;
        changed = true;
      }
    }
    if (changed) await saveTabCreatedAtEntries(map);
  } catch {
    // Ignore seeding failures; onCreated will keep recording new tabs.
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DEFERRED_CHECK_ALARM || alarm.name.startsWith(DEFERRED_DUE_ALARM_PREFIX)) {
    void checkDueDeferredTabs();
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (!notificationId.startsWith(NOTIFICATION_DEFERRED_PREFIX)) return;
  const deferredId = notificationId.slice(NOTIFICATION_DEFERRED_PREFIX.length);
  try {
    await chrome.notifications.clear(notificationId);
  } catch {
    // Clear may fail if already dismissed; proceed anyway.
  }
  const tabs = await loadDeferredTabs();
  const tab = tabs.find((item) => item.id === deferredId);
  if (!tab) return;
  const [currentWindow] = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const windowId = currentWindow?.id;
  if (windowId == null) return;
  await chrome.tabs.create({ windowId, url: tab.url, active: true });
  await saveDeferredTabs(tabs.filter((item) => item.id !== deferredId));
  void clearDeferredDueAlarm(deferredId);
  await forgetNotifiedId(deferredId);
  if (currentWindow?.id != null) {
    await chrome.windows.update(currentWindow.id, { focused: true }).catch(() => {});
  }
});

// 注意：不要在 notifications.onClosed 里删除去重标记——用户只是划掉通知
// （未点击打开）时提醒语义仍然成立；误删会导致下一轮轮询重复弹窗。

chrome.tabs.onCreated.addListener((tab) => {
  void (async () => {
    try {
      const state = await loadState();
      if (typeof tab.id === "number") {
        await recordTabCreatedAt(tab.id, Date.now());
      }
      if (state.settings.openBoardOnNewTab !== true || typeof tab.id !== "number") return;
      if (!isBrowserNewTabUrl(tab.url) && !isBrowserNewTabUrl(tab.pendingUrl)) return;
      await chrome.tabs.update(tab.id, { url: chrome.runtime.getURL("board.html") });
    } catch {
      // Leave the newly created tab unchanged when local storage or Chrome rejects the update.
    }
  })();
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  void (async () => {
    try {
      await removeTabCreatedAt(tabId);
    } catch {
      // Ignore cleanup failures; the next save will overwrite the map.
    }
    try {
      if (removeInfo.isWindowClosing) return;
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab || !tab.url || !getSiteKey(tab.url)) return;
      const rawInfo = removeInfo as { isWindowClosing: boolean; sessionId?: unknown };
      const closed: RecentlyClosedTab = {
        id: crypto.randomUUID(),
        title: tab.title || "未命名标签页",
        url: tab.url,
        ...(tab.favIconUrl ? { favIconUrl: tab.favIconUrl } : {}),
        closedAt: new Date().toISOString(),
        ...(typeof rawInfo.sessionId === "string" ? { sessionId: rawInfo.sessionId } : {}),
      };
      const validated = validateRecentlyClosedTab(closed);
      if (validated) await appendRecentlyClosedTab(validated).catch(() => {});
    } catch {
      // Ignore storage failures for recently closed tracking.
    }
  })();
});

chrome.commands.onCommand.addListener((command) => {
  void (async () => {
    if (command === "open-tab-board") {
      await openBoardFromCommand();
      return;
    }
    if (command === "defer-active-tab") {
      await deferActiveTabFromCommand();
      return;
    }
    if (command === "save-workspace") {
      await saveActiveWindowAsWorkspace();
    }
  })();
});

void ensureDeferredCheckAlarm();
void restoreDeferredDueAlarms();

chrome.runtime.onInstalled.addListener(() => {
  void ensureDeferredCheckAlarm();
  void restoreDeferredDueAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureDeferredCheckAlarm();
  void restoreDeferredDueAlarms();
});

chrome.runtime.onMessage.addListener((message: PopupMessage, _sender, sendResponse) => {
  void handleBackgroundMessage(message, { requireBoardUser, syncBoardMutation })
    .then(sendResponse, (error: unknown) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
  return true;
});
