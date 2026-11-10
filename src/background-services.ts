import { i18n } from "./i18n.js";
import {
  buildBoardCards,
  buildVirtualBoardGroups,
  boardWindowLabel,
  findDuplicateBoardTabs,
  formatDeferredDateTime,
  getSiteKey,
  isDeferredTabDue,
  mergeWorkspaceSnapshots,
  mergeWorkspaceTombstones,
  nextDeferredOccurrence,
  syncFailureStatus,
  validateDeferredTab,
  validateWorkspaceSnapshot,
  validateWorkspaceTab,
  validateWorkspaceTitle,
  type BoardGroup,
  type BoardLogicalGroup,
  type BoardTab,
  type DeferredTab,
  type GroupColor,
  type WorkspaceSnapshot,
  type WorkspaceTombstone,
} from "./shared.js";
import { getLocalUser, getStoredUser, getCurrentUser } from "./auth.js";
import {
  getOrCreateDeviceId,
  getOrCreateDeviceName,
  loadDeferredTabs,
  loadNotifiedDeferredIds,
  loadState,
  loadTabCreatedAtMap,
  loadWorkspaceSnapshots,
  loadWorkspaceTombstones,
  saveDeferredTabs,
  saveNotifiedDeferredIds,
  saveWorkspaceSnapshots,
  saveWorkspaceTombstones,
  saveSettings,
  saveOptionsData,
  saveBoardCustomGroups,
  saveBoardLayouts,
  prepareOptionsForUser,
} from "./storage.js";
import {
  pushSettings,
  replaceOptionalSyncData,
  restoreOptionalSyncData,
  restoreBoardSyncData,
  syncSettings,
  fetchWorkspaces,
  fetchWorkspaceTombstones,
  upsertWorkspace,
  upsertWorkspaceTombstone,
  replaceBoardSyncData,
  deleteWorkspaceRow,
} from "./sync.js";

export function safeRecordId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128;
}

export function safePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && Number.isSafeInteger(value);
}

export interface DuplicateCloseGroup {
  retainedTabId: number;
  tabIds: number[];
}

export function workspaceTabValidationMessage(status: Exclude<ReturnType<typeof validateWorkspaceTab>["status"], "valid">, t?: (key: string) => string): string {
  const keys: Record<string, string> = {
    "empty-title": "titleEmpty",
    "empty-url": "urlEmpty",
    "url-too-long": "urlTooLong",
    "invalid-url": "invalidUrl",
    "unsupported-url": "unsupportedUrl",
    "invalid-data": "invalidTabData",
  };
  const key = keys[status];
  return t && key ? t(key) : key === "titleEmpty" ? "标题不能为空" : key === "urlEmpty" ? "网址不能为空" : key === "urlTooLong" ? "网址不能超过 4000 个字符" : key === "invalidUrl" ? "网址格式无效" : key === "unsupportedUrl" ? "仅支持 http/https 网页" : "标签数据格式无效";
}

export function duplicateCloseGroups(value: unknown): DuplicateCloseGroup[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const groups: DuplicateCloseGroup[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return null;
    const record = candidate as Record<string, unknown>;
    if (Object.keys(record).length !== 2 || typeof record.retainedTabId !== "number" || !Number.isInteger(record.retainedTabId) || record.retainedTabId <= 0 || !Array.isArray(record.tabIds)) return null;
    const tabIds = record.tabIds;
    if (tabIds.length < 2 || tabIds.some((tabId) => typeof tabId !== "number" || !Number.isInteger(tabId) || tabId <= 0) || new Set(tabIds).size !== tabIds.length || !tabIds.includes(record.retainedTabId)) return null;
    groups.push({ retainedTabId: record.retainedTabId, tabIds: [...tabIds] });
  }
  return groups;
}

export function isUpdateGroupRuleInput(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null && "id" in value && safeRecordId(value.id);
}

export async function optionsState() {
  const user = await getStoredUser();
  const state = await loadState();
  return {
    user: user ? { id: user.id, email: user.email } : null,
    settings: state.settings,
    rules: state.groupRules,
    ignoredSites: state.ignoredSites,
    status: {
      authenticated: user !== null,
      cloudSyncEnabled: state.settings.cloudSyncEnabled ?? false,
      syncRulesEnabled: state.settings.syncRulesEnabled ?? false,
      syncIgnoreListEnabled: state.settings.syncIgnoreListEnabled ?? false,
      lastSuccessfulSyncAt: state.settings.lastSuccessfulSyncAt ?? null,
      sync: user ? { state: "syncing" as const } : { state: "ready" as const },
    },
  };
}

export async function syncOptions() {
  const user = await getCurrentUser();
  let sync: { state: "ready" | "error"; message?: string } = { state: "ready" };
  if (user) {
    try {
      await restoreUserOptions(user.id);
    } catch (error) {
      sync = syncFailureStatus(error);
    }
  }
  const state = await loadState();
  return {
    user: user ? { id: user.id, email: user.email } : null,
    settings: state.settings,
    rules: state.groupRules,
    ignoredSites: state.ignoredSites,
    status: {
      authenticated: user !== null,
      cloudSyncEnabled: state.settings.cloudSyncEnabled ?? false,
      syncRulesEnabled: state.settings.syncRulesEnabled ?? false,
      syncIgnoreListEnabled: state.settings.syncIgnoreListEnabled ?? false,
      lastSuccessfulSyncAt: state.settings.lastSuccessfulSyncAt ?? null,
      sync,
    },
  };
}

export async function synchronizeOptionsFromCloud(state: Awaited<ReturnType<typeof loadState>>): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || !state.settings.cloudSyncEnabled) return false;
  await pushSettings(user.id, state.settings);
  const optionalData = await restoreOptionalSyncData(user.id, state.settings, {
    groupRules: state.groupRules,
    ignoredSites: state.ignoredSites,
  });
  if (optionalData.groupRules !== undefined) state.groupRules = optionalData.groupRules;
  if (optionalData.ignoredSites !== undefined) state.ignoredSites = optionalData.ignoredSites;
  const boardData = await restoreBoardSyncData(user.id, state.settings, {
    boardCustomGroups: state.boardCustomGroups,
    boardLayouts: state.boardLayouts,
  });
  if (boardData.boardCustomGroups !== undefined) state.boardCustomGroups = boardData.boardCustomGroups;
  if (boardData.boardLayouts !== undefined) state.boardLayouts = boardData.boardLayouts;
  state.settings.lastSuccessfulSyncAt = new Date().toISOString();
  await Promise.all([
    saveOptionsData(state.settings, state.groupRules, state.ignoredSites),
    saveBoardCustomGroups(state.boardCustomGroups),
    saveBoardLayouts(state.boardLayouts),
  ]);
  return true;
}

export async function synchronizeOptions(state: Awaited<ReturnType<typeof loadState>>, include: { settings: boolean; rules: boolean; ignoredSites: boolean }): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || !state.settings.cloudSyncEnabled) return false;
  const syncRules = include.rules && state.settings.syncRulesEnabled === true;
  const syncIgnoredSites = include.ignoredSites && state.settings.syncIgnoreListEnabled === true;
  if (!include.settings && !syncRules && !syncIgnoredSites) return false;
  if (include.settings) await pushSettings(user.id, state.settings);
  if (syncRules || syncIgnoredSites) {
    await replaceOptionalSyncData(user.id, state.settings, {
      ...(syncRules ? { groupRules: state.groupRules } : {}),
      ...(syncIgnoredSites ? { ignoredSites: state.ignoredSites } : {}),
    });
  }
  state.settings.lastSuccessfulSyncAt = new Date().toISOString();
  await saveSettings(state.settings);
  return true;
}

export async function synchronizeOptionsMutation(state: Awaited<ReturnType<typeof loadState>>, include: { settings: boolean; rules: boolean; ignoredSites: boolean }): Promise<boolean> {
  return synchronizeOptions(state, include);
}

export async function restoreUserOptions(userId: string): Promise<void> {
  await prepareOptionsForUser(userId);
  const settings = await syncSettings(userId);
  const state = await loadState();
  const optionalData = await restoreOptionalSyncData(userId, settings, {
    groupRules: state.groupRules,
    ignoredSites: state.ignoredSites,
  });
  if (optionalData.groupRules !== undefined) state.groupRules = optionalData.groupRules;
  if (optionalData.ignoredSites !== undefined) state.ignoredSites = optionalData.ignoredSites;
  const boardData = await restoreBoardSyncData(userId, settings, {
    boardCustomGroups: state.boardCustomGroups,
    boardLayouts: state.boardLayouts,
  });
  if (boardData.boardCustomGroups !== undefined) state.boardCustomGroups = boardData.boardCustomGroups;
  if (boardData.boardLayouts !== undefined) state.boardLayouts = boardData.boardLayouts;
  await Promise.all([
    saveOptionsData(state.settings, state.groupRules, state.ignoredSites),
    saveBoardCustomGroups(state.boardCustomGroups),
    saveBoardLayouts(state.boardLayouts),
  ]);
}

export async function popupState() {
  const user = await getStoredUser();
  if (!user) throw new Error(i18n.t("sessionInvalid"));
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  const windowId = active?.windowId;
  if (windowId == null) throw new Error(i18n.t("cantFindWindow"));
  const [tabs, state] = await Promise.all([chrome.tabs.query({ windowId }), loadState()]);
  return {
    windowId,
    tabs: tabs.map((tab) => ({
      id: tab.id,
      title: tab.title || i18n.t("unnamedTab"),
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      pinned: tab.pinned,
    })),
    settings: state.settings,
    customGroups: state.boardCustomGroups,
  };
}

export const BOARD_COLORS: readonly GroupColor[] = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

export function boardGroupColor(value: unknown): GroupColor | null {
  return typeof value === "string" && (BOARD_COLORS as readonly string[]).includes(value) ? value as GroupColor : null;
}

export async function currentNormalWindowId(): Promise<number> {
  const window = await chrome.windows.getCurrent();
  if (window.id == null || window.type !== "normal") throw new Error(i18n.t("useNormalWindow"));
  return window.id;
}

export async function boardTab(tab: chrome.tabs.Tab, createdAtMap: Record<number, number>): Promise<BoardTab | null> {
  if (tab.id == null || tab.windowId == null || tab.pinned || !getSiteKey(tab.url)) return null;
  const createdAt = createdAtMap[tab.id];
  return { id: tab.id, windowId: tab.windowId, title: tab.title || i18n.t("unnamedTab"), url: tab.url, favIconUrl: tab.favIconUrl, createdAt };
}

export function boardRank(state: Awaited<ReturnType<typeof loadState>>, boardKey: BoardGroup["boardKey"], fallback: number): number {
  return state.boardLayouts.find((layout) => layout.boardKey === boardKey && layout.deviceClass === "desktop")?.rank ?? fallback;
}

export async function boardLogicalGroups(state: Awaited<ReturnType<typeof loadState>>, currentWindowId?: number): Promise<BoardLogicalGroup[]> {
  const createdAtMap = await loadTabCreatedAtMap();
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const eligible = await Promise.all(windows.flatMap((window, index) => (window.tabs ?? []).flatMap((tab) => {
    const windowLabel = boardWindowLabel(index + 1);
    return (async () => {
      const mapped = await boardTab(tab, createdAtMap);
      return mapped && windowLabel ? [{ ...mapped, windowLabel, isCurrentWindow: window.id === currentWindowId }] : [];
    })();
  })));
  return buildVirtualBoardGroups({ tabs: eligible.flat(), settings: state.settings, rules: state.groupRules, ignoredSites: state.ignoredSites, customGroups: state.boardCustomGroups, assignments: state.boardAssignments })
    .map((group) => ({ ...group, rank: boardRank(state, group.boardKey, group.rank) }))
    .sort((left, right) => left.rank - right.rank);
}

export async function boardDuplicateTabs(): Promise<BoardTab[]> {
  const createdAtMap = await loadTabCreatedAtMap();
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const results = await Promise.all(windows.flatMap((window) => (window.tabs ?? []).flatMap((tab) => boardTab(tab, createdAtMap))));
  return results.filter((tab): tab is BoardTab => tab !== null);
}

export async function closeBoardDuplicates(groups: readonly DuplicateCloseGroup[]): Promise<{ closed: number; skipped: number }> {
  let closed = 0;
  let skipped = 0;
  for (const group of groups) {
    const live = await Promise.all(group.tabIds.map(async (tabId) => {
      try {
        const tab = await boardTab(await chrome.tabs.get(tabId), await loadTabCreatedAtMap());
        return tab ? { tabId, tab } : null;
      } catch {
        return null;
      }
    }));
    const closable = new Set<number>();
    for (const duplicate of findDuplicateBoardTabs(live.flatMap((item) => item ? [item.tab] : []))) {
      const retainedTabId = duplicate.tabs.some((tab) => tab.id === group.retainedTabId) ? group.retainedTabId : duplicate.retainedTabId;
      for (const tab of duplicate.tabs) if (tab.id !== retainedTabId) closable.add(tab.id);
    }
    for (const tabId of group.tabIds) {
      if (tabId === group.retainedTabId) continue;
      if (!closable.has(tabId)) {
        skipped += 1;
        continue;
      }
      try {
        await chrome.tabs.remove(tabId);
        closed += 1;
      } catch {
        skipped += 1;
      }
    }
  }
  return { closed, skipped };
}

export async function boardState(currentWindowId?: number) {
  const user = await getStoredUser();
  if (!user) return { user: null, loginRequired: true, message: i18n.t("loginRequiredForBoard"), groups: [] };
  const state = await loadState();
  const groups = await boardLogicalGroups(state, currentWindowId);
  return { user: { id: user.id, email: user.email }, loginRequired: false, groups: buildBoardCards(groups), layouts: state.boardLayouts, settings: state.settings };
}

/** 云端写失败降级为日志而不阻断本地操作；但绝不能静默（P1-1：CHECK 违例曾因此完全不可见）。 */
export function logCloudWriteFailure(action: string): (error: unknown) => void {
  return (error) => console.warn(`[Tab Garden] cloud ${action} failed:`, error);
}

export async function loadAllWorkspaces(userId: string, cloudSyncEnabled: boolean): Promise<WorkspaceSnapshot[]> {
  if (cloudSyncEnabled) {
    const cloud = await fetchWorkspaces(userId).catch(() => null);
    if (cloud) {
      const [local, localTombstones, cloudTombstones] = await Promise.all([
        loadWorkspaceSnapshots(),
        loadWorkspaceTombstones(),
        fetchWorkspaceTombstones(userId).catch(() => [] as WorkspaceTombstone[]),
      ]);
      const result = mergeWorkspaceSnapshots(local, cloud, localTombstones, cloudTombstones);
      await saveWorkspaceSnapshots(result.merged).catch(() => {});
      await saveWorkspaceTombstones(result.tombstones).catch(() => {});
      for (const workspace of result.upload) await upsertWorkspace(userId, workspace).catch(logCloudWriteFailure("workspace upsert"));
      for (const tombstone of result.uploadTombstones) await upsertWorkspaceTombstone(userId, tombstone).catch(logCloudWriteFailure("tombstone upsert"));
      for (const id of result.deleteFromCloud) await deleteWorkspaceRow(userId, id).catch(logCloudWriteFailure("workspace delete"));
      return result.merged;
    }
  }
  return loadWorkspaceSnapshots();
}

export async function requireBoardUser() {
  const user = await getLocalUser();
  if (!user) throw new Error(i18n.t("loginRequiredToModify"));
  return user;
}

export async function syncBoardMutation(state: Awaited<ReturnType<typeof loadState>>, include: { groups?: boolean; layouts?: boolean }) {
  const user = await requireBoardUser();
  try {
    await replaceBoardSyncData(user.id, state.settings, {
      ...(include.groups ? { boardCustomGroups: state.boardCustomGroups } : {}),
      ...(include.layouts ? { boardLayouts: state.boardLayouts } : {}),
    });
    return { synced: true, sync: { state: "ready" as const } };
  } catch (error) {
    return { synced: false, sync: syncFailureStatus(error) };
  }
}

export const DEFERRED_CHECK_ALARM = "deferred-tab-check";
export const DEFERRED_DUE_ALARM_PREFIX = "deferred-due:";
export const NOTIFICATION_DEFERRED_PREFIX = "deferred:";
// 已通知 id 持久化在 chrome.storage.local（storage.ts），模块内只缓存一份
// 内存副本；service worker 被回收后从存储恢复，不会重复弹同一提醒。
let notifiedDeferredIds: Set<string> | null = null;

async function notifiedIds(): Promise<Set<string>> {
  if (!notifiedDeferredIds) notifiedDeferredIds = await loadNotifiedDeferredIds();
  return notifiedDeferredIds;
}

async function persistNotifiedIds(ids: ReadonlySet<string>): Promise<void> {
  notifiedDeferredIds = new Set(ids);
  await saveNotifiedDeferredIds(notifiedDeferredIds);
}

export async function forgetNotifiedId(id: string): Promise<void> {
  const notified = await notifiedIds();
  if (notified.delete(id)) await persistNotifiedIds(notified);
}

export function deferredDueAlarmName(id: string): string {
  return `${DEFERRED_DUE_ALARM_PREFIX}${id}`;
}

export async function scheduleDeferredDueAlarm(id: string, dueAt: string): Promise<void> {
  const delayMs = Date.parse(dueAt) - Date.now();
  if (delayMs <= 0) return;
  const delayInMinutes = delayMs / 60000;
  await chrome.alarms.create(deferredDueAlarmName(id), { delayInMinutes });
}

export async function clearDeferredDueAlarm(id: string): Promise<void> {
  await chrome.alarms.clear(deferredDueAlarmName(id)).catch(() => {});
}

async function sendToast(message: string): Promise<void> {
  try {
    const id = `tab-garden-toast-${Date.now()}`;
    await chrome.notifications.create(id, {
      type: "basic",
      iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      title: "Tab Garden",
      message,
      priority: 1,
      requireInteraction: false,
    });
  } catch (error) {
    console.error("[Tab Garden] Failed to send toast:", error);
  }
}

export async function checkDueDeferredTabs(): Promise<void> {
  const tabs = await loadDeferredTabs();
  const now = Date.now();
  const notified = await notifiedIds();
  const dueTabs = tabs.filter((tab) => isDeferredTabDue(tab, now) && !notified.has(tab.id));
  // 顺带回收：提醒已打开/删除后其 id 会留在集合里，这里按现存待办清理
  const liveIds = new Set(tabs.map((tab) => tab.id));
  const stale = [...notified].filter((id) => !liveIds.has(id));
  if (stale.length > 0) {
    for (const id of stale) notified.delete(id);
    await persistNotifiedIds(notified);
  }
  if (dueTabs.length === 0) return;

  for (const tab of dueTabs) {
    const notificationId = `${NOTIFICATION_DEFERRED_PREFIX}${tab.id}`;
    const title = i18n.t("deferredDueTitle") || "Reminder";
    const message = `${tab.title}\n${i18n.t("deferredDueScheduled") || "Scheduled at"}: ${formatDeferredDateTime(tab.dueAt)}`;
    const iconUrl = tab.favIconUrl?.startsWith("data:")
      ? tab.favIconUrl
      : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    try {
      await chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl,
        title,
        message,
        priority: 2,
        requireInteraction: false,
      } as chrome.notifications.NotificationCreateOptions);
      notified.add(tab.id);
      await persistNotifiedIds(notified);
    } catch (error) {
      console.error("[Tab Garden] Failed to create deferred notification:", error);
    }
  }
}

export async function ensureDeferredCheckAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(DEFERRED_CHECK_ALARM).catch(() => undefined);
  if (!existing) {
    await chrome.alarms.create(DEFERRED_CHECK_ALARM, { periodInMinutes: 1 });
  }
  void checkDueDeferredTabs();
}

export async function restoreDeferredDueAlarms(): Promise<void> {
  const tabs = await loadDeferredTabs();
  const now = Date.now();
  for (const tab of tabs) {
    if (Date.parse(tab.dueAt) <= now) continue;
    const existing = await chrome.alarms.get(deferredDueAlarmName(tab.id)).catch(() => undefined);
    if (!existing) {
      void scheduleDeferredDueAlarm(tab.id, tab.dueAt);
    }
  }
}

export async function openBoardFromCommand(): Promise<void> {
  try {
    const window = await chrome.windows.getCurrent();
    if (window.id == null || window.type !== "normal") return;
    const boardUrl = chrome.runtime.getURL("board.html");
    const existing = await chrome.tabs.query({ url: boardUrl });
    const target = existing[0];
    if (target && typeof target.id === "number") {
      if (target.windowId != null && target.windowId !== window.id) await chrome.windows.update(target.windowId, { focused: true }).catch(() => {});
      await chrome.tabs.update(target.id, { active: true }).catch(() => {});
      return;
    }
    await chrome.tabs.create({ windowId: window.id, url: boardUrl });
  } catch {
    // Ignore command execution failures.
  }
}

export async function deferActiveTabFromCommand(): Promise<void> {
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active?.id == null || !active.url || !getSiteKey(active.url) || active.pinned) return;
    const user = await getStoredUser();
    if (!user) return;
    const state = await loadState();
    const defaultTimes = state.settings.deferredShortcutTimes?.[0] ?? "09:00";
    const due = nextDeferredOccurrence(defaultTimes);
    const tab = await boardTab(active, await loadTabCreatedAtMap());
    if (!tab?.url) return;
    const deferred = validateDeferredTab({ id: crypto.randomUUID(), title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl, dueAt: due.toISOString(), createdAt: new Date().toISOString() });
    if (!deferred) return;
    await saveDeferredTabs([...await loadDeferredTabs(), deferred]);
    void scheduleDeferredDueAlarm(deferred.id, deferred.dueAt);
    void ensureDeferredCheckAlarm();
    await chrome.tabs.remove(active.id);
  } catch {
    // Ignore command execution failures.
  }
}

export async function saveActiveWindowAsWorkspace(): Promise<void> {
  try {
    const user = await getStoredUser();
    if (!user) { await sendToast(i18n.t("saveWorkspaceLoginRequired")); return; }
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    const windowId = active?.windowId;
    if (windowId == null) { await sendToast(i18n.t("saveWorkspaceNoActiveTab")); return; }
    const window = await chrome.windows.get(windowId);
    if (window.type !== "normal") { await sendToast(i18n.t("saveWorkspaceNotNormalWindow")); return; }
    const tabs = await chrome.tabs.query({ windowId });
    const eligible = tabs.filter((tab) => tab.id != null && !tab.pinned && getSiteKey(tab.url));
    if (eligible.length === 0) { await sendToast(i18n.t("saveWorkspaceNoEligibleTabs")); return; }
    const [deviceId, deviceName] = await Promise.all([getOrCreateDeviceId(), getOrCreateDeviceName()]);
    const state = await loadState();
    const useCloud = state.settings.cloudSyncEnabled === true;
    const existing = await loadAllWorkspaces(user.id, useCloud);
    const existingTitles = existing.filter((workspace) => workspace.deviceName === deviceName).map((workspace) => workspace.title);
    const baseTitle = i18n.t("cmdSaveWorkspace") || "快速保存";
    let titleObj = validateWorkspaceTitle(baseTitle, existingTitles);
    if (titleObj.status === "duplicate") {
      let counter = 2;
      while (titleObj.status === "duplicate" && counter <= 100) {
        titleObj = validateWorkspaceTitle(`${baseTitle} ${counter}`, existingTitles);
        counter += 1;
      }
    }
    if (titleObj.status !== "valid") { await sendToast(i18n.t("saveWorkspaceTitleInvalid")); return; }
    const validations = eligible.map((tab) => validateWorkspaceTab({ title: tab.title || "未命名标签页", url: tab.url }));
    const validTabs = validations.flatMap((v) => v.status === "valid" ? [v.tab] : []);
    if (validTabs.length === 0) { await sendToast(i18n.t("saveWorkspaceNoValidTabs")); return; }
    const now = new Date().toISOString();
    const snapshot = validateWorkspaceSnapshot({ id: crypto.randomUUID(), title: titleObj.title, createdAt: now, updatedAt: now, tabs: validTabs, deviceId, deviceName });
    if (!snapshot) { await sendToast(i18n.t("saveWorkspaceSnapshotInvalid")); return; }
    if (useCloud) await upsertWorkspace(user.id, snapshot).catch(logCloudWriteFailure("workspace upsert"));
    await saveWorkspaceSnapshots([...existing, snapshot]).catch(() => {});
    await sendToast(i18n.t("saveWorkspaceSaved", [snapshot.title, String(validTabs.length)]));
  } catch (error) {
    console.error("[Tab Garden] save-workspace failed:", error);
    await sendToast(i18n.t("saveWorkspaceFailed"));
  }
}

