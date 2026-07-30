import { i18n } from "./i18n.js";
import {
  DEFAULT_SETTINGS,
  detectBrowserKind,
  resetOptionsForUser,
  appendWorkspaceVersion,
  validateRecentlyClosedTab,
  validateTabProcessInfo,
  validateWorkspaceHistory,
  type BoardCustomGroup,
  type BoardLayout,
  type VirtualBoardAssignment,
  type GroupRule,
  type IgnoredSite,
  type Settings,
  type StoredState,
  type WorkspaceSnapshot,
  type DeferredTab,
  type RecentlyClosedTab,
  type TabProcessInfo,
  type WorkspaceHistory,
  MAX_RECENTLY_CLOSED_TABS,
} from "./shared.js";

const KEYS = ["settings", "boardAssignments", "groupRules", "ignoredSites", "boardCustomGroups", "boardLayouts", "optionsUserId"] as const;

export async function loadState(): Promise<StoredState> {
  const data = await chrome.storage.local.get(KEYS);
  return {
    settings: { ...DEFAULT_SETTINGS, ...(data.settings as Partial<Settings> | undefined) },
    boardAssignments: (data.boardAssignments as Record<string, VirtualBoardAssignment> | undefined) ?? {},
    groupRules: (data.groupRules as GroupRule[] | undefined) ?? [],
    ignoredSites: (data.ignoredSites as IgnoredSite[] | undefined) ?? [],
    boardCustomGroups: (data.boardCustomGroups as BoardCustomGroup[] | undefined) ?? [],
    boardLayouts: (data.boardLayouts as BoardLayout[] | undefined) ?? [],
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

export async function saveBoardAssignments(boardAssignments: Record<string, VirtualBoardAssignment>): Promise<void> {
  await chrome.storage.local.set({ boardAssignments });
}

export async function saveGroupRules(groupRules: GroupRule[]): Promise<void> {
  await chrome.storage.local.set({ groupRules });
}

export async function saveIgnoredSites(ignoredSites: IgnoredSite[]): Promise<void> {
  await chrome.storage.local.set({ ignoredSites });
}

export async function saveBoardCustomGroups(boardCustomGroups: BoardCustomGroup[]): Promise<void> {
  await chrome.storage.local.set({ boardCustomGroups });
}

export async function saveBoardLayouts(boardLayouts: BoardLayout[]): Promise<void> {
  await chrome.storage.local.set({ boardLayouts });
}

export async function loadWorkspaceSnapshots(): Promise<WorkspaceSnapshot[]> {
  const data = await chrome.storage.local.get("workspaceSnapshots");
  return (data.workspaceSnapshots as WorkspaceSnapshot[] | undefined) ?? [];
}

export async function saveWorkspaceSnapshots(workspaceSnapshots: readonly WorkspaceSnapshot[]): Promise<void> {
  await chrome.storage.local.set({ workspaceSnapshots });
}

export async function loadDeferredTabs(): Promise<DeferredTab[]> { const data = await chrome.storage.local.get("deferredTabs"); return (data.deferredTabs as DeferredTab[] | undefined) ?? []; }
export async function saveDeferredTabs(deferredTabs: readonly DeferredTab[]): Promise<void> { await chrome.storage.local.set({ deferredTabs }); }

export async function saveOptionsData(settings: Settings, groupRules: GroupRule[], ignoredSites: IgnoredSite[]): Promise<void> {
  await chrome.storage.local.set({ settings, groupRules, ignoredSites });
}

export async function prepareOptionsForUser(userId: string): Promise<StoredState> {
  const [state, data] = await Promise.all([loadState(), chrome.storage.local.get("optionsUserId")]);
  const prepared = resetOptionsForUser(state, data.optionsUserId as string | undefined, userId);
  if (prepared.changed) {
    await chrome.storage.local.set({
      optionsUserId: userId,
      settings: prepared.state.settings,
      groupRules: prepared.state.groupRules,
      ignoredSites: prepared.state.ignoredSites,
      boardCustomGroups: prepared.state.boardCustomGroups,
      boardLayouts: prepared.state.boardLayouts,
    });
  }
  return prepared.state;
}

export async function getOrCreateDeviceId(): Promise<string> {
  const { deviceId } = await chrome.storage.local.get("deviceId");
  if (typeof deviceId === "string" && deviceId) return deviceId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ deviceId: id });
  return id;
}

const LEGACY_DEVICE_NAMES = new Set(["本设备", "Mac 设备", "Windows 设备", "Linux 设备", "ChromeOS 设备"]);

export async function getOrCreateDeviceName(): Promise<string> {
  const { deviceName } = await chrome.storage.local.get("deviceName");
  // Regenerate when blank or when the cached value is a legacy auto-generated name
  // (older builds used platform-only names like "Mac 设备" without the browser suffix).
  // User-chosen names are preserved.
  if (typeof deviceName === "string" && deviceName.trim() && !LEGACY_DEVICE_NAMES.has(deviceName)) return deviceName;
  const name = defaultDeviceName();
  await chrome.storage.local.set({ deviceName: name });
  return name;
}

function defaultDeviceName(): string {
  const userAgent = navigator.userAgent ?? "";
  const browser = detectBrowserKind(userAgent) === "edge" ? "Edge" : "Chrome";
  let deviceType = i18n.t("deviceThis");
  if (/Mac/i.test(userAgent)) deviceType = i18n.t("deviceMac");
  else if (/Win/i.test(userAgent)) deviceType = i18n.t("deviceWin");
  else if (/CrOS/i.test(userAgent)) deviceType = i18n.t("deviceChromeOS");
  else if (/Linux/i.test(userAgent)) deviceType = i18n.t("deviceLinux");
  return `${deviceType}-${browser}`;
}

export async function loadRecentlyClosedTabs(): Promise<RecentlyClosedTab[]> {
  const data = await chrome.storage.local.get("recentlyClosedTabs");
  const raw = (data.recentlyClosedTabs as unknown[] | undefined) ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map(validateRecentlyClosedTab).filter((tab): tab is RecentlyClosedTab => tab !== null);
}

export async function saveRecentlyClosedTabs(tabs: readonly RecentlyClosedTab[]): Promise<void> {
  const trimmed = [...tabs].sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt)).slice(0, MAX_RECENTLY_CLOSED_TABS);
  await chrome.storage.local.set({ recentlyClosedTabs: trimmed });
}

export async function appendRecentlyClosedTab(tab: RecentlyClosedTab): Promise<RecentlyClosedTab[]> {
  const existing = await loadRecentlyClosedTabs();
  const next = [tab, ...existing.filter((item) => item.id !== tab.id)];
  await saveRecentlyClosedTabs(next);
  return next;
}

export async function removeRecentlyClosedTab(id: string): Promise<RecentlyClosedTab[]> {
  const existing = await loadRecentlyClosedTabs();
  const next = existing.filter((item) => item.id !== id);
  await saveRecentlyClosedTabs(next);
  return next;
}

export async function clearRecentlyClosedTabs(): Promise<void> {
  await chrome.storage.local.set({ recentlyClosedTabs: [] });
}

export async function loadTabProcesses(): Promise<TabProcessInfo[]> {
  const data = await chrome.storage.local.get("tabProcesses");
  const raw = (data.tabProcesses as unknown[] | undefined) ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map(validateTabProcessInfo).filter((info): info is TabProcessInfo => info !== null);
}

export async function saveTabProcesses(processes: readonly TabProcessInfo[]): Promise<void> {
  await chrome.storage.local.set({ tabProcesses: [...processes] });
}

export async function upsertTabProcess(info: TabProcessInfo): Promise<TabProcessInfo[]> {
  const existing = await loadTabProcesses();
  const next = existing.some((item) => item.tabId === info.tabId)
    ? existing.map((item) => (item.tabId === info.tabId ? info : item))
    : [...existing, info];
  await saveTabProcesses(next);
  return next;
}

export async function clearTabProcesses(): Promise<void> {
  await chrome.storage.local.set({ tabProcesses: [] });
}

export async function loadTabCreatedAtMap(): Promise<Record<number, number>> {
  const data = await chrome.storage.local.get("tabCreatedAt");
  const raw = data.tabCreatedAt;
  if (!isPlainObject(raw)) return {};
  const result: Record<number, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    const tabId = Number(key);
    if (!Number.isInteger(tabId) || tabId <= 0) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    result[tabId] = value;
  }
  return result;
}

export async function saveTabCreatedAtEntries(entries: Record<number, number>): Promise<void> {
  await chrome.storage.local.set({ tabCreatedAt: entries });
}

export async function recordTabCreatedAt(tabId: number, createdAt: number): Promise<Record<number, number>> {
  const map = await loadTabCreatedAtMap();
  map[tabId] = createdAt;
  await saveTabCreatedAtEntries(map);
  return map;
}

export async function removeTabCreatedAt(tabId: number): Promise<Record<number, number>> {
  const map = await loadTabCreatedAtMap();
  if (tabId in map) {
    delete map[tabId];
    await saveTabCreatedAtEntries(map);
  }
  return map;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadWorkspaceHistory(workspaceId: string): Promise<WorkspaceHistory | null> {
  const data = await chrome.storage.local.get("workspaceHistories");
  const rawMap = (data.workspaceHistories as Record<string, unknown> | undefined) ?? {};
  const raw = rawMap[workspaceId];
  if (!raw) return null;
  return validateWorkspaceHistory(raw);
}

export async function loadAllWorkspaceHistories(): Promise<Record<string, WorkspaceHistory>> {
  const data = await chrome.storage.local.get("workspaceHistories");
  const rawMap = (data.workspaceHistories as Record<string, unknown> | undefined) ?? {};
  const result: Record<string, WorkspaceHistory> = {};
  for (const [id, raw] of Object.entries(rawMap)) {
    const validated = validateWorkspaceHistory(raw);
    if (validated) result[id] = validated;
  }
  return result;
}

export async function saveWorkspaceHistory(history: WorkspaceHistory): Promise<void> {
  const data = await chrome.storage.local.get("workspaceHistories");
  const rawMap = (data.workspaceHistories as Record<string, unknown> | undefined) ?? {};
  rawMap[history.workspaceId] = history;
  await chrome.storage.local.set({ workspaceHistories: rawMap });
}

export async function saveWorkspaceVersion(workspaceId: string, snapshot: WorkspaceSnapshot, note?: string): Promise<WorkspaceHistory> {
  const existing = await loadWorkspaceHistory(workspaceId);
  const updated = appendWorkspaceVersion(existing, snapshot, note);
  await saveWorkspaceHistory(updated);
  return updated;
}

export async function deleteWorkspaceHistory(workspaceId: string): Promise<void> {
  const data = await chrome.storage.local.get("workspaceHistories");
  const rawMap = (data.workspaceHistories as Record<string, unknown> | undefined) ?? {};
  if (rawMap[workspaceId] !== undefined) {
    delete rawMap[workspaceId];
    await chrome.storage.local.set({ workspaceHistories: rawMap });
  }
}

export async function clearAllWorkspaceHistories(): Promise<void> {
  await chrome.storage.local.set({ workspaceHistories: {} });
}
