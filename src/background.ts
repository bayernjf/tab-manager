import {
  UNGROUPED,
  boardDropIndex,
  autoRecordKey,
  automaticBoardKey,
  buildBoardCards,
  customBoardKey,
  applyPortableImport,
  canConfirmOptionsImport,
  createGroupRuleFromInput,
  createIgnoredSiteFromInput,
  getSiteKey,
  isIgnoredSite,
  previewPortableImport,
  resolveAutoGroup,
  syncFailureStatus,
  toPortableDataFromState,
  updateGroupRuleFromInput,
  validateBoardLayout,
  validateBoardTabDrop,
  isManagedBoardTabSource,
  moveBoardGroupRank,
  type BoardGroup,
  type BoardLogicalGroup,
  type BoardTab,
  validateOptionsSettings,
  type CustomGroupRecord,
  type GroupColor,
  type PortableImportPreview,
  type Settings,
} from "./shared.js";
import { loadState, prepareOptionsForUser, saveAutoGroups, saveBoardCustomGroups, saveBoardLayouts, saveCustomGroups, saveOptionsData, saveSettings } from "./storage.js";
import { getCurrentUser, signIn, signOut, signUp } from "./auth.js";
import { pushSettings, replaceBoardSyncData, replaceOptionalSyncData, restoreBoardSyncData, restoreOptionalSyncData, syncSettings } from "./sync.js";

const reconcileTimers = new Map<number, ReturnType<typeof setTimeout>>();
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

  for (const [key, record] of Object.entries(state.autoGroups)) {
    if (record.windowId !== windowId || !isIgnoredSite(record.siteKey, state.ignoredSites)) continue;
    const groupedTabs = await chrome.tabs.query({ groupId: record.groupId });
    if (groupedTabs.length) await chrome.tabs.ungroup(groupedTabs.flatMap((tab) => tab.id == null ? [] : [tab.id]));
    delete state.autoGroups[key];
    stateChanged = true;
  }

  const autoGroupIds = new Set(
    Object.values(state.autoGroups).filter((record) => record.windowId === windowId).map((record) => record.groupId),
  );
  const customGroupIds = new Set(Object.values(state.customGroups).map((record) => record.groupId));
  const tabs = await chrome.tabs.query({ windowId });

  // A tab in any non-managed group is considered manually grouped and remains untouched.
  const candidates = tabs.filter((tab) => {
    const siteKey = getSiteKey(tab.url);
    if (tab.id == null || tab.pinned || !siteKey || resolveAutoGroup(siteKey, state.settings, state.groupRules, state.ignoredSites).kind === "ignore") return false;
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
    const decision = resolveAutoGroup(siteKey, state.settings, state.groupRules, state.ignoredSites);
    if (decision.kind === "ignore") continue;
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
      title: decision.title,
      color: decision.color,
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
  | { type: "reconcile-now" }
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
  | { type: "open-tab-board" }
  | { type: "get-board-state" }
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

async function reconcileOptionsMutation(state: Awaited<ReturnType<typeof loadState>>, include: { settings: boolean; rules: boolean; ignoredSites: boolean }): Promise<boolean> {
  try {
    return await synchronizeOptions(state, include);
  } finally {
    await reconcileAllWindows();
  }
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
  await reconcileAllWindows();
}

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
  if (tab.id == null || tab.pinned || !getSiteKey(tab.url)) return null;
  return { id: tab.id, title: tab.title || "未命名标签页", url: tab.url, favIconUrl: tab.favIconUrl };
}

function boardRank(state: Awaited<ReturnType<typeof loadState>>, boardKey: BoardGroup["boardKey"], fallback: number): number {
  return state.boardLayouts.find((layout) => layout.boardKey === boardKey && layout.deviceClass === "desktop")?.rank ?? fallback;
}

async function boardLogicalGroups(windowId: number, state: Awaited<ReturnType<typeof loadState>>): Promise<BoardLogicalGroup[]> {
  const tabs = await chrome.tabs.query({ windowId });
  const eligible = tabs.flatMap((tab) => {
    const mapped = boardTab(tab);
    return mapped ? [{ tab, mapped }] : [];
  });
  const customRecords = new Map(Object.entries(state.customGroups)
    .filter(([, record]) => record.windowId === windowId)
    .map(([id, record]) => [id, record]));
  const customByNativeId = new Map([...customRecords.values()].map((record) => [record.groupId, record]));
  const automaticByNativeId = new Map(Object.values(state.autoGroups)
    .filter((record) => record.windowId === windowId)
    .map((record) => [record.groupId, record]));
  const ungrouped: BoardTab[] = [];
  const customTabs = new Map<string, BoardTab[]>();
  const automaticTabs = new Map<string, BoardTab[]>();

  for (const { tab, mapped } of eligible) {
    if (tab.groupId === UNGROUPED) {
      ungrouped.push(mapped);
      continue;
    }
    const custom = customByNativeId.get(tab.groupId);
    if (custom) {
      const groupTabs = customTabs.get(custom.id) ?? [];
      groupTabs.push(mapped);
      customTabs.set(custom.id, groupTabs);
      continue;
    }
    const automatic = automaticByNativeId.get(tab.groupId);
    if (automatic) {
      const groupTabs = automaticTabs.get(automatic.siteKey) ?? [];
      groupTabs.push(mapped);
      automaticTabs.set(automatic.siteKey, groupTabs);
    }
  }

  const groups: BoardLogicalGroup[] = [{ boardKey: "ungrouped", kind: "ungrouped", title: "未分组", color: "grey", rank: 0, tabs: ungrouped }];
  for (const custom of [...state.boardCustomGroups].sort((left, right) => left.sortOrder - right.sortOrder)) {
    const boardKey = customBoardKey(custom.id);
    if (!boardKey) continue;
    groups.push({ boardKey, kind: "custom", title: custom.title, color: custom.color, rank: boardRank(state, boardKey, custom.sortOrder + 1), tabs: customTabs.get(custom.id) ?? [] });
  }
  let automaticRank = state.boardCustomGroups.length + 1;
  for (const automatic of Object.values(state.autoGroups).filter((record) => record.windowId === windowId).sort((left, right) => left.siteKey.localeCompare(right.siteKey))) {
    const boardKey = automaticBoardKey(automatic.siteKey);
    if (!boardKey) continue;
    const tabsForGroup = automaticTabs.get(automatic.siteKey) ?? [];
    if (!tabsForGroup.length) continue;
    const decision = resolveAutoGroup(automatic.siteKey, state.settings, state.groupRules, state.ignoredSites);
    groups.push({
      boardKey,
      kind: "automatic",
      title: decision.kind === "group" ? decision.title : automatic.siteKey,
      color: decision.kind === "group" ? decision.color : state.settings.defaultGroupColor ?? "blue",
      rank: boardRank(state, boardKey, automaticRank++),
      tabs: tabsForGroup,
    });
  }
  return groups.sort((left, right) => left.rank - right.rank);
}

async function boardState() {
  const user = await getCurrentUser();
  if (!user) return { user: null, loginRequired: true, message: "请先登录后使用标签看板。", groups: [] };
  const windowId = await currentNormalWindowId();
  const state = await loadState();
  const groups = await boardLogicalGroups(windowId, state);
  return { user: { id: user.id, email: user.email }, loginRequired: false, windowId, groups: buildBoardCards(groups), layouts: state.boardLayouts };
}

async function reorderBoardTab(drop: NonNullable<ReturnType<typeof validateBoardTabDrop>>, destinationGroupId: number, windowId: number): Promise<void> {
  const source = await chrome.tabs.get(drop.tabId);
  if (source.windowId !== windowId || source.index == null) throw new Error("标签位置已变化，请刷新看板后重试");
  let target: chrome.tabs.Tab | undefined;
  let position: "before" | "after";
  if (drop.position === "append") {
    const destinationTabs = await chrome.tabs.query({ windowId, groupId: destinationGroupId });
    target = destinationTabs.filter((tab) => tab.id !== drop.tabId).sort((left, right) => left.index - right.index).at(-1);
    position = "after";
  } else {
    const targetTabId = drop.targetTabId;
    if (targetTabId === undefined) throw new Error("目标标签无效");
    const candidate = await chrome.tabs.get(targetTabId);
    if (candidate.windowId !== windowId || candidate.groupId !== destinationGroupId || !boardTab(candidate)) throw new Error("目标标签已变化，请刷新看板后重试");
    target = candidate;
    position = drop.position;
  }
  if (!target || target.index == null) return;
  const index = boardDropIndex(source.index, target.index, position);
  if (index === null || index === source.index) return;
  await chrome.tabs.move(drop.tabId, { index });
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

chrome.runtime.onMessage.addListener((message: PopupMessage, _sender, sendResponse) => {
  void (async () => {
    if (message.type === "auth-state") {
      const user = await getCurrentUser();
      if (user) await restoreUserOptions(user.id);
      else pendingOptionsImport = null;
      return { user };
    }
    if (message.type === "auth-sign-in") {
      pendingOptionsImport = null;
      const user = await signIn(message.email.trim(), message.password);
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
      const windowId = await currentNormalWindowId();
      const tab = await chrome.tabs.create({ windowId, url: chrome.runtime.getURL("board.html") });
      return { ok: true, tabId: tab.id };
    }
    if (message.type === "get-board-state") return boardState();
    if (message.type === "move-board-tab") {
      await requireBoardUser();
      const drop = validateBoardTabDrop(message.drop);
      if (!drop) throw new Error("无效的标签拖放目标");
      const windowId = await currentNormalWindowId();
      const tab = await chrome.tabs.get(drop.tabId);
      if (tab.windowId !== windowId || !boardTab(tab)) throw new Error("该标签页不能移动到看板");
      const state = await loadState();
      const automaticGroupIds = new Set(Object.values(state.autoGroups).filter((record) => record.windowId === windowId).map((record) => record.groupId));
      const customGroupIds = new Set(Object.values(state.customGroups).filter((record) => record.windowId === windowId).map((record) => record.groupId));
      if (!isManagedBoardTabSource(tab.groupId, automaticGroupIds, customGroupIds)) throw new Error("不能移动非本扩展管理的原生分组标签页");

      if (drop.targetBoardKey === "ungrouped") {
        if (tab.groupId !== UNGROUPED) await chrome.tabs.ungroup([drop.tabId]);
        await reorderBoardTab(drop, UNGROUPED, windowId);
        scheduleReconcile(windowId);
        return { ok: true };
      }
      if (drop.targetBoardKey.startsWith("custom:")) {
        const id = drop.targetBoardKey.slice("custom:".length);
        const durable = state.boardCustomGroups.find((group) => group.id === id);
        if (!durable) throw new Error("目标自定义分组不存在");
        let record = state.customGroups[id];
        if (!record || record.windowId !== windowId) {
          const groupId = await chrome.tabs.group({ tabIds: [drop.tabId], createProperties: { windowId } });
          await chrome.tabGroups.update(groupId, { title: durable.title, color: durable.color });
          record = { id, groupId, windowId, title: durable.title, color: durable.color };
          state.customGroups[id] = record;
        } else {
          const existing = await existingGroupIds(windowId);
          if (!existing.has(record.groupId)) throw new Error("目标自定义分组已失效，请刷新看板后重试");
          await chrome.tabs.group({ tabIds: [drop.tabId], groupId: record.groupId });
        }
        await saveCustomGroups(state.customGroups);
        await reorderBoardTab(drop, record.groupId, windowId);
        scheduleReconcile(windowId);
        return { ok: true };
      }
      const siteKey = drop.targetBoardKey.slice("auto:".length);
      if (getSiteKey(tab.url) !== siteKey) throw new Error("标签页只能移动到同一网站的自动分组");
      const target = Object.values(state.autoGroups).find((record) => record.windowId === windowId && record.siteKey === siteKey);
      if (!target || !(await existingGroupIds(windowId)).has(target.groupId)) throw new Error("目标自动分组已失效，请刷新看板后重试");
      await chrome.tabs.group({ tabIds: [drop.tabId], groupId: target.groupId });
      await reorderBoardTab(drop, target.groupId, windowId);
      scheduleReconcile(windowId);
      return { ok: true };
    }
    if (message.type === "move-board-group") {
      await requireBoardUser();
      if (typeof message.boardKey !== "string" || typeof message.rank !== "number" || !Number.isInteger(message.rank)) throw new Error("无效的分组排序");
      const windowId = await currentNormalWindowId();
      const state = await loadState();
      const moved = moveBoardGroupRank(await boardLogicalGroups(windowId, state), message.boardKey as BoardGroup["boardKey"], message.rank);
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
      const record = state.customGroups[message.id];
      if (record) {
        const tabs = await chrome.tabs.query({ groupId: record.groupId });
        if (tabs.length) await chrome.tabs.ungroup(tabs.flatMap((tab) => tab.id == null ? [] : [tab.id]));
        delete state.customGroups[message.id];
      }
      const boardKey = customBoardKey(message.id);
      state.boardCustomGroups = state.boardCustomGroups.filter((group) => group.id !== message.id);
      state.boardLayouts = boardKey ? state.boardLayouts.filter((layout) => layout.boardKey !== boardKey) : state.boardLayouts;
      await Promise.all([saveCustomGroups(state.customGroups), saveBoardCustomGroups(state.boardCustomGroups), saveBoardLayouts(state.boardLayouts)]);
      if (record) scheduleReconcile(record.windowId);
      return { ok: true, ...(await syncBoardMutation(state, { groups: true, layouts: true })) };
    }
    if (message.type === "save-board-layout") {
      await requireBoardUser();
      const layout = validateBoardLayout(message.layout);
      if (!layout || layout.boardKey === "ungrouped") throw new Error("看板布局无效");
      const windowId = await currentNormalWindowId();
      const state = await loadState();
      if (!(await boardLogicalGroups(windowId, state)).some((group) => group.boardKey === layout.boardKey)) throw new Error("看板分组不存在");
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
      await reconcileAllWindows();
      return { ok: true, synced, lastSuccessfulSyncAt: state.settings.lastSuccessfulSyncAt ?? null };
    }
    if (message.type === "save-options-settings") {
      const settings = validateOptionsSettings(message.settings);
      if (!settings) throw new Error("设置包含无效数据");
      const state = await loadState();
      state.settings = { ...settings, lastSuccessfulSyncAt: null };
      await saveSettings(state.settings);
      const synced = await reconcileOptionsMutation(state, { settings: true, rules: false, ignoredSites: false });
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
      const synced = await reconcileOptionsMutation(state, { settings: false, rules: true, ignoredSites: false });
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
      const synced = await reconcileOptionsMutation(state, { settings: false, rules: true, ignoredSites: false });
      return { ok: true, synced, rule };
    }
    if (message.type === "delete-group-rule") {
      if (!safeRecordId(message.id)) throw new Error("分组规则 ID 无效");
      const state = await loadState();
      if (!state.groupRules.some((rule) => rule.id === message.id)) throw new Error("找不到要删除的分组规则");
      state.groupRules = state.groupRules.filter((rule) => rule.id !== message.id);
      await saveOptionsData(state.settings, state.groupRules, state.ignoredSites);
      const synced = await reconcileOptionsMutation(state, { settings: false, rules: true, ignoredSites: false });
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
      const synced = await reconcileOptionsMutation(state, { settings: false, rules: false, ignoredSites: true });
      return { ok: true, synced, site };
    }
    if (message.type === "delete-ignored-site") {
      if (!safeRecordId(message.id)) throw new Error("忽略站点 ID 无效");
      const state = await loadState();
      if (!state.ignoredSites.some((site) => site.id === message.id)) throw new Error("找不到要删除的忽略站点");
      state.ignoredSites = state.ignoredSites.filter((site) => site.id !== message.id);
      await saveOptionsData(state.settings, state.groupRules, state.ignoredSites);
      const synced = await reconcileOptionsMutation(state, { settings: false, rules: false, ignoredSites: true });
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
      const synced = await reconcileOptionsMutation(state, { settings: true, rules: true, ignoredSites: true });
      return { ok: true, synced, settings: state.settings };
    }
    if (message.type === "update-settings") {
      const settings = validateOptionsSettings(message.settings);
      if (!settings) throw new Error("设置包含无效数据");
      const state = await loadState();
      state.settings = { ...settings, lastSuccessfulSyncAt: null };
      await saveSettings(state.settings);
      const synced = await reconcileOptionsMutation(state, { settings: true, rules: false, ignoredSites: false });
      return { ok: true, synced };
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
      state.boardCustomGroups = [...state.boardCustomGroups, {
        id,
        title: message.title.trim() || "自定义分组",
        color: message.color,
        sortOrder: state.boardCustomGroups.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1,
      }];
      for (const [key, auto] of Object.entries(state.autoGroups)) {
        if (auto.groupId === groupId) delete state.autoGroups[key];
      }
      await Promise.all([saveCustomGroups(state.customGroups), saveAutoGroups(state.autoGroups), saveBoardCustomGroups(state.boardCustomGroups)]);
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
        state.boardCustomGroups = state.boardCustomGroups.filter((group) => group.id !== message.id);
        await Promise.all([saveCustomGroups(state.customGroups), saveBoardCustomGroups(state.boardCustomGroups)]);
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
