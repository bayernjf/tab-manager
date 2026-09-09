import { i18n } from "./i18n.js";
import {
  automaticBoardKey,
  buildBoardCards,
  customBoardKey,
  applyPortableImport,
  canConfirmOptionsImport,
  createGroupRuleFromInput,
  createIgnoredSiteFromInput,
  getSiteKey,
  isBrowserNewTabUrl,
  previewPortableImport,
  syncFailureStatus,
  toPortableDataFromState,
  toWorkspacePortableData,
  previewWorkspacePortableImport,
  updateGroupRuleFromInput,
  validateBoardLayout,
  validateBoardTabDrop,
  buildVirtualBoardGroups,
  boardWindowLabel,
  findDuplicateBoardTabs,
  validateWorkspaceTitle,
  validateWorkspaceTab,
  validateWorkspaceSnapshot,
  validateRecentlyClosedTab,
  validateWorkspacePortableData,
  workspaceRestorePreview,
  workspaceTab,
  appendWorkspaceTab,
  groupWorkspaceTabsByDomain,
  moveWorkspaceTab,
  removeWorkspaceTab,
  updateWorkspaceTab,
  validateDeferredTab,
  moveVirtualBoardAssignment,
  moveBoardGroupRank,
  type BoardGroup,
  type BoardLogicalGroup,
  type BoardTab,
  validateOptionsSettings,
  type GroupColor,
  type PortableImportPreview,
  type Settings,
  type WorkspaceSnapshot,
  type DeferredTab,
  type RecentlyClosedTab,
  type WorkspaceHistory,
  type WorkspacePortableImportPreview,
  isDeferredTabDue,
  nextDeferredOccurrence,
  planBoardTabInsertion,
  validateWorkspaceTabsPayload,
  formatDeferredDateTime,
  MAX_WORKSPACE_HISTORY_VERSIONS,
} from "./shared.js";
import {
  loadState,
  loadWorkspaceSnapshots,
  loadDeferredTabs,
  prepareOptionsForUser,
  saveBoardAssignments,
  saveBoardCustomGroups,
  saveBoardLayouts,
  saveDeferredTabs,
  saveOptionsData,
  saveSettings,
  saveWorkspaceSnapshots,
  getOrCreateDeviceId,
  getOrCreateDeviceName,
  loadRecentlyClosedTabs,
  saveRecentlyClosedTabs,
  appendRecentlyClosedTab,
  removeRecentlyClosedTab,
  clearRecentlyClosedTabs,
  loadTabCreatedAtMap,
  recordTabCreatedAt,
  removeTabCreatedAt,
  saveTabCreatedAtEntries,
  loadWorkspaceHistory,
  loadAllWorkspaceHistories,
  saveWorkspaceHistory,
  saveWorkspaceVersion,
  deleteWorkspaceHistory,
  clearUserData,
} from "./storage.js";
import { getCurrentUser, getLocalUser, getStoredUser, signIn, signOut, signUp } from "./auth.js";
import { pushSettings, replaceBoardSyncData, replaceOptionalSyncData, restoreBoardSyncData, restoreOptionalSyncData, syncSettings, fetchWorkspaces, upsertWorkspace, deleteWorkspaceRow, renameDeviceWorkspaces } from "./sync.js";

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

type PopupMessage =
  | { type: "auth-state" }
  | { type: "restore-session" }
  | { type: "auth-sign-in"; email: string; password: string; rememberForSevenDays: boolean }
  | { type: "auth-sign-up"; email: string; password: string }
  | { type: "auth-sign-out" }
  | { type: "get-popup-state" }
  | { type: "create-custom-group"; tabIds: number[]; title: string; color: GroupColor }
  | { type: "delete-custom-group"; id: string }
  | { type: "update-settings"; settings: Settings }
  | { type: "get-options-state" }
  | { type: "sync-options" }
  | { type: "sync-now" }
  | { type: "save-options-settings"; settings: unknown }
  | { type: "create-group-rule"; rule: unknown }
  | { type: "update-group-rule"; rule: unknown }
  | { type: "delete-group-rule"; id: unknown }
  | { type: "create-ignored-site"; site: unknown }
  | { type: "delete-ignored-site"; id: unknown }
  | { type: "export-options-data" }
  | { type: "import-options-data"; data?: unknown; confirmed?: boolean; cancelled?: boolean }
  | { type: "open-tab-board"; windowId: number }
  | { type: "get-board-state"; windowId?: number }
  | { type: "get-board-duplicate-preview" }
  | { type: "close-board-duplicates"; groups: unknown; confirmed?: boolean }
  | { type: "get-workspaces" }
  | { type: "save-workspace"; title: unknown; tabs: unknown }
  | { type: "get-workspace-restore-preview"; id: unknown }
  | { type: "restore-workspace"; id: unknown; windowId: unknown; confirmed?: boolean; skipUrls?: string[] }
  | { type: "restore-workspace-tabs"; tabs: unknown; windowId: unknown; confirmed?: boolean; skipUrls?: string[] }
  | { type: "delete-workspace"; id: unknown }
  | { type: "set-device-name"; name: unknown }
  | { type: "add-tab-to-workspace"; id: unknown; tab: unknown }
  | { type: "get-workspace-board"; id: unknown }
  | { type: "update-workspace-tab"; id: unknown; index: unknown; title: unknown; url: unknown }
  | { type: "remove-workspace-tab"; id: unknown; index: unknown }
  | { type: "move-workspace-tab"; id: unknown; fromIndex: unknown; toIndex: unknown }
  | { type: "get-deferred-tabs" }
  | { type: "defer-board-tab"; tabId: unknown; dueAt: unknown }
  | { type: "open-deferred-tab"; id: unknown; windowId: unknown }
  | { type: "reschedule-deferred-tab"; id: unknown; dueAt: unknown }
  | { type: "delete-deferred-tab"; id: unknown }
  | { type: "get-board-statistics" }
  | { type: "activate-board-tab"; tabId: unknown }
  | { type: "close-board-tab"; tabId: unknown }
  | { type: "move-board-tab"; drop: unknown }
  | { type: "move-board-group"; boardKey: unknown; rank: unknown }
  | { type: "create-board-group"; title: unknown; color: unknown }
  | { type: "delete-board-group"; id: unknown; confirmed?: boolean }
  | { type: "save-board-layout"; layout: unknown }
  | { type: "get-recently-closed" }
  | { type: "restore-recently-closed"; id: unknown; windowId: unknown }
  | { type: "remove-recently-closed"; id: unknown }
  | { type: "clear-recently-closed" }
  | { type: "get-workspace-history"; id: unknown }
  | { type: "save-workspace-history-version"; id: unknown; note?: unknown }
  | { type: "restore-workspace-history-version"; id: unknown; version: unknown; windowId: unknown; confirmed?: boolean; skipUrls?: string[] }
  | { type: "export-workspaces-json" }
  | { type: "import-workspaces-json"; data?: unknown; confirmed?: boolean; cancelled?: boolean }
  | { type: "batch-close-tabs"; tabIds: unknown[] }
  | { type: "batch-defer-tabs"; tabIds: unknown[]; dueAt: unknown }
  | { type: "batch-move-tabs-to-group"; tabIds: unknown[]; targetBoardKey: unknown };

interface PendingOptionsImport {
  preview: PortableImportPreview;
  userId: string;
}

interface PendingWorkspaceImport {
  preview: WorkspacePortableImportPreview;
  userId: string;
}

let pendingOptionsImport: PendingOptionsImport | null = null;
let pendingWorkspaceImport: PendingWorkspaceImport | null = null;

function safeRecordId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128;
}

function safePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && Number.isSafeInteger(value);
}

interface DuplicateCloseGroup {
  retainedTabId: number;
  tabIds: number[];
}

function workspaceTabValidationMessage(status: Exclude<ReturnType<typeof validateWorkspaceTab>["status"], "valid">, t?: (key: string) => string): string {
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

function duplicateCloseGroups(value: unknown): DuplicateCloseGroup[] | null {
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

function isUpdateGroupRuleInput(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null && "id" in value && safeRecordId(value.id);
}

async function optionsState() {
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

async function syncOptions() {
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

async function synchronizeOptionsFromCloud(state: Awaited<ReturnType<typeof loadState>>): Promise<boolean> {
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

async function synchronizeOptions(state: Awaited<ReturnType<typeof loadState>>, include: { settings: boolean; rules: boolean; ignoredSites: boolean }): Promise<boolean> {
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

async function synchronizeOptionsMutation(state: Awaited<ReturnType<typeof loadState>>, include: { settings: boolean; rules: boolean; ignoredSites: boolean }): Promise<boolean> {
  return synchronizeOptions(state, include);
}

async function restoreUserOptions(userId: string): Promise<void> {
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

async function popupState() {
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

const BOARD_COLORS: readonly GroupColor[] = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

function boardGroupColor(value: unknown): GroupColor | null {
  return typeof value === "string" && (BOARD_COLORS as readonly string[]).includes(value) ? value as GroupColor : null;
}

async function currentNormalWindowId(): Promise<number> {
  const window = await chrome.windows.getCurrent();
  if (window.id == null || window.type !== "normal") throw new Error(i18n.t("useNormalWindow"));
  return window.id;
}

async function boardTab(tab: chrome.tabs.Tab, createdAtMap: Record<number, number>): Promise<BoardTab | null> {
  if (tab.id == null || tab.windowId == null || tab.pinned || !getSiteKey(tab.url)) return null;
  const createdAt = createdAtMap[tab.id];
  return { id: tab.id, windowId: tab.windowId, title: tab.title || i18n.t("unnamedTab"), url: tab.url, favIconUrl: tab.favIconUrl, createdAt };
}

function boardRank(state: Awaited<ReturnType<typeof loadState>>, boardKey: BoardGroup["boardKey"], fallback: number): number {
  return state.boardLayouts.find((layout) => layout.boardKey === boardKey && layout.deviceClass === "desktop")?.rank ?? fallback;
}

async function boardLogicalGroups(state: Awaited<ReturnType<typeof loadState>>, currentWindowId?: number): Promise<BoardLogicalGroup[]> {
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

async function boardDuplicateTabs(): Promise<BoardTab[]> {
  const createdAtMap = await loadTabCreatedAtMap();
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const results = await Promise.all(windows.flatMap((window) => (window.tabs ?? []).flatMap((tab) => boardTab(tab, createdAtMap))));
  return results.filter((tab): tab is BoardTab => tab !== null);
}

async function closeBoardDuplicates(groups: readonly DuplicateCloseGroup[]): Promise<{ closed: number; skipped: number }> {
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

async function boardState(currentWindowId?: number) {
  const user = await getStoredUser();
  if (!user) return { user: null, loginRequired: true, message: i18n.t("loginRequiredForBoard"), groups: [] };
  const state = await loadState();
  const groups = await boardLogicalGroups(state, currentWindowId);
  return { user: { id: user.id, email: user.email }, loginRequired: false, groups: buildBoardCards(groups), layouts: state.boardLayouts, settings: state.settings };
}

async function loadAllWorkspaces(userId: string, cloudSyncEnabled: boolean): Promise<WorkspaceSnapshot[]> {
  if (cloudSyncEnabled) {
    const cloud = await fetchWorkspaces(userId).catch(() => null);
    if (cloud) {
      await saveWorkspaceSnapshots(cloud).catch(() => {});
      return cloud;
    }
  }
  return loadWorkspaceSnapshots();
}

async function requireBoardUser() {
  const user = await getLocalUser();
  if (!user) throw new Error(i18n.t("loginRequiredToModify"));
  return user;
}

async function syncBoardMutation(state: Awaited<ReturnType<typeof loadState>>, include: { groups?: boolean; layouts?: boolean }) {
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

const DEFERRED_CHECK_ALARM = "deferred-tab-check";
const DEFERRED_DUE_ALARM_PREFIX = "deferred-due:";
const NOTIFICATION_DEFERRED_PREFIX = "deferred:";
let notifiedDeferredIds = new Set<string>();

function deferredDueAlarmName(id: string): string {
  return `${DEFERRED_DUE_ALARM_PREFIX}${id}`;
}

async function scheduleDeferredDueAlarm(id: string, dueAt: string): Promise<void> {
  const delayMs = Date.parse(dueAt) - Date.now();
  if (delayMs <= 0) return;
  const delayInMinutes = delayMs / 60000;
  await chrome.alarms.create(deferredDueAlarmName(id), { delayInMinutes });
}

async function clearDeferredDueAlarm(id: string): Promise<void> {
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

async function checkDueDeferredTabs(): Promise<void> {
  const tabs = await loadDeferredTabs();
  const now = Date.now();
  const dueTabs = tabs.filter((tab) => isDeferredTabDue(tab, now) && !notifiedDeferredIds.has(tab.id));
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
      notifiedDeferredIds.add(tab.id);
    } catch (error) {
      console.error("[Tab Garden] Failed to create deferred notification:", error);
    }
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
  notifiedDeferredIds.delete(deferredId);
  if (currentWindow?.id != null) {
    await chrome.windows.update(currentWindow.id, { focused: true }).catch(() => {});
  }
});

chrome.notifications.onClosed.addListener((notificationId) => {
  if (!notificationId.startsWith(NOTIFICATION_DEFERRED_PREFIX)) return;
  const deferredId = notificationId.slice(NOTIFICATION_DEFERRED_PREFIX.length);
  notifiedDeferredIds.delete(deferredId);
});

async function ensureDeferredCheckAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(DEFERRED_CHECK_ALARM).catch(() => undefined);
  if (!existing) {
    await chrome.alarms.create(DEFERRED_CHECK_ALARM, { periodInMinutes: 1 });
  }
  void checkDueDeferredTabs();
}

async function restoreDeferredDueAlarms(): Promise<void> {
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
      return;
    }
    if (command === "defer-active-tab") {
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
      return;
    }
    if (command === "save-workspace") {
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
        const snapshot = validateWorkspaceSnapshot({ id: crypto.randomUUID(), title: titleObj.title, createdAt: new Date().toISOString(), tabs: validTabs, deviceId, deviceName });
        if (!snapshot) { await sendToast(i18n.t("saveWorkspaceSnapshotInvalid")); return; }
        if (useCloud) await upsertWorkspace(user.id, snapshot).catch(() => {});
        await saveWorkspaceSnapshots([...existing, snapshot]).catch(() => {});
        await sendToast(i18n.t("saveWorkspaceSaved", [snapshot.title, String(validTabs.length)]));
      } catch (error) {
        console.error("[Tab Garden] save-workspace failed:", error);
        await sendToast(i18n.t("saveWorkspaceFailed"));
      }
      return;
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
  void (async () => {
    if (message.type === "auth-state") {
      const user = await getStoredUser();
      if (user) await prepareOptionsForUser(user.id);
      else pendingOptionsImport = null;
      return { user };
    }
    if (message.type === "restore-session") {
      const user = await getCurrentUser();
      if (!user) {
        pendingOptionsImport = null;
        return { user: null, sync: { state: "ready" as const } };
      }
      try {
        await restoreUserOptions(user.id);
        return { user, sync: { state: "ready" as const } };
      } catch (error) {
        return { user, sync: syncFailureStatus(error) };
      }
    }
    if (message.type === "auth-sign-in") {
      pendingOptionsImport = null;
      const user = await signIn(message.email.trim(), message.password, message.rememberForSevenDays === true);
      await restoreUserOptions(user.id);
      return { user };
    }
    if (message.type === "auth-sign-up") {
      const result = await signUp(message.email.trim(), message.password);
      if (!result.requiresEmailConfirmation && result.user) await restoreUserOptions(result.user.id);
      return result;
    }
    if (message.type === "auth-sign-out") {
      await clearUserData();
      await signOut();
      pendingOptionsImport = null;
      return { ok: true };
    }
    if (message.type === "open-tab-board") {
      if (!Number.isInteger(message.windowId) || message.windowId <= 0) throw new Error(i18n.t("cantFindWindow"));
      const window = await chrome.windows.get(message.windowId);
      if (window.type !== "normal") throw new Error(i18n.t("useNormalWindow"));
      const boardUrl = chrome.runtime.getURL("board.html");
      const existing = await chrome.tabs.query({ url: boardUrl });
      const target = existing[0];
      if (target && typeof target.id === "number") {
        if (target.windowId != null && target.windowId !== message.windowId) await chrome.windows.update(target.windowId, { focused: true }).catch(() => {});
        await chrome.tabs.update(target.id, { active: true }).catch(() => {});
        return { ok: true, tabId: target.id };
      }
      const tab = await chrome.tabs.create({ windowId: message.windowId, url: boardUrl });
      return { ok: true, tabId: tab.id };
    }
    if (message.type === "get-board-state") return boardState(message.windowId);
    if (message.type === "get-board-duplicate-preview") {
      await requireBoardUser();
      return { groups: findDuplicateBoardTabs(await boardDuplicateTabs()) };
    }
    if (message.type === "close-board-duplicates") {
      await requireBoardUser();
      if (message.confirmed !== true) throw new Error(i18n.t("confirmCloseDuplicates"));
      const groups = duplicateCloseGroups(message.groups);
      if (!groups) throw new Error(i18n.t("duplicatePreviewExpired"));
      return { ok: true, ...(await closeBoardDuplicates(groups)) };
    }
    if (message.type === "get-workspaces") {
      const user = await requireBoardUser();
      const [deviceId, deviceName] = await Promise.all([getOrCreateDeviceId(), getOrCreateDeviceName()]);
      const state = await loadState();
      const workspaces = await loadAllWorkspaces(user.id, state.settings.cloudSyncEnabled === true);
      return { workspaces, device: { id: deviceId, name: deviceName } };
    }
    if (message.type === "save-workspace") {
      const user = await requireBoardUser();
      const [deviceId, deviceName] = await Promise.all([getOrCreateDeviceId(), getOrCreateDeviceName()]);
      const state = await loadState();
      const useCloud = state.settings.cloudSyncEnabled === true;
      const existing = await loadAllWorkspaces(user.id, useCloud);
      const existingTitles = existing.filter((workspace) => workspace.deviceName === deviceName).map((workspace) => workspace.title);
      const title = validateWorkspaceTitle(message.title, existingTitles);
      if (title.status === "empty") throw new Error(i18n.t("workspaceNameEmpty"));
      if (title.status === "duplicate") throw new Error(i18n.t("workspaceNameDuplicate"));
      if (title.status !== "valid") throw new Error(i18n.t("workspaceNameTooLong"));
      const payload = validateWorkspaceTabsPayload(message.tabs);
      if (payload.status === "empty") throw new Error(i18n.t("selectAtLeastOneTab"));
      if (payload.status === "too-many") throw new Error(i18n.t("workspaceTabsLimit"));
      if (payload.status === "invalid") throw new Error(i18n.t("tabValidationError", [String(payload.displayIndex + 1), workspaceTabValidationMessage(payload.reason, (k) => i18n.t(k))]));
      const tabs = payload.tabs;
      const snapshot = validateWorkspaceSnapshot({ id: crypto.randomUUID(), title: title.title, createdAt: new Date().toISOString(), tabs, deviceId, deviceName });
      if (!snapshot) throw new Error(i18n.t("workspaceDataInvalid"));
      if (useCloud) await upsertWorkspace(user.id, snapshot).catch(() => {});
      await saveWorkspaceSnapshots([...existing, snapshot]).catch(() => {});
      return { workspace: snapshot };
    }
    if (message.type === "get-workspace-restore-preview") {
      const user = await requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error(i18n.t("workspaceNotFound"));
      const state = await loadState();
      const workspace = (await loadAllWorkspaces(user.id, state.settings.cloudSyncEnabled === true)).find((item) => item.id === message.id);
      if (!workspace) throw new Error(i18n.t("workspaceNotFound"));
      return { workspace, preview: workspaceRestorePreview(workspace) };
    }
    if (message.type === "restore-workspace") {
      const user = await requireBoardUser();
      if (message.confirmed !== true) throw new Error(i18n.t("confirmRestoreWorkspace"));
      if (!safeRecordId(message.id) || typeof message.windowId !== "number" || !Number.isInteger(message.windowId)) throw new Error(i18n.t("restoreParamsInvalid"));
      const state = await loadState();
      const workspace = (await loadAllWorkspaces(user.id, state.settings.cloudSyncEnabled === true)).find((item) => item.id === message.id);
      const window = await chrome.windows.get(message.windowId);
      if (!workspace || window.type !== "normal") throw new Error(i18n.t("workspaceOrWindowNotFound"));
      const preview = workspaceRestorePreview(workspace);
      const skipSet = new Set(Array.isArray(message.skipUrls) ? message.skipUrls : []);
      const toCreate = preview.tabs.filter((tab) => !skipSet.has(tab.url));
      for (const tab of toCreate) await chrome.tabs.create({ windowId: message.windowId, url: tab.url, active: false });
      return { ok: true, created: toCreate.length, unavailableCount: preview.unavailableCount };
    }
    if (message.type === "restore-workspace-tabs") {
      await requireBoardUser();
      if (message.confirmed !== true) throw new Error(i18n.t("confirmRestoreTabs"));
      const payload = validateWorkspaceTabsPayload(message.tabs);
      if (payload.status === "empty") throw new Error(i18n.t("selectAtLeastOneTab"));
      if (payload.status === "too-many") throw new Error(i18n.t("workspaceTabsLimit"));
      if (payload.status === "invalid") throw new Error(i18n.t("tabValidationError", [String(payload.displayIndex + 1), workspaceTabValidationMessage(payload.reason, (k) => i18n.t(k))]));
      const tabs = payload.tabs;
      const skipSet = new Set(Array.isArray(message.skipUrls) ? message.skipUrls : []);
      const toCreate = tabs.filter((tab) => !skipSet.has(tab.url));
      for (const tab of toCreate) await chrome.tabs.create({ windowId: typeof message.windowId === "number" ? message.windowId : undefined, url: tab.url, active: false });
      return { ok: true, created: toCreate.length, unavailableCount: 0 };
    }
    if (message.type === "delete-workspace") {
      const user = await requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error(i18n.t("workspaceNotFound"));
      const state = await loadState();
      if (state.settings.cloudSyncEnabled === true) await deleteWorkspaceRow(user.id, message.id).catch(() => {});
      const workspaces = (await loadWorkspaceSnapshots()).filter((item) => item.id !== message.id);
      await saveWorkspaceSnapshots(workspaces).catch(() => {});
      return { ok: true };
    }
    if (message.type === "set-device-name") {
      const name = typeof message.name === "string" ? message.name.trim() : "";
      if (!name || name.length > 60) throw new Error(i18n.t("deviceNameInvalid"));
      await chrome.storage.local.set({ deviceName: name });
      const user = await getCurrentUser();
      if (user) {
        const state = await loadState();
        const deviceId = await getOrCreateDeviceId();
        await Promise.all([
          state.settings.cloudSyncEnabled === true ? renameDeviceWorkspaces(user.id, deviceId, name).catch(() => {}) : Promise.resolve(),
        ]);
      }
      return { name };
    }
    if (message.type === "add-tab-to-workspace") {
      const user = await requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error(i18n.t("workspaceNotFound"));
      const validation = validateWorkspaceTab(message.tab);
      if (validation.status !== "valid") throw new Error(i18n.t("tabInvalid", [workspaceTabValidationMessage(validation.status, (k) => i18n.t(k))]));
      const tab = validation.tab;
      const state = await loadState();
      const useCloud = state.settings.cloudSyncEnabled === true;
      const all = await loadAllWorkspaces(user.id, useCloud);
      const workspace = all.find((item) => item.id === message.id);
      if (!workspace) throw new Error(i18n.t("workspaceNotFound"));
      const updated: WorkspaceSnapshot = { ...workspace, tabs: [...workspace.tabs, tab] };
      if (useCloud) await upsertWorkspace(user.id, updated).catch(() => {});
      await saveWorkspaceSnapshots(all.map((item) => (item.id === updated.id ? updated : item))).catch(() => {});
      return { ok: true };
    }
    if (message.type === "get-workspace-board") {
      const user = await requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error(i18n.t("workspaceNotFound"));
      const state = await loadState();
      const workspace = (await loadAllWorkspaces(user.id, state.settings.cloudSyncEnabled === true)).find((item) => item.id === message.id);
      if (!workspace) throw new Error(i18n.t("workspaceNotFound"));
      return {
        workspace: { id: workspace.id, title: workspace.title, createdAt: workspace.createdAt, deviceName: workspace.deviceName },
        cards: buildBoardCards(groupWorkspaceTabsByDomain(workspace.tabs, state.settings, state.groupRules, state.ignoredSites)),
      };
    }
    if (message.type === "update-workspace-tab") {
      const user = await requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error(i18n.t("workspaceNotFound"));
      if (typeof message.index !== "number" || !Number.isInteger(message.index) || message.index < 0) throw new Error(i18n.t("tabNotFound"));
      if (typeof message.title !== "string" || typeof message.url !== "string") throw new Error(i18n.t("tabContentInvalid"));
      const state = await loadState();
      const useCloud = state.settings.cloudSyncEnabled === true;
      const all = await loadAllWorkspaces(user.id, useCloud);
      const workspace = all.find((item) => item.id === message.id);
      if (!workspace) throw new Error(i18n.t("workspaceNotFound"));
      const tabs = updateWorkspaceTab(workspace.tabs, message.index, message.title, message.url);
      if (!tabs) throw new Error(i18n.t("unsupportedUrl"));
      const updated: WorkspaceSnapshot = { ...workspace, tabs };
      if (useCloud) await upsertWorkspace(user.id, updated).catch(() => {});
      await saveWorkspaceSnapshots(all.map((item) => (item.id === updated.id ? updated : item))).catch(() => {});
      return { ok: true };
    }
    if (message.type === "remove-workspace-tab") {
      const user = await requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error(i18n.t("workspaceNotFound"));
      if (typeof message.index !== "number" || !Number.isInteger(message.index) || message.index < 0) throw new Error(i18n.t("tabNotFound"));
      const state = await loadState();
      const useCloud = state.settings.cloudSyncEnabled === true;
      const all = await loadAllWorkspaces(user.id, useCloud);
      const workspace = all.find((item) => item.id === message.id);
      if (!workspace) throw new Error(i18n.t("workspaceNotFound"));
      const tabs = removeWorkspaceTab(workspace.tabs, message.index);
      if (!tabs) throw new Error(i18n.t("tabNotFound"));
      const updated: WorkspaceSnapshot = { ...workspace, tabs };
      if (useCloud) await upsertWorkspace(user.id, updated).catch(() => {});
      await saveWorkspaceSnapshots(all.map((item) => (item.id === updated.id ? updated : item))).catch(() => {});
      return { ok: true };
    }
    if (message.type === "move-workspace-tab") {
      const user = await requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error(i18n.t("workspaceNotFound"));
      if (typeof message.fromIndex !== "number" || !Number.isInteger(message.fromIndex) || message.fromIndex < 0 || typeof message.toIndex !== "number" || !Number.isInteger(message.toIndex) || message.toIndex < 0) throw new Error(i18n.t("tabPositionInvalid"));
      const state = await loadState();
      const useCloud = state.settings.cloudSyncEnabled === true;
      const all = await loadAllWorkspaces(user.id, useCloud);
      const workspace = all.find((item) => item.id === message.id);
      if (!workspace) throw new Error(i18n.t("workspaceNotFound"));
      const tabs = moveWorkspaceTab(workspace.tabs, message.fromIndex, message.toIndex);
      if (!tabs) throw new Error(i18n.t("cantMoveToPosition"));
      const updated: WorkspaceSnapshot = { ...workspace, tabs };
      if (useCloud) await upsertWorkspace(user.id, updated).catch(() => {});
      await saveWorkspaceSnapshots(all.map((item) => (item.id === updated.id ? updated : item))).catch(() => {});
      return { ok: true };
    }
    if (message.type === "get-deferred-tabs") { await requireBoardUser(); return { tabs: await loadDeferredTabs() }; }
    if (message.type === "get-board-statistics") {
      await requireBoardUser();
      const tabs = await boardDuplicateTabs();
      const duplicateTabCount = findDuplicateBoardTabs(tabs).reduce((count, group) => count + group.tabs.length - 1, 0);
      const deferredTabCount = (await loadDeferredTabs()).length;
      return { eligibleTabCount: tabs.length, duplicateTabCount, deferredTabCount, dueDeferredCount: deferredTabCount };
    }
    if (message.type === "defer-board-tab") {
      await requireBoardUser(); if (typeof message.tabId !== "number" || !Number.isInteger(message.tabId) || typeof message.dueAt !== "string" || Date.parse(message.dueAt) <= Date.now()) throw new Error(i18n.t("reminderTimeInvalid"));
      const source = await chrome.tabs.get(message.tabId); const tab = await boardTab(source, await loadTabCreatedAtMap()); if (!tab?.url) throw new Error(i18n.t("onlyWebTabsDefer"));
      const deferred = validateDeferredTab({ id: crypto.randomUUID(), title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl, dueAt: message.dueAt, createdAt: new Date().toISOString() }); if (!deferred) throw new Error(i18n.t("invalidTabData"));
      await saveDeferredTabs([...await loadDeferredTabs(), deferred]); void scheduleDeferredDueAlarm(deferred.id, deferred.dueAt); void ensureDeferredCheckAlarm(); await chrome.tabs.remove(message.tabId); return { ok: true, tab: deferred };
    }
    if (message.type === "batch-defer-tabs") {
      await requireBoardUser();
      if (!Array.isArray(message.tabIds)) throw new Error(i18n.t("invalidTabData"));
      if (typeof message.dueAt !== "string" || Date.parse(message.dueAt) <= Date.now()) throw new Error(i18n.t("reminderTimeInvalid"));
      const validTabIds = message.tabIds.filter(safePositiveInteger);
      const uniqueTabIds = [...new Set(validTabIds)];
      const existingDeferred = await loadDeferredTabs();
      const deferredTabs: DeferredTab[] = [];
      const toClose: number[] = [];
      const createdAtMap = await loadTabCreatedAtMap();
      for (const tabId of uniqueTabIds) {
        try {
          const source = await chrome.tabs.get(tabId);
          const tab = await boardTab(source, createdAtMap);
          if (!tab?.url) continue;
          const deferred = validateDeferredTab({ id: crypto.randomUUID(), title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl, dueAt: message.dueAt, createdAt: new Date().toISOString() });
          if (deferred) {
            deferredTabs.push(deferred);
            toClose.push(tabId);
          }
        } catch {
          continue;
        }
      }
      if (deferredTabs.length > 0) {
        await saveDeferredTabs([...existingDeferred, ...deferredTabs]);
        for (const dt of deferredTabs) void scheduleDeferredDueAlarm(dt.id, dt.dueAt);
        void ensureDeferredCheckAlarm();
        for (const tabId of toClose) {
          try { await chrome.tabs.remove(tabId); } catch { /* ignore */ }
        }
      }
      return { deferred: deferredTabs.length };
    }
    if (message.type === "open-deferred-tab") {
      await requireBoardUser();
      if (!safeRecordId(message.id) || typeof message.windowId !== "number" || !Number.isInteger(message.windowId)) throw new Error(i18n.t("reminderNotFound"));
      const deferredTabs = await loadDeferredTabs();
      const tab = deferredTabs.find((item) => item.id === message.id);
      const window = await chrome.windows.get(message.windowId);
      if (!tab || window.type !== "normal") throw new Error(i18n.t("reminderNotFound"));
      await chrome.tabs.create({ windowId: message.windowId, url: tab.url });
      await saveDeferredTabs(deferredTabs.filter((item) => item.id !== message.id));
      void clearDeferredDueAlarm(message.id);
      notifiedDeferredIds.delete(message.id);
      return { ok: true };
    }
    if (message.type === "reschedule-deferred-tab") { await requireBoardUser(); const dueAt = message.dueAt; if (!safeRecordId(message.id) || typeof dueAt !== "string" || Date.parse(dueAt) <= Date.now()) throw new Error(i18n.t("reminderTimeInvalid")); const tabs = (await loadDeferredTabs()).map((tab) => tab.id === message.id ? { ...tab, dueAt } : tab); await saveDeferredTabs(tabs); void clearDeferredDueAlarm(message.id); void scheduleDeferredDueAlarm(message.id, dueAt); notifiedDeferredIds.delete(message.id); return { ok: true }; }
    if (message.type === "delete-deferred-tab") { await requireBoardUser(); if (!safeRecordId(message.id)) throw new Error(i18n.t("reminderNotFound")); await saveDeferredTabs((await loadDeferredTabs()).filter((tab) => tab.id !== message.id)); void clearDeferredDueAlarm(message.id); notifiedDeferredIds.delete(message.id); return { ok: true }; }
    if (message.type === "activate-board-tab") {
      await requireBoardUser();
      if (typeof message.tabId !== "number" || !Number.isInteger(message.tabId) || message.tabId <= 0) throw new Error(i18n.t("invalidTabData"));
      const tabId = message.tabId;
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(tabId, { active: true });
      return { ok: true };
    }
    if (message.type === "close-board-tab") {
      await requireBoardUser();
      if (typeof message.tabId !== "number" || !Number.isInteger(message.tabId) || message.tabId <= 0) throw new Error(i18n.t("invalidTabData"));
      await chrome.tabs.remove(message.tabId);
      return { ok: true };
    }
    if (message.type === "batch-close-tabs") {
      await requireBoardUser();
      if (!Array.isArray(message.tabIds)) throw new Error(i18n.t("invalidTabData"));
      const validTabIds = message.tabIds.filter(safePositiveInteger);
      const uniqueTabIds = [...new Set(validTabIds)];
      let closed = 0;
      let skipped = 0;
      for (const tabId of uniqueTabIds) {
        try {
          await chrome.tabs.remove(tabId);
          closed += 1;
        } catch {
          skipped += 1;
        }
      }
      return { closed, skipped };
    }
    if (message.type === "move-board-tab") {
      await requireBoardUser();
      const drop = validateBoardTabDrop(message.drop);
      if (!drop) throw new Error(i18n.t("invalidTabData"));
      const tab = await chrome.tabs.get(drop.tabId);
      const source = await boardTab(tab, await loadTabCreatedAtMap());
      if (!source) throw new Error(i18n.t("onlyWebTabsDefer"));
      const state = await loadState();
      if (drop.targetBoardKey.startsWith("custom:")) {
        const id = drop.targetBoardKey.slice("custom:".length);
        if (!state.boardCustomGroups.some((group) => group.id === id)) throw new Error(i18n.t("workspaceNotFound"));
      }
      const groupTabs = (await boardLogicalGroups(state)).find((group) => group.boardKey === drop.targetBoardKey)?.tabs ?? [];
      const insertion = planBoardTabInsertion(groupTabs, source, drop);
      if (insertion.status === "target-missing") throw new Error(i18n.t("targetGroupChanged"));
      state.boardAssignments = insertion.tabs.reduce((assignments, candidate, order) => moveVirtualBoardAssignment(assignments, candidate.windowId!, candidate.id, drop.targetBoardKey, order), state.boardAssignments);
      await saveBoardAssignments(state.boardAssignments);
      return { ok: true };
    }
    if (message.type === "batch-move-tabs-to-group") {
      await requireBoardUser();
      if (!Array.isArray(message.tabIds)) throw new Error(i18n.t("invalidTabData"));
      if (typeof message.targetBoardKey !== "string" || !message.targetBoardKey) throw new Error(i18n.t("invalidTabData"));
      const validTabIds = message.tabIds.filter(safePositiveInteger);
      const uniqueTabIds = [...new Set(validTabIds)];
      const targetBoardKey = message.targetBoardKey as BoardGroup["boardKey"];
      const state = await loadState();
      if (targetBoardKey.startsWith("custom:")) {
        const id = targetBoardKey.slice("custom:".length);
        if (!state.boardCustomGroups.some((group) => group.id === id)) throw new Error(i18n.t("workspaceNotFound"));
      }
      const groups = await boardLogicalGroups(state);
      const targetGroup = groups.find((group) => group.boardKey === targetBoardKey);
      if (!targetGroup) throw new Error(i18n.t("workspaceNotFound"));
      let targetTabs = [...targetGroup.tabs];
      const movedIds = new Set<number>();
      let notFound = 0;
      const createdAtMap = await loadTabCreatedAtMap();
      for (const tabId of uniqueTabIds) {
        if (targetTabs.some((t) => t.id === tabId)) { movedIds.add(tabId); continue; }
        try {
          const chromeTab = await chrome.tabs.get(tabId);
          const source = await boardTab(chromeTab, createdAtMap);
          if (!source) { notFound += 1; continue; }
          targetTabs = targetTabs.filter((candidate) => candidate.id !== tabId);
          targetTabs.push(source);
          movedIds.add(tabId);
        } catch {
          notFound += 1;
        }
      }
      state.boardAssignments = targetTabs.reduce((assignments, candidate, order) => moveVirtualBoardAssignment(assignments, candidate.windowId!, candidate.id, targetBoardKey, order), state.boardAssignments);
      for (const group of groups) {
        if (group.boardKey === targetBoardKey) continue;
        const otherTabs = group.tabs.filter((candidate) => !movedIds.has(candidate.id));
        state.boardAssignments = otherTabs.reduce((assignments, candidate, order) => moveVirtualBoardAssignment(assignments, candidate.windowId!, candidate.id, group.boardKey, order), state.boardAssignments);
      }
      await saveBoardAssignments(state.boardAssignments);
      return { moved: movedIds.size, notFound };
    }
    if (message.type === "move-board-group") {
      await requireBoardUser();
      if (typeof message.boardKey !== "string" || typeof message.rank !== "number" || !Number.isInteger(message.rank)) throw new Error("无效的分组排序");
      const state = await loadState();
      const moved = moveBoardGroupRank(await boardLogicalGroups(state), message.boardKey as BoardGroup["boardKey"], message.rank);
      if (!moved) throw new Error("该分组不能移动到指定位置");
      const layoutsByKey = new Map(state.boardLayouts.filter((layout) => layout.deviceClass !== "desktop").map((layout) => [`${layout.deviceClass}:${layout.boardKey}`, layout]));
      for (const group of moved) {
        if (group.boardKey === "ungrouped") continue;
        const previous = state.boardLayouts.find((layout) => layout.deviceClass === "desktop" && layout.boardKey === group.boardKey);
        layoutsByKey.set(`desktop:${group.boardKey}`, { boardKey: group.boardKey, deviceClass: "desktop", rank: group.rank, autoFill: previous?.autoFill ?? true, ...(previous?.autoFill === false ? { manualLane: previous.manualLane, manualSlot: previous.manualSlot } : {}) });
      }
      state.boardLayouts = [...layoutsByKey.values()];
      await saveBoardLayouts(state.boardLayouts);
      return { ok: true, ...(await syncBoardMutation(state, { layouts: true })) };
    }
    if (message.type === "create-board-group") {
      await requireBoardUser();
      const title = typeof message.title === "string" ? message.title.trim() : "";
      const color = boardGroupColor(message.color);
      if (!title || title.length > 40 || !color) throw new Error("自定义分组信息无效");
      const state = await loadState();
      const id = crypto.randomUUID();
      state.boardCustomGroups = [...state.boardCustomGroups, { id, title, color, sortOrder: state.boardCustomGroups.reduce((max, group) => Math.max(max, group.sortOrder), -1) + 1 }];
      await saveBoardCustomGroups(state.boardCustomGroups);
      return { ok: true, id, ...(await syncBoardMutation(state, { groups: true })) };
    }
    if (message.type === "delete-board-group") {
      await requireBoardUser();
      if (!message.confirmed || !safeRecordId(message.id)) throw new Error("请确认删除自定义分组");
      const state = await loadState();
      if (!state.boardCustomGroups.some((group) => group.id === message.id)) throw new Error("自定义分组不存在");
      const boardKey = customBoardKey(message.id);
      state.boardCustomGroups = state.boardCustomGroups.filter((group) => group.id !== message.id);
      state.boardLayouts = boardKey ? state.boardLayouts.filter((layout) => layout.boardKey !== boardKey) : state.boardLayouts;
      if (boardKey) state.boardAssignments = Object.fromEntries(Object.entries(state.boardAssignments).filter(([, assignment]) => assignment.boardKey !== boardKey));
      await Promise.all([saveBoardAssignments(state.boardAssignments), saveBoardCustomGroups(state.boardCustomGroups), saveBoardLayouts(state.boardLayouts)]);
      return { ok: true, ...(await syncBoardMutation(state, { groups: true, layouts: true })) };
    }
    if (message.type === "save-board-layout") {
      await requireBoardUser();
      const layout = validateBoardLayout(message.layout);
      if (!layout || layout.boardKey === "ungrouped") throw new Error("看板布局无效");
      const state = await loadState();
      if (!(await boardLogicalGroups(state)).some((group) => group.boardKey === layout.boardKey)) throw new Error("看板分组不存在");
      state.boardLayouts = [...state.boardLayouts.filter((item) => item.boardKey !== layout.boardKey || item.deviceClass !== layout.deviceClass), layout];
      await saveBoardLayouts(state.boardLayouts);
      return { ok: true, ...(await syncBoardMutation(state, { layouts: true })) };
    }
    if (message.type === "get-popup-state") return popupState();
    if (message.type === "get-options-state") return optionsState();
    if (message.type === "sync-options") return syncOptions();
    if (message.type === "export-options-data") return { data: toPortableDataFromState(await loadState()) };
    if (message.type === "sync-now") {
      const user = await getCurrentUser();
      if (user) await restoreUserOptions(user.id);
      const state = await loadState();
      const synced = await synchronizeOptionsFromCloud(state);
      return { ok: true, synced, lastSuccessfulSyncAt: state.settings.lastSuccessfulSyncAt ?? null };
    }
    if (message.type === "save-options-settings") {
      const settings = validateOptionsSettings(message.settings);
      if (!settings) throw new Error("设置包含无效数据");
      const state = await loadState();
      state.settings = { ...settings, lastSuccessfulSyncAt: null };
      await saveSettings(state.settings);
      void i18n.setLanguage(settings.language);
      const synced = await synchronizeOptionsMutation(state, { settings: true, rules: false, ignoredSites: false });
      return { ok: true, synced, settings: state.settings };
    }
    if (message.type === "create-group-rule") {
      const state = await loadState();
      const rule = createGroupRuleFromInput(
        message.rule,
        crypto.randomUUID(),
        state.groupRules.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1,
      );
      if (!rule) throw new Error("分组规则包含无效数据");
      state.groupRules = [...state.groupRules, rule];
      await saveOptionsData(state.settings, state.groupRules, state.ignoredSites);
      const synced = await synchronizeOptionsMutation(state, { settings: false, rules: true, ignoredSites: false });
      return { ok: true, synced, rule };
    }
    if (message.type === "update-group-rule") {
      const state = await loadState();
      const input = message.rule;
      if (!isUpdateGroupRuleInput(input)) throw new Error("分组规则包含无效数据");
      const index = state.groupRules.findIndex((item) => item.id === input.id);
      if (index < 0) throw new Error("找不到要更新的分组规则");
      const existing = state.groupRules[index];
      if (!existing) throw new Error("找不到要更新的分组规则");
      const rule = updateGroupRuleFromInput(input, existing);
      if (!rule) throw new Error("分组规则包含无效数据");
      state.groupRules = state.groupRules.map((item, itemIndex) => itemIndex === index ? rule : item);
      await saveOptionsData(state.settings, state.groupRules, state.ignoredSites);
      const synced = await synchronizeOptionsMutation(state, { settings: false, rules: true, ignoredSites: false });
      return { ok: true, synced, rule };
    }
    if (message.type === "delete-group-rule") {
      if (!safeRecordId(message.id)) throw new Error("分组规则 ID 无效");
      const state = await loadState();
      if (!state.groupRules.some((rule) => rule.id === message.id)) throw new Error("找不到要删除的分组规则");
      state.groupRules = state.groupRules.filter((rule) => rule.id !== message.id);
      await saveOptionsData(state.settings, state.groupRules, state.ignoredSites);
      const synced = await synchronizeOptionsMutation(state, { settings: false, rules: true, ignoredSites: false });
      return { ok: true, synced };
    }
    if (message.type === "create-ignored-site") {
      const state = await loadState();
      const site = createIgnoredSiteFromInput(
        message.site,
        crypto.randomUUID(),
        state.ignoredSites.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1,
      );
      if (!site) throw new Error("忽略站点包含无效数据");
      if (state.ignoredSites.some((item) => item.domain === site.domain && item.matchScope === site.matchScope)) throw new Error("该忽略站点已存在");
      state.ignoredSites = [...state.ignoredSites, site];
      await saveOptionsData(state.settings, state.groupRules, state.ignoredSites);
      const synced = await synchronizeOptionsMutation(state, { settings: false, rules: false, ignoredSites: true });
      return { ok: true, synced, site };
    }
    if (message.type === "delete-ignored-site") {
      if (!safeRecordId(message.id)) throw new Error("忽略站点 ID 无效");
      const state = await loadState();
      if (!state.ignoredSites.some((site) => site.id === message.id)) throw new Error("找不到要删除的忽略站点");
      state.ignoredSites = state.ignoredSites.filter((site) => site.id !== message.id);
      await saveOptionsData(state.settings, state.groupRules, state.ignoredSites);
      const synced = await synchronizeOptionsMutation(state, { settings: false, rules: false, ignoredSites: true });
      return { ok: true, synced };
    }
    if (message.type === "import-options-data") {
      if (message.cancelled) {
        pendingOptionsImport = null;
        return { ok: true, cancelled: true };
      }
      if (!message.confirmed) {
        const user = await getCurrentUser();
        if (!user) throw new Error("请先登录后再导入设置");
        const preview = previewPortableImport(message.data);
        if (!preview) {
          pendingOptionsImport = null;
          throw new Error("导入文件格式无效");
        }
        pendingOptionsImport = { preview, userId: user.id };
        return { ok: true, preview: { groupRuleCount: preview.groupRuleCount, ignoredSiteCount: preview.ignoredSiteCount } };
      }
      const user = await getCurrentUser();
      if (!pendingOptionsImport || !canConfirmOptionsImport(pendingOptionsImport.userId, user?.id ?? null)) {
        pendingOptionsImport = null;
        throw new Error("导入预览已失效，请重新预览后再确认");
      }
      const state = applyPortableImport(await loadState(), pendingOptionsImport.preview, true);
      pendingOptionsImport = null;
      await saveOptionsData(state.settings, state.groupRules, state.ignoredSites);
      const synced = await synchronizeOptionsMutation(state, { settings: true, rules: true, ignoredSites: true });
      return { ok: true, synced, settings: state.settings };
    }
    if (message.type === "update-settings") {
      const settings = validateOptionsSettings(message.settings);
      if (!settings) throw new Error("设置包含无效数据");
      const state = await loadState();
      state.settings = { ...settings, lastSuccessfulSyncAt: null };
      await saveSettings(state.settings);
      void i18n.setLanguage(settings.language);
      const synced = await synchronizeOptionsMutation(state, { settings: true, rules: false, ignoredSites: false });
      return { ok: true, synced };
    }
    if (message.type === "create-custom-group") {
      if (!message.tabIds.length) throw new Error("请至少选择一个标签页");
      const state = await loadState();
      const id = crypto.randomUUID();
      state.boardCustomGroups = [...state.boardCustomGroups, {
        id,
        title: message.title.trim() || "自定义分组",
        color: message.color,
        sortOrder: state.boardCustomGroups.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1,
      }];
      const tabs = await Promise.all(message.tabIds.map((tabId) => chrome.tabs.get(tabId)));
      const windowId = tabs[0]?.windowId;
      const createdAtMap = await loadTabCreatedAtMap();
      const mappedTabs = await Promise.all(tabs.map((tab) => boardTab(tab, createdAtMap)));
      if (windowId == null || tabs.some((tab) => tab.windowId !== windowId) || mappedTabs.some((tab) => !tab)) throw new Error("请选择同一窗口中的普通网页标签页");
      const boardKey = customBoardKey(id);
      if (!boardKey) throw new Error("无法创建自定义分组");
      state.boardAssignments = message.tabIds.reduce((assignments, tabId, order) => moveVirtualBoardAssignment(assignments, windowId, tabId, boardKey, order), state.boardAssignments);
      await Promise.all([saveBoardAssignments(state.boardAssignments), saveBoardCustomGroups(state.boardCustomGroups)]);
      return { ok: true };
    }
    if (message.type === "delete-custom-group") {
      const state = await loadState();
      const boardKey = customBoardKey(message.id);
      state.boardCustomGroups = state.boardCustomGroups.filter((group) => group.id !== message.id);
      if (boardKey) state.boardAssignments = Object.fromEntries(Object.entries(state.boardAssignments).filter(([, assignment]) => assignment.boardKey !== boardKey));
      await Promise.all([saveBoardAssignments(state.boardAssignments), saveBoardCustomGroups(state.boardCustomGroups)]);
      return { ok: true };
    }
    if (message.type === "get-recently-closed") {
      await requireBoardUser();
      return { tabs: await loadRecentlyClosedTabs() };
    }
    if (message.type === "restore-recently-closed") {
      await requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error("记录不存在");
      if (typeof message.windowId !== "number" || !Number.isInteger(message.windowId)) throw new Error("窗口无效");
      const tabs = await loadRecentlyClosedTabs();
      const tab = tabs.find((item) => item.id === message.id);
      const window = await chrome.windows.get(message.windowId);
      if (!tab || window.type !== "normal") throw new Error("记录或窗口不存在");
      if (tab.sessionId) {
        try {
          await chrome.sessions.restore(tab.sessionId);
        } catch {
          await chrome.tabs.create({ windowId: message.windowId, url: tab.url });
        }
      } else {
        await chrome.tabs.create({ windowId: message.windowId, url: tab.url });
      }
      await removeRecentlyClosedTab(tab.id);
      return { ok: true };
    }
    if (message.type === "remove-recently-closed") {
      await requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error("记录 ID 无效");
      await removeRecentlyClosedTab(message.id);
      return { ok: true };
    }
    if (message.type === "clear-recently-closed") {
      await requireBoardUser();
      await clearRecentlyClosedTabs();
      return { ok: true };
    }
    if (message.type === "get-workspace-history") {
      const user = await requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error("工作区不存在");
      const history = await loadWorkspaceHistory(message.id);
      return {
        history, maxVersions: MAX_WORKSPACE_HISTORY_VERSIONS };
    }
    if (message.type === "save-workspace-history-version") {
      const user = await requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error("工作区不存在");
      const state = await loadState();
      const useCloud = state.settings.cloudSyncEnabled === true;
      const workspace = (await loadAllWorkspaces(user.id, useCloud)).find((ws) => ws.id === message.id);
      if (!workspace) throw new Error("工作区不存在");
      const note = typeof message.note === "string" ? message.note : undefined;
      const updated = await saveWorkspaceVersion(message.id, workspace, note);
      return { ok: true, history: updated };
    }
    if (message.type === "restore-workspace-history-version") {
      const user = await requireBoardUser();
      if (message.confirmed !== true) throw new Error("请确认恢复历史版本");
      if (!safeRecordId(message.id) || typeof message.version !== "number" || !Number.isInteger(message.version) || message.version < 1) throw new Error("参数无效");
      if (typeof message.windowId !== "number" || !Number.isInteger(message.windowId)) throw new Error("窗口无效");
      const history = await loadWorkspaceHistory(message.id);
      const version = history?.versions.find((v) => v.version === message.version);
      const window = await chrome.windows.get(message.windowId);
      if (!version || window.type !== "normal") throw new Error("历史版本或窗口不存在");
      const preview = workspaceRestorePreview(version.snapshot);
      const skipSet = new Set(Array.isArray(message.skipUrls) ? message.skipUrls : []);
      const toCreate = preview.tabs.filter((tab) => !skipSet.has(tab.url));
      for (const tab of toCreate) await chrome.tabs.create({ windowId: message.windowId, url: tab.url, active: false });
      return { ok: true, created: toCreate.length, unavailableCount: preview.unavailableCount };
    }
    if (message.type === "export-workspaces-json") {
      const user = await requireBoardUser();
      const state = await loadState();
      const workspaces = await loadAllWorkspaces(user.id, state.settings.cloudSyncEnabled === true);
      return { data: toWorkspacePortableData(workspaces) };
    }
    if (message.type === "import-workspaces-json") {
      if (message.cancelled) {
        pendingWorkspaceImport = null;
        return { ok: true, cancelled: true };
      }
      if (!message.confirmed) {
        const user = await getCurrentUser();
        if (!user) throw new Error("请先登录后再导入工作区");
        const preview = previewWorkspacePortableImport(message.data);
        if (!preview) {
          pendingWorkspaceImport = null;
          throw new Error("导入文件格式无效");
        }
        pendingWorkspaceImport = { preview, userId: user.id };
        return { ok: true, preview: { workspaceCount: preview.workspaceCount, totalTabs: preview.totalTabs } };
      }
      const currentUser = await getCurrentUser();
      if (!pendingWorkspaceImport || !currentUser || !canConfirmOptionsImport(pendingWorkspaceImport.userId, currentUser.id ?? null)) {
        pendingWorkspaceImport = null;
        throw new Error("导入预览已失效，请重新预览后再确认");
      }
      const state = await loadState();
      const useCloud = state.settings.cloudSyncEnabled === true;
      const existing = await loadAllWorkspaces(currentUser.id, useCloud);
      const imported = pendingWorkspaceImport.preview.data.workspaces;
      const merged: WorkspaceSnapshot[] = [...existing];
      for (const ws of imported) {
        const existingIndex = merged.findIndex((m) => m.title === ws.title);
        if (existingIndex === -1) {
          const newWs = { ...ws, id: crypto.randomUUID() };
          merged.push(newWs);
          if (useCloud) await upsertWorkspace(currentUser.id, newWs).catch(() => {});
          continue;
        }
        const existingWs = merged[existingIndex]!;
        const existingUrls = new Set(existingWs.tabs.map((t) => t.url));
        const importedUrls = new Set(ws.tabs.map((t) => t.url));
        const allUrlsSame = existingUrls.size === importedUrls.size && [...existingUrls].every((url) => importedUrls.has(url));
        if (allUrlsSame) continue;
        const mergedTabs = [...existingWs.tabs];
        for (const tab of ws.tabs) {
          if (!existingUrls.has(tab.url)) mergedTabs.push(tab);
        }
        const updatedWs: WorkspaceSnapshot = { ...existingWs, tabs: mergedTabs };
        merged[existingIndex] = updatedWs;
        if (useCloud) await upsertWorkspace(currentUser.id, updatedWs).catch(() => {});
      }
      pendingWorkspaceImport = null;
      await saveWorkspaceSnapshots(merged).catch(() => {});
      const synced = useCloud;
      return { ok: true, synced, importedCount: imported.length, totalCount: merged.length };
    }
    return { ok: false };
  })().then(sendResponse, (error: unknown) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
  return true;
});
