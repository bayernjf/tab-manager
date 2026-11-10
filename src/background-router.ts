import { i18n } from "./i18n.js";
import {
  applyPortableImport,
  buildBoardCards,
  canConfirmOptionsImport,
  countSettled,
  createGroupRuleFromInput,
  createIgnoredSiteFromInput,
  customBoardKey,
  findDuplicateBoardTabs,
  groupWorkspaceTabsByDomain,
  moveBoardGroupRank,
  moveVirtualBoardAssignment,
  moveWorkspaceTab,
  planBoardTabInsertion,
  previewPortableImport,
  previewWorkspacePortableImport,
  removeWorkspaceTab,
  toPortableDataFromState,
  toWorkspacePortableData,
  updateGroupRuleFromInput,
  updateWorkspaceTab,
  validateBoardLayout,
  validateBoardTabDrop,
  validateOptionsSettings,
  validateWorkspaceSnapshot,
  validateWorkspaceTabsPayload,
  validateWorkspaceTitle,
  workspaceRestorePreview,
  syncFailureStatus,
  mergeWorkspaceTombstones,
  validateWorkspaceTab,
  validateDeferredTab,
  MAX_WORKSPACE_HISTORY_VERSIONS,
  type BoardGroup,
  type DeferredTab,
  type GroupColor,
  type PortableImportPreview,
  type Settings,
  type WorkspacePortableImportPreview,
  type WorkspaceSnapshot,
  type WorkspaceTombstone,
} from "./shared.js";
import {
  loadState,
  loadDeferredTabs,
  saveDeferredTabs,
  loadWorkspaceSnapshots,
  loadWorkspaceTombstones,
  saveWorkspaceSnapshots,
  saveWorkspaceTombstones,
  getOrCreateDeviceId,
  getOrCreateDeviceName,
  loadRecentlyClosedTabs,
  removeRecentlyClosedTab,
  clearRecentlyClosedTabs,
  loadWorkspaceHistory,
  saveWorkspaceVersion,
  prepareOptionsForUser,
  loadTabCreatedAtMap,
  saveOptionsData,
  saveBoardAssignments,
  saveBoardCustomGroups,
  saveBoardLayouts,
  saveSettings,
  clearUserData,
} from "./storage.js";
import { getCurrentUser, getStoredUser, signIn, signOut, signUp, type AuthUser } from "./auth.js";
import { fetchWorkspaces, fetchWorkspaceTombstones, upsertWorkspace, upsertWorkspaceTombstone, deleteWorkspaceRow, renameDeviceWorkspaces } from "./sync.js";
import {
  boardState,
  boardDuplicateTabs,
  boardGroupColor,
  boardLogicalGroups,
  boardTab,
  clearDeferredDueAlarm,
  closeBoardDuplicates,
  duplicateCloseGroups,
  ensureDeferredCheckAlarm,
  forgetNotifiedId,
  isUpdateGroupRuleInput,
  loadAllWorkspaces,
  logCloudWriteFailure,
  optionsState,
  popupState,
  restoreUserOptions,
  safePositiveInteger,
  safeRecordId,
  scheduleDeferredDueAlarm,
  syncOptions,
  synchronizeOptionsFromCloud,
  synchronizeOptionsMutation,
  workspaceTabValidationMessage,
} from "./background-services.js";

export type PopupMessage =
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
  | { type: "overwrite-workspaces-from-cloud"; confirmed?: boolean }
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

export interface BackgroundRouterDeps {
  requireBoardUser: () => Promise<AuthUser>;
  syncBoardMutation: (state: LoadedState, include: { groups?: boolean; layouts?: boolean }) => Promise<{ synced: boolean; sync: { state: "ready" | "error"; message?: string } }>;
}

type LoadedState = Awaited<ReturnType<typeof loadState>>;

/** 处理 background.ts 生命周期外壳分流后的其余 runtime 消息。 */
export async function handleBackgroundMessage(message: PopupMessage, deps: BackgroundRouterDeps): Promise<unknown> {
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
      await deps.requireBoardUser();
      return { groups: findDuplicateBoardTabs(await boardDuplicateTabs()) };
    }
    if (message.type === "close-board-duplicates") {
      await deps.requireBoardUser();
      if (message.confirmed !== true) throw new Error(i18n.t("confirmCloseDuplicates"));
      const groups = duplicateCloseGroups(message.groups);
      if (!groups) throw new Error(i18n.t("duplicatePreviewExpired"));
      return { ok: true, ...(await closeBoardDuplicates(groups)) };
    }
    if (message.type === "get-workspaces") {
      const user = await deps.requireBoardUser();
      const [deviceId, deviceName] = await Promise.all([getOrCreateDeviceId(), getOrCreateDeviceName()]);
      const state = await loadState();
      const workspaces = await loadAllWorkspaces(user.id, state.settings.cloudSyncEnabled === true);
      return { workspaces, device: { id: deviceId, name: deviceName } };
    }
    if (message.type === "save-workspace") {
      const user = await deps.requireBoardUser();
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
      const now = new Date().toISOString();
      const snapshot = validateWorkspaceSnapshot({ id: crypto.randomUUID(), title: title.title, createdAt: now, updatedAt: now, tabs, deviceId, deviceName });
      if (!snapshot) throw new Error(i18n.t("workspaceDataInvalid"));
      if (useCloud) await upsertWorkspace(user.id, snapshot).catch(logCloudWriteFailure("workspace upsert"));
      await saveWorkspaceSnapshots([...existing, snapshot]).catch(() => {});
      return { workspace: snapshot };
    }
    if (message.type === "get-workspace-restore-preview") {
      const user = await deps.requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error(i18n.t("workspaceNotFound"));
      const state = await loadState();
      const workspace = (await loadAllWorkspaces(user.id, state.settings.cloudSyncEnabled === true)).find((item) => item.id === message.id);
      if (!workspace) throw new Error(i18n.t("workspaceNotFound"));
      return { workspace, preview: workspaceRestorePreview(workspace) };
    }
    if (message.type === "restore-workspace") {
      const user = await deps.requireBoardUser();
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
    if (message.type === "delete-workspace") {
      const user = await deps.requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error(i18n.t("workspaceNotFound"));
      const state = await loadState();
      const tombstone: WorkspaceTombstone = { id: message.id, deletedAt: new Date().toISOString() };
      if (state.settings.cloudSyncEnabled === true) {
        await deleteWorkspaceRow(user.id, message.id).catch(logCloudWriteFailure("workspace delete"));
        await upsertWorkspaceTombstone(user.id, tombstone).catch(logCloudWriteFailure("tombstone upsert"));
      }
      await saveWorkspaceTombstones(mergeWorkspaceTombstones(await loadWorkspaceTombstones(), [tombstone])).catch(() => {});
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
          state.settings.cloudSyncEnabled === true ? renameDeviceWorkspaces(user.id, deviceId, name).catch(logCloudWriteFailure("device rename")) : Promise.resolve(),
        ]);
      }
      return { name };
    }
    if (message.type === "add-tab-to-workspace") {
      const user = await deps.requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error(i18n.t("workspaceNotFound"));
      const validation = validateWorkspaceTab(message.tab);
      if (validation.status !== "valid") throw new Error(i18n.t("tabInvalid", [workspaceTabValidationMessage(validation.status, (k) => i18n.t(k))]));
      const tab = validation.tab;
      const state = await loadState();
      const useCloud = state.settings.cloudSyncEnabled === true;
      const all = await loadAllWorkspaces(user.id, useCloud);
      const workspace = all.find((item) => item.id === message.id);
      if (!workspace) throw new Error(i18n.t("workspaceNotFound"));
      const updated: WorkspaceSnapshot = { ...workspace, tabs: [...workspace.tabs, tab], updatedAt: new Date().toISOString() };
      if (useCloud) await upsertWorkspace(user.id, updated).catch(logCloudWriteFailure("workspace upsert"));
      await saveWorkspaceSnapshots(all.map((item) => (item.id === updated.id ? updated : item))).catch(() => {});
      return { ok: true };
    }
    if (message.type === "activate-board-tab") {
      await deps.requireBoardUser();
      if (typeof message.tabId !== "number" || !Number.isInteger(message.tabId) || message.tabId <= 0) throw new Error(i18n.t("invalidTabData"));
      const tabId = message.tabId;
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(tabId, { active: true });
      return { ok: true };
    }
    if (message.type === "close-board-tab") {
      await deps.requireBoardUser();
      if (typeof message.tabId !== "number" || !Number.isInteger(message.tabId) || message.tabId <= 0) throw new Error(i18n.t("invalidTabData"));
      await chrome.tabs.remove(message.tabId);
      return { ok: true };
    }
    if (message.type === "batch-close-tabs") {
      await deps.requireBoardUser();
      if (!Array.isArray(message.tabIds)) throw new Error(i18n.t("invalidTabData"));
      const validTabIds = message.tabIds.filter(safePositiveInteger);
      const uniqueTabIds = [...new Set(validTabIds)];
      const results = await Promise.allSettled(uniqueTabIds.map((tabId) => chrome.tabs.remove(tabId)));
      const { fulfilled: closed, rejected: skipped } = countSettled(results);
      return { closed, skipped };
    }
    if (message.type === "move-board-tab") {
      await deps.requireBoardUser();
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
      await deps.requireBoardUser();
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
      await deps.requireBoardUser();
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
      return { ok: true, ...(await deps.syncBoardMutation(state, { layouts: true })) };
    }
    if (message.type === "create-board-group") {
      await deps.requireBoardUser();
      const title = typeof message.title === "string" ? message.title.trim() : "";
      const color = boardGroupColor(message.color);
      if (!title || title.length > 40 || !color) throw new Error("自定义分组信息无效");
      const state = await loadState();
      const id = crypto.randomUUID();
      state.boardCustomGroups = [...state.boardCustomGroups, { id, title, color, sortOrder: state.boardCustomGroups.reduce((max, group) => Math.max(max, group.sortOrder), -1) + 1 }];
      await saveBoardCustomGroups(state.boardCustomGroups);
      return { ok: true, id, ...(await deps.syncBoardMutation(state, { groups: true })) };
    }
    if (message.type === "delete-board-group") {
      await deps.requireBoardUser();
      if (!message.confirmed || !safeRecordId(message.id)) throw new Error("请确认删除自定义分组");
      const state = await loadState();
      if (!state.boardCustomGroups.some((group) => group.id === message.id)) throw new Error("自定义分组不存在");
      const boardKey = customBoardKey(message.id);
      state.boardCustomGroups = state.boardCustomGroups.filter((group) => group.id !== message.id);
      state.boardLayouts = boardKey ? state.boardLayouts.filter((layout) => layout.boardKey !== boardKey) : state.boardLayouts;
      if (boardKey) state.boardAssignments = Object.fromEntries(Object.entries(state.boardAssignments).filter(([, assignment]) => assignment.boardKey !== boardKey));
      await Promise.all([saveBoardAssignments(state.boardAssignments), saveBoardCustomGroups(state.boardCustomGroups), saveBoardLayouts(state.boardLayouts)]);
      return { ok: true, ...(await deps.syncBoardMutation(state, { groups: true, layouts: true })) };
    }
    if (message.type === "save-board-layout") {
      await deps.requireBoardUser();
      const layout = validateBoardLayout(message.layout);
      if (!layout || layout.boardKey === "ungrouped") throw new Error("看板布局无效");
      const state = await loadState();
      if (!(await boardLogicalGroups(state)).some((group) => group.boardKey === layout.boardKey)) throw new Error("看板分组不存在");
      state.boardLayouts = [...state.boardLayouts.filter((item) => item.boardKey !== layout.boardKey || item.deviceClass !== layout.deviceClass), layout];
      await saveBoardLayouts(state.boardLayouts);
      return { ok: true, ...(await deps.syncBoardMutation(state, { layouts: true })) };
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
      await deps.requireBoardUser();
      return { tabs: await loadRecentlyClosedTabs() };
    }
    if (message.type === "restore-recently-closed") {
      await deps.requireBoardUser();
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
      await deps.requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error("记录 ID 无效");
      await removeRecentlyClosedTab(message.id);
      return { ok: true };
    }
    if (message.type === "clear-recently-closed") {
      await deps.requireBoardUser();
      await clearRecentlyClosedTabs();
      return { ok: true };
    }
    if (message.type === "get-workspace-history") {
      const user = await deps.requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error("工作区不存在");
      const history = await loadWorkspaceHistory(message.id);
      return {
        history, maxVersions: MAX_WORKSPACE_HISTORY_VERSIONS };
    }
    if (message.type === "save-workspace-history-version") {
      const user = await deps.requireBoardUser();
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
      const user = await deps.requireBoardUser();
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
      const user = await deps.requireBoardUser();
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
      let cloudFailures = 0;
      const track = (action: string) => (error: unknown) => { cloudFailures += 1; logCloudWriteFailure(action)(error); };
      for (const ws of imported) {
        const existingIndex = merged.findIndex((m) => m.title === ws.title);
        if (existingIndex === -1) {
          const newWs = { ...ws, id: crypto.randomUUID(), updatedAt: new Date().toISOString() };
          merged.push(newWs);
          if (useCloud) await upsertWorkspace(currentUser.id, newWs).catch(track("workspace upsert"));
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
        const updatedWs: WorkspaceSnapshot = { ...existingWs, tabs: mergedTabs, updatedAt: new Date().toISOString() };
        merged[existingIndex] = updatedWs;
        if (useCloud) await upsertWorkspace(currentUser.id, updatedWs).catch(track("workspace upsert"));
      }
      pendingWorkspaceImport = null;
      await saveWorkspaceSnapshots(merged).catch(() => {});
      // 如实上报：云端 upsert 全部成功才算 synced；失败数随响应返回，调用方可提示重试。
      const synced = useCloud && cloudFailures === 0;
      return { ok: true, synced, failedUploads: cloudFailures, importedCount: imported.length, totalCount: merged.length };
    }
    if (message.type === "overwrite-workspaces-from-cloud") {
      const user = await deps.requireBoardUser();
      const state = await loadState();
      if (state.settings.cloudSyncEnabled !== true) throw new Error(i18n.t("overwriteRequiresCloudSync"));
      const cloud = await fetchWorkspaces(user.id);
      if (message.confirmed !== true) {
        const cloudIds = new Set(cloud.map((workspace) => workspace.id));
        const localOnlyCount = (await loadWorkspaceSnapshots()).filter((workspace) => !cloudIds.has(workspace.id)).length;
        return { ok: true, preview: { cloudCount: cloud.length, localOnlyCount } };
      }
      const cloudTombstones = await fetchWorkspaceTombstones(user.id).catch(() => [] as WorkspaceTombstone[]);
      await saveWorkspaceSnapshots(cloud).catch(() => {});
      await saveWorkspaceTombstones(cloudTombstones).catch(() => {});
      return { ok: true, count: cloud.length };
    }
    if (message.type === "get-deferred-tabs") { await deps.requireBoardUser(); return { tabs: await loadDeferredTabs() }; }
    if (message.type === "defer-board-tab") {
      await deps.requireBoardUser(); if (typeof message.tabId !== "number" || !Number.isInteger(message.tabId) || typeof message.dueAt !== "string" || Date.parse(message.dueAt) <= Date.now()) throw new Error(i18n.t("reminderTimeInvalid"));
      const source = await chrome.tabs.get(message.tabId); const tab = await boardTab(source, await loadTabCreatedAtMap()); if (!tab?.url) throw new Error(i18n.t("onlyWebTabsDefer"));
      const deferred = validateDeferredTab({ id: crypto.randomUUID(), title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl, dueAt: message.dueAt, createdAt: new Date().toISOString() }); if (!deferred) throw new Error(i18n.t("invalidTabData"));
      await saveDeferredTabs([...await loadDeferredTabs(), deferred]); void scheduleDeferredDueAlarm(deferred.id, deferred.dueAt); void ensureDeferredCheckAlarm(); await chrome.tabs.remove(message.tabId); return { ok: true, tab: deferred };
    }
    if (message.type === "batch-defer-tabs") {
      await deps.requireBoardUser();
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
        await Promise.allSettled(toClose.map((tabId) => chrome.tabs.remove(tabId)));
      }
      return { deferred: deferredTabs.length };
    }
    if (message.type === "get-board-statistics") {
      await deps.requireBoardUser();
      const tabs = await boardDuplicateTabs();
      const duplicateTabCount = findDuplicateBoardTabs(tabs).reduce((count, group) => count + group.tabs.length - 1, 0);
      const deferredTabCount = (await loadDeferredTabs()).length;
      return { eligibleTabCount: tabs.length, duplicateTabCount, deferredTabCount, dueDeferredCount: deferredTabCount };
    }
    if (message.type === "open-deferred-tab") {
      await deps.requireBoardUser();
      if (!safeRecordId(message.id) || typeof message.windowId !== "number" || !Number.isInteger(message.windowId)) throw new Error(i18n.t("reminderNotFound"));
      const deferredTabs = await loadDeferredTabs();
      const tab = deferredTabs.find((item) => item.id === message.id);
      const window = await chrome.windows.get(message.windowId);
      if (!tab || window.type !== "normal") throw new Error(i18n.t("reminderNotFound"));
      await chrome.tabs.create({ windowId: message.windowId, url: tab.url });
      await saveDeferredTabs(deferredTabs.filter((item) => item.id !== message.id));
      void clearDeferredDueAlarm(message.id);
      await forgetNotifiedId(message.id);
      return { ok: true };
    }
    if (message.type === "reschedule-deferred-tab") { await deps.requireBoardUser(); const dueAt = message.dueAt; if (!safeRecordId(message.id) || typeof dueAt !== "string" || Date.parse(dueAt) <= Date.now()) throw new Error(i18n.t("reminderTimeInvalid")); const tabs = (await loadDeferredTabs()).map((tab) => tab.id === message.id ? { ...tab, dueAt } : tab); await saveDeferredTabs(tabs); void clearDeferredDueAlarm(message.id); void scheduleDeferredDueAlarm(message.id, dueAt); await forgetNotifiedId(message.id); return { ok: true }; }
    if (message.type === "delete-deferred-tab") { await deps.requireBoardUser(); if (!safeRecordId(message.id)) throw new Error(i18n.t("reminderNotFound")); await saveDeferredTabs((await loadDeferredTabs()).filter((tab) => tab.id !== message.id)); void clearDeferredDueAlarm(message.id); await forgetNotifiedId(message.id); return { ok: true }; }
    if (message.type === "get-workspace-board") {
      const user = await deps.requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error(i18n.t("workspaceNotFound"));
      const state = await loadState();
      const workspace = (await loadAllWorkspaces(user.id, state.settings.cloudSyncEnabled === true)).find((item) => item.id === message.id);
      if (!workspace) throw new Error(i18n.t("workspaceNotFound"));
      return {
        workspace: { id: workspace.id, title: workspace.title, createdAt: workspace.createdAt, deviceName: workspace.deviceName },
        cards: buildBoardCards(groupWorkspaceTabsByDomain(workspace.tabs, state.settings, state.groupRules, state.ignoredSites)),
      };
    }
    if (message.type === "restore-workspace-tabs") {
      await deps.requireBoardUser();
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
    if (message.type === "update-workspace-tab") {
      const user = await deps.requireBoardUser();
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
      const updated: WorkspaceSnapshot = { ...workspace, tabs, updatedAt: new Date().toISOString() };
      if (useCloud) await upsertWorkspace(user.id, updated).catch(logCloudWriteFailure("workspace upsert"));
      await saveWorkspaceSnapshots(all.map((item) => (item.id === updated.id ? updated : item))).catch(() => {});
      return { ok: true };
    }
    if (message.type === "remove-workspace-tab") {
      const user = await deps.requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error(i18n.t("workspaceNotFound"));
      if (typeof message.index !== "number" || !Number.isInteger(message.index) || message.index < 0) throw new Error(i18n.t("tabNotFound"));
      const state = await loadState();
      const useCloud = state.settings.cloudSyncEnabled === true;
      const all = await loadAllWorkspaces(user.id, useCloud);
      const workspace = all.find((item) => item.id === message.id);
      if (!workspace) throw new Error(i18n.t("workspaceNotFound"));
      const tabs = removeWorkspaceTab(workspace.tabs, message.index);
      if (!tabs) throw new Error(i18n.t("tabNotFound"));
      const updated: WorkspaceSnapshot = { ...workspace, tabs, updatedAt: new Date().toISOString() };
      if (useCloud) await upsertWorkspace(user.id, updated).catch(logCloudWriteFailure("workspace upsert"));
      await saveWorkspaceSnapshots(all.map((item) => (item.id === updated.id ? updated : item))).catch(() => {});
      return { ok: true };
    }
    if (message.type === "move-workspace-tab") {
      const user = await deps.requireBoardUser();
      if (!safeRecordId(message.id)) throw new Error(i18n.t("workspaceNotFound"));
      if (typeof message.fromIndex !== "number" || !Number.isInteger(message.fromIndex) || message.fromIndex < 0 || typeof message.toIndex !== "number" || !Number.isInteger(message.toIndex) || message.toIndex < 0) throw new Error(i18n.t("tabPositionInvalid"));
      const state = await loadState();
      const useCloud = state.settings.cloudSyncEnabled === true;
      const all = await loadAllWorkspaces(user.id, useCloud);
      const workspace = all.find((item) => item.id === message.id);
      if (!workspace) throw new Error(i18n.t("workspaceNotFound"));
      const tabs = moveWorkspaceTab(workspace.tabs, message.fromIndex, message.toIndex);
      if (!tabs) throw new Error(i18n.t("cantMoveToPosition"));
      const updated: WorkspaceSnapshot = { ...workspace, tabs, updatedAt: new Date().toISOString() };
      if (useCloud) await upsertWorkspace(user.id, updated).catch(logCloudWriteFailure("workspace upsert"));
      await saveWorkspaceSnapshots(all.map((item) => (item.id === updated.id ? updated : item))).catch(() => {});
      return { ok: true };
    }
    if (message.type === "sync-options") return syncOptions();
    return { ok: false };
}
