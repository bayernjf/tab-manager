import {
  UNGROUPED,
  autoRecordKey,
  getSiteKey,
  siteTitle,
  type CustomGroupRecord,
  type GroupColor,
  type Settings,
} from "./shared.js";
import { loadState, saveAutoGroups, saveCustomGroups, saveSettings } from "./storage.js";
import { getCurrentUser, signIn, signOut, signUp } from "./auth.js";
import { pushSettings, syncSettings } from "./sync.js";

const reconcileTimers = new Map<number, ReturnType<typeof setTimeout>>();
const AUTO_COLORS: GroupColor[] = ["blue", "green", "purple", "cyan", "orange", "pink", "yellow", "red"];

function colorFor(siteKey: string): GroupColor {
  let hash = 0;
  for (const char of siteKey) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AUTO_COLORS[hash % AUTO_COLORS.length] ?? "blue";
}

function scheduleReconcile(windowId?: number): void {
  if (windowId == null || windowId < 0) return;
  const current = reconcileTimers.get(windowId);
  if (current) clearTimeout(current);
  reconcileTimers.set(windowId, setTimeout(() => {
    reconcileTimers.delete(windowId);
    void reconcileWindow(windowId);
  }, 180));
}

async function existingGroupIds(windowId: number): Promise<Set<number>> {
  const groups = await chrome.tabGroups.query({ windowId });
  return new Set(groups.map((group) => group.id));
}

export async function reconcileWindow(windowId: number): Promise<void> {
  const state = await loadState();
  const validGroups = await existingGroupIds(windowId);
  let stateChanged = false;

  for (const [key, record] of Object.entries(state.autoGroups)) {
    if (record.windowId === windowId && !validGroups.has(record.groupId)) {
      delete state.autoGroups[key];
      stateChanged = true;
    }
  }
  for (const [id, record] of Object.entries(state.customGroups)) {
    if (record.windowId === windowId && !validGroups.has(record.groupId)) {
      delete state.customGroups[id];
      stateChanged = true;
    }
  }

  if (!state.settings.autoGroupEnabled) {
    if (stateChanged) await Promise.all([saveAutoGroups(state.autoGroups), saveCustomGroups(state.customGroups)]);
    return;
  }

  const autoGroupIds = new Set(
    Object.values(state.autoGroups).filter((record) => record.windowId === windowId).map((record) => record.groupId),
  );
  const customGroupIds = new Set(Object.values(state.customGroups).map((record) => record.groupId));
  const tabs = await chrome.tabs.query({ windowId });

  // A tab in any non-managed group is considered manually grouped and remains untouched.
  const candidates = tabs.filter((tab) => {
    if (tab.id == null || tab.pinned || !getSiteKey(tab.url)) return false;
    return tab.groupId === UNGROUPED || (autoGroupIds.has(tab.groupId) && !customGroupIds.has(tab.groupId));
  });

  const bySite = new Map<string, chrome.tabs.Tab[]>();
  for (const tab of candidates) {
    const siteKey = getSiteKey(tab.url);
    if (!siteKey) continue;
    const group = bySite.get(siteKey) ?? [];
    group.push(tab);
    bySite.set(siteKey, group);
  }

  for (const [siteKey, siteTabs] of bySite) {
    if (siteTabs.length < state.settings.minimumTabs) continue;
    const key = autoRecordKey(windowId, siteKey);
    const tabIds = siteTabs.flatMap((tab) => tab.id == null ? [] : [tab.id]);
    let record = state.autoGroups[key];

    if (!record || !validGroups.has(record.groupId)) {
      const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
      record = { groupId, windowId, siteKey };
      state.autoGroups[key] = record;
      validGroups.add(groupId);
      stateChanged = true;
    } else {
      await chrome.tabs.group({ tabIds, groupId: record.groupId });
    }

    await chrome.tabGroups.update(record.groupId, {
      title: siteTitle(siteKey),
      color: colorFor(siteKey),
    });
  }

  // Dissolve automatic groups that no longer meet the threshold or contain a single site.
  for (const [key, record] of Object.entries(state.autoGroups)) {
    if (record.windowId !== windowId) continue;
    const groupedTabs = await chrome.tabs.query({ groupId: record.groupId });
    const matching = groupedTabs.filter((tab) => getSiteKey(tab.url) === record.siteKey);
    const hasForeignTab = matching.length !== groupedTabs.length;
    if (matching.length < state.settings.minimumTabs || hasForeignTab) {
      if (groupedTabs.length) await chrome.tabs.ungroup(groupedTabs.flatMap((tab) => tab.id == null ? [] : [tab.id]));
      delete state.autoGroups[key];
      stateChanged = true;
      scheduleReconcile(windowId);
    }
  }

  if (stateChanged) await Promise.all([saveAutoGroups(state.autoGroups), saveCustomGroups(state.customGroups)]);
}

async function reconcileAllWindows(): Promise<void> {
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  await Promise.all(windows.flatMap((window) => window.id == null ? [] : [reconcileWindow(window.id)]));
}

type PopupMessage =
  | { type: "auth-state" }
  | { type: "auth-sign-in"; email: string; password: string }
  | { type: "auth-sign-up"; email: string; password: string }
  | { type: "auth-sign-out" }
  | { type: "get-popup-state" }
  | { type: "create-custom-group"; tabIds: number[]; title: string; color: GroupColor }
  | { type: "delete-custom-group"; id: string }
  | { type: "update-settings"; settings: Settings }
  | { type: "reconcile-now" };

async function popupState() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  const windowId = active?.windowId;
  if (windowId == null) throw new Error("找不到当前窗口");
  const [tabs, state] = await Promise.all([chrome.tabs.query({ windowId }), loadState()]);
  return {
    windowId,
    tabs: tabs.map((tab) => ({
      id: tab.id,
      title: tab.title || "未命名标签页",
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      groupId: tab.groupId,
      pinned: tab.pinned,
    })),
    settings: state.settings,
    customGroups: Object.entries(state.customGroups)
      .filter(([, group]) => group.windowId === windowId)
      .map(([, group]) => ({ ...group })),
  };
}

chrome.runtime.onMessage.addListener((message: PopupMessage, _sender, sendResponse) => {
  void (async () => {
    if (message.type === "auth-state") {
      const user = await getCurrentUser();
      if (user) await syncSettings(user.id);
      return { user };
    }
    if (message.type === "auth-sign-in") {
      const user = await signIn(message.email.trim(), message.password);
      await syncSettings(user.id);
      return { user };
    }
    if (message.type === "auth-sign-up") {
      const result = await signUp(message.email.trim(), message.password);
      if (!result.requiresEmailConfirmation && result.user) await syncSettings(result.user.id);
      return result;
    }
    if (message.type === "auth-sign-out") {
      await signOut();
      return { ok: true };
    }
    if (message.type === "get-popup-state") return popupState();
    if (message.type === "update-settings") {
      await saveSettings(message.settings);
      const user = await getCurrentUser();
      if (!user) throw new Error("登录已过期，设置已保存在本地，请重新登录后同步");
      await pushSettings(user.id, message.settings);
      await reconcileAllWindows();
      return { ok: true };
    }
    if (message.type === "reconcile-now") {
      await reconcileAllWindows();
      return { ok: true };
    }
    if (message.type === "create-custom-group") {
      if (!message.tabIds.length) throw new Error("请至少选择一个标签页");
      const groupId = await chrome.tabs.group({ tabIds: message.tabIds });
      await chrome.tabGroups.update(groupId, { title: message.title.trim() || "自定义分组", color: message.color });
      const group = await chrome.tabGroups.get(groupId);
      const state = await loadState();
      const id = crypto.randomUUID();
      state.customGroups[id] = { id, groupId, windowId: group.windowId, title: message.title.trim() || "自定义分组", color: message.color };
      for (const [key, auto] of Object.entries(state.autoGroups)) {
        if (auto.groupId === groupId) delete state.autoGroups[key];
      }
      await Promise.all([saveCustomGroups(state.customGroups), saveAutoGroups(state.autoGroups)]);
      scheduleReconcile(group.windowId);
      return { ok: true };
    }
    if (message.type === "delete-custom-group") {
      const state = await loadState();
      const record = state.customGroups[message.id];
      if (record) {
        const tabs = await chrome.tabs.query({ groupId: record.groupId });
        if (tabs.length) await chrome.tabs.ungroup(tabs.flatMap((tab) => tab.id == null ? [] : [tab.id]));
        delete state.customGroups[message.id];
        await saveCustomGroups(state.customGroups);
        scheduleReconcile(record.windowId);
      }
      return { ok: true };
    }
    return { ok: false };
  })().then(sendResponse, (error: unknown) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
  return true;
});

chrome.tabs.onCreated.addListener((tab) => scheduleReconcile(tab.windowId));
chrome.tabs.onUpdated.addListener((_tabId, _change, tab) => scheduleReconcile(tab.windowId));
chrome.tabs.onRemoved.addListener((_tabId, info) => scheduleReconcile(info.windowId));
chrome.tabs.onAttached.addListener((_tabId, info) => scheduleReconcile(info.newWindowId));
chrome.tabs.onDetached.addListener((_tabId, info) => scheduleReconcile(info.oldWindowId));
chrome.tabGroups.onRemoved.addListener((group) => scheduleReconcile(group.windowId));
chrome.runtime.onInstalled.addListener(() => void reconcileAllWindows());
chrome.runtime.onStartup.addListener(() => void reconcileAllWindows());
