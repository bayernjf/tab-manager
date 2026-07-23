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
  updateGroupRuleFromInput,
  validateBoardLayout,
  validateBoardTabDrop,
  buildVirtualBoardGroups,
  boardWindowLabel,
  findDuplicateBoardTabs,
  validateWorkspaceSnapshot,
  workspaceRestorePreview,
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
} from "./shared.js";
import { loadState, loadWorkspaceSnapshots, loadDeferredTabs, prepareOptionsForUser, saveBoardAssignments, saveBoardCustomGroups, saveBoardLayouts, saveDeferredTabs, saveOptionsData, saveSettings, saveWorkspaceSnapshots } from "./storage.js";
import { getCurrentUser, getStoredUser, signIn, signOut, signUp } from "./auth.js";
import { pushSettings, replaceBoardSyncData, replaceOptionalSyncData, restoreBoardSyncData, restoreOptionalSyncData, syncSettings } from "./sync.js";

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
  | { type: "restore-workspace"; id: unknown; windowId: unknown; confirmed?: boolean }
  | { type: "delete-workspace"; id: unknown }
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
  | { type: "save-board-layout"; layout: unknown };

interface PendingOptionsImport {
  preview: PortableImportPreview;
  userId: string;
}

let pendingOptionsImport: PendingOptionsImport | null = null;

function safeRecordId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128;
}

interface DuplicateCloseGroup {
  retainedTabId: number;
  tabIds: number[];
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
  const user = await getCurrentUser();
  if (!user) throw new Error("登录状态已失效，请重新登录。");
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
  if (window.id == null || window.type !== "normal") throw new Error("请在普通浏览器窗口中使用标签看板");
  return window.id;
}

function boardTab(tab: chrome.tabs.Tab): BoardTab | null {
  if (tab.id == null || tab.windowId == null || tab.pinned || !getSiteKey(tab.url)) return null;
  return { id: tab.id, windowId: tab.windowId, title: tab.title || "未命名标签页", url: tab.url, favIconUrl: tab.favIconUrl };
}

function boardRank(state: Awaited<ReturnType<typeof loadState>>, boardKey: BoardGroup["boardKey"], fallback: number): number {
  return state.boardLayouts.find((layout) => layout.boardKey === boardKey && layout.deviceClass === "desktop")?.rank ?? fallback;
}

async function boardLogicalGroups(state: Awaited<ReturnType<typeof loadState>>, currentWindowId?: number): Promise<BoardLogicalGroup[]> {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const eligible = windows.flatMap((window, index) => (window.tabs ?? []).flatMap((tab) => {
    const mapped = boardTab(tab);
    const windowLabel = boardWindowLabel(index + 1);
    return mapped && windowLabel ? [{ ...mapped, windowLabel, isCurrentWindow: window.id === currentWindowId }] : [];
  }));
  return buildVirtualBoardGroups({ tabs: eligible, settings: state.settings, rules: state.groupRules, ignoredSites: state.ignoredSites, customGroups: state.boardCustomGroups, assignments: state.boardAssignments })
    .map((group) => ({ ...group, rank: boardRank(state, group.boardKey, group.rank) }))
    .sort((left, right) => left.rank - right.rank);
}

async function boardDuplicateTabs(): Promise<BoardTab[]> {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  return windows.flatMap((window) => (window.tabs ?? []).flatMap((tab) => {
    const mapped = boardTab(tab);
    return mapped ? [mapped] : [];
  }));
}

async function closeBoardDuplicates(groups: readonly DuplicateCloseGroup[]): Promise<{ closed: number; skipped: number }> {
  let closed = 0;
  let skipped = 0;
  for (const group of groups) {
    const live = await Promise.all(group.tabIds.map(async (tabId) => {
      try {
        const tab = boardTab(await chrome.tabs.get(tabId));
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
  const user = await getCurrentUser();
  if (!user) return { user: null, loginRequired: true, message: "请先登录后使用标签看板。", groups: [] };
  const state = await loadState();
  const groups = await boardLogicalGroups(state, currentWindowId);
  return { user: { id: user.id, email: user.email }, loginRequired: false, groups: buildBoardCards(groups), layouts: state.boardLayouts };
}

async function requireBoardUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("请先登录后再修改标签看板");
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

chrome.tabs.onCreated.addListener((tab) => {
  void (async () => {
    try {
      const state = await loadState();
      if (state.settings.openBoardOnNewTab !== true || typeof tab.id !== "number") return;
      if (!isBrowserNewTabUrl(tab.url) && !isBrowserNewTabUrl(tab.pendingUrl)) return;
      await chrome.tabs.update(tab.id, { url: chrome.runtime.getURL("board.html") });
    } catch {
      // Leave the newly created tab unchanged when local storage or Chrome rejects the update.
    }
  })();
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
      await signOut();
      pendingOptionsImport = null;
      return { ok: true };
    }
    if (message.type === "open-tab-board") {
      await requireBoardUser();
      if (!Number.isInteger(message.windowId) || message.windowId <= 0) throw new Error("找不到打开看板的窗口");
      const window = await chrome.windows.get(message.windowId);
      if (window.type !== "normal") throw new Error("请在普通浏览器窗口中使用标签看板");
      const tab = await chrome.tabs.create({ windowId: message.windowId, url: chrome.runtime.getURL("board.html") });
      return { ok: true, tabId: tab.id };
    }
    if (message.type === "get-board-state") return boardState(message.windowId);
    if (message.type === "get-board-duplicate-preview") {
      await requireBoardUser();
      return { groups: findDuplicateBoardTabs(await boardDuplicateTabs()) };
    }
    if (message.type === "close-board-duplicates") {
      await requireBoardUser();
      if (message.confirmed !== true) throw new Error("请先确认关闭重复标签");
      const groups = duplicateCloseGroups(message.groups);
      if (!groups) throw new Error("重复标签预览已失效，请重新检查");
      return { ok: true, ...(await closeBoardDuplicates(groups)) };
    }
    if (message.type === "get-workspaces") {
      await requireBoardUser();
      return { workspaces: await loadWorkspaceSnapshots() };
    }
    if (message.type === "save-workspace") {
      await requireBoardUser();
      const title = typeof message.title === "string" ? message.title.trim() : "";
      const snapshot = validateWorkspaceSnapshot({ id: crypto.randomUUID(), title, createdAt: new Date().toISOString(), tabs: message.tabs });
      if (!snapshot) throw new Error("工作区名称或标签页无效");
      const workspaces = [...await loadWorkspaceSnapshots(), snapshot];
      await saveWorkspaceSnapshots(workspaces);
      return { workspace: snapshot };
    }
    if (message.type === "get-workspace-restore-preview") {
      await requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error("工作区不存在");
      const workspace = (await loadWorkspaceSnapshots()).find((item) => item.id === message.id);
      if (!workspace) throw new Error("工作区不存在");
      return { workspace, preview: workspaceRestorePreview(workspace) };
    }
    if (message.type === "restore-workspace") {
      await requireBoardUser();
      if (message.confirmed !== true) throw new Error("请先确认恢复工作区");
      if (!safeRecordId(message.id) || typeof message.windowId !== "number" || !Number.isInteger(message.windowId)) throw new Error("恢复参数无效");
      const workspace = (await loadWorkspaceSnapshots()).find((item) => item.id === message.id);
      const window = await chrome.windows.get(message.windowId);
      if (!workspace || window.type !== "normal") throw new Error("工作区或目标窗口不存在");
      const preview = workspaceRestorePreview(workspace);
      for (const tab of preview.tabs) await chrome.tabs.create({ windowId: message.windowId, url: tab.url, active: false });
      return { ok: true, created: preview.tabs.length, unavailableCount: preview.unavailableCount };
    }
    if (message.type === "delete-workspace") {
      await requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error("工作区不存在");
      const workspaces = (await loadWorkspaceSnapshots()).filter((item) => item.id !== message.id);
      await saveWorkspaceSnapshots(workspaces);
      return { ok: true };
    }
    if (message.type === "get-deferred-tabs") { await requireBoardUser(); return { tabs: await loadDeferredTabs() }; }
    if (message.type === "get-board-statistics") {
      await requireBoardUser();
      const tabs = await boardDuplicateTabs();
      const duplicateTabCount = findDuplicateBoardTabs(tabs).reduce((count, group) => count + group.tabs.length - 1, 0);
      const dueDeferredCount = (await loadDeferredTabs()).filter((tab) => Date.parse(tab.dueAt) <= Date.now()).length;
      return { eligibleTabCount: tabs.length, duplicateTabCount, dueDeferredCount };
    }
    if (message.type === "defer-board-tab") {
      await requireBoardUser(); if (typeof message.tabId !== "number" || !Number.isInteger(message.tabId) || typeof message.dueAt !== "string" || Date.parse(message.dueAt) <= Date.now()) throw new Error("提醒时间无效");
      const source = await chrome.tabs.get(message.tabId); const tab = boardTab(source); if (!tab?.url) throw new Error("只能稍后处理网页标签");
      const deferred = validateDeferredTab({ id: crypto.randomUUID(), title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl, dueAt: message.dueAt, createdAt: new Date().toISOString() }); if (!deferred) throw new Error("标签页无效");
      await saveDeferredTabs([...await loadDeferredTabs(), deferred]); await chrome.tabs.remove(message.tabId); return { ok: true, tab: deferred };
    }
    if (message.type === "open-deferred-tab") {
      await requireBoardUser(); if (!safeRecordId(message.id) || typeof message.windowId !== "number" || !Number.isInteger(message.windowId)) throw new Error("提醒不存在"); const tab = (await loadDeferredTabs()).find((item) => item.id === message.id); const window = await chrome.windows.get(message.windowId); if (!tab || window.type !== "normal") throw new Error("提醒不存在"); await chrome.tabs.create({ windowId: message.windowId, url: tab.url }); return { ok: true };
    }
    if (message.type === "reschedule-deferred-tab") { await requireBoardUser(); const dueAt = message.dueAt; if (!safeRecordId(message.id) || typeof dueAt !== "string" || Date.parse(dueAt) <= Date.now()) throw new Error("提醒时间无效"); const tabs = (await loadDeferredTabs()).map((tab) => tab.id === message.id ? { ...tab, dueAt } : tab); await saveDeferredTabs(tabs); return { ok: true }; }
    if (message.type === "delete-deferred-tab") { await requireBoardUser(); if (!safeRecordId(message.id)) throw new Error("提醒不存在"); await saveDeferredTabs((await loadDeferredTabs()).filter((tab) => tab.id !== message.id)); return { ok: true }; }
    if (message.type === "activate-board-tab") {
      await requireBoardUser();
      if (typeof message.tabId !== "number" || !Number.isInteger(message.tabId) || message.tabId <= 0) throw new Error("无效的标签页");
      const tabId = message.tabId;
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(tabId, { active: true });
      return { ok: true };
    }
    if (message.type === "close-board-tab") {
      await requireBoardUser();
      if (typeof message.tabId !== "number" || !Number.isInteger(message.tabId) || message.tabId <= 0) throw new Error("无效的标签页");
      await chrome.tabs.remove(message.tabId);
      return { ok: true };
    }
    if (message.type === "move-board-tab") {
      await requireBoardUser();
      const drop = validateBoardTabDrop(message.drop);
      if (!drop) throw new Error("无效的标签拖放目标");
      const tab = await chrome.tabs.get(drop.tabId);
      const source = boardTab(tab);
      if (!source) throw new Error("该标签页不能移动到看板");
      const state = await loadState();
      if (drop.targetBoardKey.startsWith("custom:")) {
        const id = drop.targetBoardKey.slice("custom:".length);
        if (!state.boardCustomGroups.some((group) => group.id === id)) throw new Error("目标自定义分组不存在");
      }
      if (drop.targetBoardKey === "ungrouped") {
        state.boardAssignments = moveVirtualBoardAssignment(state.boardAssignments, source.windowId!, drop.tabId, "ungrouped");
        await saveBoardAssignments(state.boardAssignments);
        return { ok: true };
      }
      const targetTabs = ((await boardLogicalGroups(state)).find((group) => group.boardKey === drop.targetBoardKey)?.tabs ?? []).filter((candidate) => candidate.id !== drop.tabId);
      const targetIndex = drop.targetTabId === undefined ? targetTabs.length : targetTabs.findIndex((candidate) => candidate.id === drop.targetTabId);
      if (targetIndex < 0) throw new Error("目标标签已变化，请刷新看板后重试");
      const insertionIndex = drop.position === "before" ? targetIndex : drop.position === "after" ? targetIndex + 1 : targetTabs.length;
      targetTabs.splice(insertionIndex, 0, source);
      state.boardAssignments = targetTabs.reduce((assignments, candidate, order) => moveVirtualBoardAssignment(assignments, candidate.windowId!, candidate.id, drop.targetBoardKey, order), state.boardAssignments);
      await saveBoardAssignments(state.boardAssignments);
      return { ok: true };
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
      if (windowId == null || tabs.some((tab) => tab.windowId !== windowId || !boardTab(tab))) throw new Error("请选择同一窗口中的普通网页标签页");
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
    return { ok: false };
  })().then(sendResponse, (error: unknown) => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
  return true;
});
