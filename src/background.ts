import {
  automaticBoardKey,
  buildBoardCards,
  customBoardKey,
  applyPortableImport,
  canConfirmOptionsImport,
  createGroupRuleFromInput,
  createIgnoredSiteFromInput,
  getSiteKey,
  previewPortableImport,
  syncFailureStatus,
  toPortableDataFromState,
  updateGroupRuleFromInput,
  validateBoardLayout,
  validateBoardTabDrop,
  buildVirtualBoardGroups,
  moveVirtualBoardAssignment,
  moveBoardGroupRank,
  type BoardGroup,
  type BoardLogicalGroup,
  type BoardTab,
  validateOptionsSettings,
  type GroupColor,
  type PortableImportPreview,
  type Settings,
} from "./shared.js";
import { loadState, prepareOptionsForUser, saveBoardAssignments, saveBoardCustomGroups, saveBoardLayouts, saveOptionsData, saveSettings } from "./storage.js";
import { getCurrentUser, signIn, signOut, signUp } from "./auth.js";
import { pushSettings, replaceBoardSyncData, replaceOptionalSyncData, restoreBoardSyncData, restoreOptionalSyncData, syncSettings } from "./sync.js";

type PopupMessage =
  | { type: "auth-state" }
  | { type: "auth-sign-in"; email: string; password: string }
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
    return mapped ? [mapped] : [];
  });
  return buildVirtualBoardGroups({ windowId, tabs: eligible, settings: state.settings, rules: state.groupRules, ignoredSites: state.ignoredSites, customGroups: state.boardCustomGroups, assignments: state.boardAssignments })
    .map((group) => ({ ...group, rank: boardRank(state, group.boardKey, group.rank) }))
    .sort((left, right) => left.rank - right.rank);
}

async function boardState() {
  const user = await getCurrentUser();
  if (!user) return { user: null, loginRequired: true, message: "请先登录后使用标签看板。", groups: [] };
  const windowId = await currentNormalWindowId();
  const state = await loadState();
  const groups = await boardLogicalGroups(windowId, state);
  return { user: { id: user.id, email: user.email }, loginRequired: false, windowId, groups: buildBoardCards(groups), layouts: state.boardLayouts };
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
      if (drop.targetBoardKey.startsWith("custom:")) {
        const id = drop.targetBoardKey.slice("custom:".length);
        if (!state.boardCustomGroups.some((group) => group.id === id)) throw new Error("目标自定义分组不存在");
      }
      if (drop.targetBoardKey === "ungrouped") {
        state.boardAssignments = moveVirtualBoardAssignment(state.boardAssignments, windowId, drop.tabId, "ungrouped");
        await saveBoardAssignments(state.boardAssignments);
        return { ok: true };
      }
      const targetTabs = ((await boardLogicalGroups(windowId, state)).find((group) => group.boardKey === drop.targetBoardKey)?.tabs ?? []).filter((candidate) => candidate.id !== drop.tabId);
      const targetIndex = drop.targetTabId === undefined ? targetTabs.length : targetTabs.findIndex((candidate) => candidate.id === drop.targetTabId);
      if (targetIndex < 0) throw new Error("目标标签已变化，请刷新看板后重试");
      const insertionIndex = drop.position === "before" ? targetIndex : drop.position === "after" ? targetIndex + 1 : targetTabs.length;
      targetTabs.splice(insertionIndex, 0, boardTab(tab)!);
      state.boardAssignments = targetTabs.reduce((assignments, candidate, order) => moveVirtualBoardAssignment(assignments, windowId, candidate.id, drop.targetBoardKey, order), state.boardAssignments);
      await saveBoardAssignments(state.boardAssignments);
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
