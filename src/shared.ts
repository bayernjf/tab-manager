export const UNGROUPED = chrome.tabGroups.TAB_GROUP_ID_NONE;

export type GroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";

export interface Settings {
  autoGroupEnabled: boolean;
  minimumTabs: number;
}

export interface AutoGroupRecord {
  groupId: number;
  windowId: number;
  siteKey: string;
}

export interface CustomGroupRecord {
  id: string;
  groupId: number;
  windowId: number;
  title: string;
  color: GroupColor;
}

export interface StoredState {
  settings: Settings;
  autoGroups: Record<string, AutoGroupRecord>;
  customGroups: Record<string, CustomGroupRecord>;
}

export const DEFAULT_SETTINGS: Settings = {
  autoGroupEnabled: true,
  minimumTabs: 2,
};

export function normalizeHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  return normalized.startsWith("www.") ? normalized.slice(4) : normalized;
}

export function getSiteKey(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return normalizeHostname(parsed.hostname) || null;
  } catch {
    return null;
  }
}

export function autoRecordKey(windowId: number, siteKey: string): string {
  return `${windowId}:${siteKey}`;
}

export function siteTitle(siteKey: string): string {
  const firstPart = siteKey.split(".")[0];
  if (!firstPart) return siteKey;
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
}
