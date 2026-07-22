import {
  DEFAULT_SETTINGS,
  resetOptionsForUser,
  type AutoGroupRecord,
  type BoardCustomGroup,
  type BoardLayout,
  type CustomGroupRecord,
  type GroupRule,
  type IgnoredSite,
  type Settings,
  type StoredState,
} from "./shared.js";

const KEYS = ["settings", "autoGroups", "customGroups", "groupRules", "ignoredSites", "boardCustomGroups", "boardLayouts", "optionsUserId"] as const;

export async function loadState(): Promise<StoredState> {
  const data = await chrome.storage.local.get(KEYS);
  return {
    settings: { ...DEFAULT_SETTINGS, ...(data.settings as Partial<Settings> | undefined) },
    autoGroups: (data.autoGroups as Record<string, AutoGroupRecord> | undefined) ?? {},
    customGroups: (data.customGroups as Record<string, CustomGroupRecord> | undefined) ?? {},
    groupRules: (data.groupRules as GroupRule[] | undefined) ?? [],
    ignoredSites: (data.ignoredSites as IgnoredSite[] | undefined) ?? [],
    boardCustomGroups: (data.boardCustomGroups as BoardCustomGroup[] | undefined) ?? [],
    boardLayouts: (data.boardLayouts as BoardLayout[] | undefined) ?? [],
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

export async function saveAutoGroups(autoGroups: Record<string, AutoGroupRecord>): Promise<void> {
  await chrome.storage.local.set({ autoGroups });
}

export async function saveCustomGroups(customGroups: Record<string, CustomGroupRecord>): Promise<void> {
  await chrome.storage.local.set({ customGroups });
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
