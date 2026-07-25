import {
  DEFAULT_SETTINGS,
  detectBrowserKind,
  resetOptionsForUser,
  type BoardCustomGroup,
  type BoardLayout,
  type VirtualBoardAssignment,
  type GroupRule,
  type IgnoredSite,
  type Settings,
  type StoredState,
  type WorkspaceSnapshot,
  type DeferredTab,
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
  let deviceType = "本";
  if (/Mac/i.test(userAgent)) deviceType = "Mac";
  else if (/Win/i.test(userAgent)) deviceType = "Win";
  else if (/CrOS/i.test(userAgent)) deviceType = "ChromeOS";
  else if (/Linux/i.test(userAgent)) deviceType = "Linux";
  return `${deviceType}设备-${browser}`;
}
