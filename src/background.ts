import {
  UNGROUPED,
  autoRecordKey,
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
  validateOptionsSettings,
  type CustomGroupRecord,
  type GroupColor,
  type PortableImportPreview,
  type Settings,
} from "./shared.js";
import { loadState, prepareOptionsForUser, saveAutoGroups, saveCustomGroups, saveOptionsData, saveSettings } from "./storage.js";
import { getCurrentUser, signIn, signOut, signUp } from "./auth.js";
import { pushSettings, replaceOptionalSyncData, restoreOptionalSyncData, syncSettings } from "./sync.js";

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
  | { type: "import-options-data"; data?: unknown; confirmed?: boolean; cancelled?: boolean };

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
  state.settings.lastSuccessfulSyncAt = new Date().toISOString();
  await saveOptionsData(state.settings, state.groupRules, state.ignoredSites);
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
  await saveOptionsData(state.settings, state.groupRules, state.ignoredSites);
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
