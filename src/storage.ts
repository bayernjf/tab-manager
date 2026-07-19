import {
  DEFAULT_SETTINGS,
  type AutoGroupRecord,
  type CustomGroupRecord,
  type Settings,
} from "./shared.js";

const KEYS = ["settings", "autoGroups", "customGroups"] as const;

export async function loadState(): Promise<{
  settings: Settings;
  autoGroups: Record<string, AutoGroupRecord>;
  customGroups: Record<string, CustomGroupRecord>;
}> {
  const data = await chrome.storage.local.get(KEYS);
  return {
    settings: { ...DEFAULT_SETTINGS, ...(data.settings as Partial<Settings> | undefined) },
    autoGroups: (data.autoGroups as Record<string, AutoGroupRecord> | undefined) ?? {},
    customGroups: (data.customGroups as Record<string, CustomGroupRecord> | undefined) ?? {},
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
