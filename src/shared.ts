export const UNGROUPED = chrome.tabGroups.TAB_GROUP_ID_NONE;

export type GroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";
export type MatchScope = "exact" | "domain-and-subdomains";

const GROUP_COLORS: readonly GroupColor[] = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
const MATCH_SCOPES: readonly MatchScope[] = ["exact", "domain-and-subdomains"];
const MAX_PORTABLE_RECORDS = 100;

export interface Settings {
  autoGroupEnabled: boolean;
  minimumTabs: number;
  defaultGroupColor?: GroupColor;
  cloudSyncEnabled?: boolean;
  syncRulesEnabled?: boolean;
  syncIgnoreListEnabled?: boolean;
  lastSuccessfulSyncAt?: string | null;
}

export interface GroupRule {
  id: string;
  title: string;
  color: GroupColor;
  domains: string[];
  matchScope: MatchScope;
  enabled: boolean;
  sortOrder: number;
}

export interface IgnoredSite {
  id: string;
  domain: string;
  matchScope: MatchScope;
  sortOrder: number;
}

export interface SettingsSyncRow {
  user_id: string;
  auto_group_enabled: boolean;
  minimum_tabs: number;
  default_group_color?: GroupColor;
  cloud_sync_enabled?: boolean;
  sync_rules_enabled?: boolean;
  sync_ignore_list_enabled?: boolean;
}

export interface GroupRuleSyncRow {
  id: string;
  user_id: string;
  title: string;
  color: GroupColor;
  domains: string[];
  match_scope: MatchScope;
  enabled: boolean;
  sort_order: number;
}

export interface IgnoredSiteSyncRow {
  id: string;
  user_id: string;
  domain: string;
  match_scope: MatchScope;
  sort_order: number;
}

interface PortableSettings {
  autoGroupEnabled: boolean;
  minimumTabs: number;
  defaultGroupColor: GroupColor;
  cloudSyncEnabled: boolean;
  syncRulesEnabled: boolean;
  syncIgnoreListEnabled: boolean;
  lastSuccessfulSyncAt: string | null;
}

export interface PortableData {
  version: 1;
  settings: PortableSettings;
  groupRules: GroupRule[];
  ignoredSites: IgnoredSite[];
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
  groupRules: GroupRule[];
  ignoredSites: IgnoredSite[];
}

export const DEFAULT_SETTINGS: Settings = {
  autoGroupEnabled: true,
  minimumTabs: 2,
  defaultGroupColor: "blue",
  cloudSyncEnabled: true,
  syncRulesEnabled: true,
  syncIgnoreListEnabled: true,
  lastSuccessfulSyncAt: null,
};

export function settingsFromSyncRow(value: unknown, expectedUserId?: string): Settings | null {
  if (!isPlainObject(value) || typeof value.user_id !== "string" || (expectedUserId !== undefined && value.user_id !== expectedUserId) || !isMinimumTabs(value.minimum_tabs) || typeof value.auto_group_enabled !== "boolean") return null;
  const defaultGroupColor = value.default_group_color === undefined ? DEFAULT_SETTINGS.defaultGroupColor : value.default_group_color;
  const cloudSyncEnabled = value.cloud_sync_enabled === undefined ? DEFAULT_SETTINGS.cloudSyncEnabled : value.cloud_sync_enabled;
  const syncRulesEnabled = value.sync_rules_enabled === undefined ? DEFAULT_SETTINGS.syncRulesEnabled : value.sync_rules_enabled;
  const syncIgnoreListEnabled = value.sync_ignore_list_enabled === undefined ? DEFAULT_SETTINGS.syncIgnoreListEnabled : value.sync_ignore_list_enabled;
  if (!isGroupColor(defaultGroupColor) || typeof cloudSyncEnabled !== "boolean" || typeof syncRulesEnabled !== "boolean" || typeof syncIgnoreListEnabled !== "boolean") return null;
  return {
    autoGroupEnabled: value.auto_group_enabled,
    minimumTabs: value.minimum_tabs,
    defaultGroupColor,
    cloudSyncEnabled,
    syncRulesEnabled,
    syncIgnoreListEnabled,
  };
}

export function groupRuleFromSyncRow(value: unknown, expectedUserId?: string): GroupRule | null {
  if (!isPlainObject(value) || typeof value.user_id !== "string" || (expectedUserId !== undefined && value.user_id !== expectedUserId) || !isRecordId(value.id) || typeof value.title !== "string" || !value.title.trim() || value.title.length > 40 || !isGroupColor(value.color) || !Array.isArray(value.domains) || value.domains.length === 0 || value.domains.length > 50 || !isMatchScope(value.match_scope) || typeof value.enabled !== "boolean" || !isSortOrder(value.sort_order)) return null;
  const domains = value.domains.map((domain) => typeof domain === "string" ? normalizeDomainInput(domain) : null);
  if (domains.some((domain) => !domain) || new Set(domains).size !== domains.length) return null;
  return { id: value.id, title: value.title.trim(), color: value.color, domains: domains as string[], matchScope: value.match_scope, enabled: value.enabled, sortOrder: value.sort_order };
}

export function ignoredSiteFromSyncRow(value: unknown, expectedUserId?: string): IgnoredSite | null {
  if (!isPlainObject(value) || typeof value.user_id !== "string" || (expectedUserId !== undefined && value.user_id !== expectedUserId) || !isRecordId(value.id) || typeof value.domain !== "string" || !isMatchScope(value.match_scope) || !isSortOrder(value.sort_order)) return null;
  const domain = normalizeDomainInput(value.domain);
  return domain ? { id: value.id, domain, matchScope: value.match_scope, sortOrder: value.sort_order } : null;
}

export function normalizeHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  return normalized.startsWith("www.") ? normalized.slice(4) : normalized;
}

export function normalizeDomainInput(value: string): string | null {
  const input = value.trim();
  if (!input) return null;

  let hostname = input;
  if (input.includes("://")) {
    try {
      const parsed = new URL(input);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      hostname = parsed.hostname;
    } catch {
      return null;
    }
  }

  const normalized = normalizeHostname(hostname);
  if (!isValidDomain(normalized)) return null;
  return normalized;
}

export function matchesDomain(hostname: string, domain: string, matchScope: MatchScope): boolean {
  const normalizedHostname = normalizeDomainInput(hostname);
  const normalizedDomain = normalizeDomainInput(domain);
  if (!normalizedHostname || !normalizedDomain) return false;
  return matchScope === "exact"
    ? normalizedHostname === normalizedDomain
    : normalizedHostname === normalizedDomain || normalizedHostname.endsWith(`.${normalizedDomain}`);
}

export function findMatchingRule(hostname: string, rules: readonly GroupRule[]): GroupRule | undefined {
  return rules
    .filter((rule) => rule.enabled && rule.domains.some((domain) => matchesDomain(hostname, domain, rule.matchScope)))
    .sort((left, right) => {
      const scopeOrder = Number(left.matchScope !== "exact") - Number(right.matchScope !== "exact");
      return scopeOrder || left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
    })[0];
}

export function isIgnoredSite(hostname: string, ignoredSites: readonly IgnoredSite[]): boolean {
  return ignoredSites.some((site) => matchesDomain(hostname, site.domain, site.matchScope));
}

export function toPortableData(settings: Settings, groupRules: readonly GroupRule[], ignoredSites: readonly IgnoredSite[]): PortableData {
  return {
    version: 1,
    settings: {
      autoGroupEnabled: settings.autoGroupEnabled,
      minimumTabs: settings.minimumTabs,
      defaultGroupColor: settings.defaultGroupColor ?? DEFAULT_SETTINGS.defaultGroupColor!,
      cloudSyncEnabled: settings.cloudSyncEnabled ?? DEFAULT_SETTINGS.cloudSyncEnabled!,
      syncRulesEnabled: settings.syncRulesEnabled ?? DEFAULT_SETTINGS.syncRulesEnabled!,
      syncIgnoreListEnabled: settings.syncIgnoreListEnabled ?? DEFAULT_SETTINGS.syncIgnoreListEnabled!,
      lastSuccessfulSyncAt: settings.lastSuccessfulSyncAt ?? null,
    },
    groupRules: groupRules.map((rule) => ({
      id: rule.id,
      title: rule.title,
      color: rule.color,
      domains: [...rule.domains],
      matchScope: rule.matchScope,
      enabled: rule.enabled,
      sortOrder: rule.sortOrder,
    })),
    ignoredSites: ignoredSites.map((site) => ({
      id: site.id,
      domain: site.domain,
      matchScope: site.matchScope,
      sortOrder: site.sortOrder,
    })),
  };
}

export function toPortableDataFromState(state: StoredState): PortableData {
  return toPortableData(state.settings, state.groupRules, state.ignoredSites);
}

export function parsePortableData(value: unknown): PortableData | null {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ["version", "settings", "groupRules", "ignoredSites"]) || value.version !== 1) return null;
  const settings = parsePortableSettings(value.settings);
  const groupRules = parseGroupRules(value.groupRules);
  const ignoredSites = parseIgnoredSites(value.ignoredSites);
  if (!settings || !groupRules || !ignoredSites) return null;
  return { version: 1, settings, groupRules, ignoredSites };
}

function isValidDomain(domain: string): boolean {
  return domain.length <= 253 && domain.includes(".") && domain.split(".").every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$|^[a-z0-9]$/.test(label),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isGroupColor(value: unknown): value is GroupColor {
  return typeof value === "string" && GROUP_COLORS.includes(value as GroupColor);
}

function isMatchScope(value: unknown): value is MatchScope {
  return typeof value === "string" && MATCH_SCOPES.includes(value as MatchScope);
}

function isRecordId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128;
}

function isSortOrder(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parsePortableSettings(value: unknown): PortableSettings | null {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ["autoGroupEnabled", "minimumTabs", "defaultGroupColor", "cloudSyncEnabled", "syncRulesEnabled", "syncIgnoreListEnabled", "lastSuccessfulSyncAt"])) return null;
  if (typeof value.autoGroupEnabled !== "boolean" || !isMinimumTabs(value.minimumTabs) || !isGroupColor(value.defaultGroupColor) || typeof value.cloudSyncEnabled !== "boolean" || typeof value.syncRulesEnabled !== "boolean" || typeof value.syncIgnoreListEnabled !== "boolean" || !isSyncTimestamp(value.lastSuccessfulSyncAt)) return null;
  return { autoGroupEnabled: value.autoGroupEnabled, minimumTabs: value.minimumTabs, defaultGroupColor: value.defaultGroupColor, cloudSyncEnabled: value.cloudSyncEnabled, syncRulesEnabled: value.syncRulesEnabled, syncIgnoreListEnabled: value.syncIgnoreListEnabled, lastSuccessfulSyncAt: value.lastSuccessfulSyncAt };
}

function parseGroupRules(value: unknown): GroupRule[] | null {
  if (!Array.isArray(value) || value.length > MAX_PORTABLE_RECORDS) return null;
  const rules: GroupRule[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!isPlainObject(item) || !hasOnlyKeys(item, ["id", "title", "color", "domains", "matchScope", "enabled", "sortOrder"]) || !isRecordId(item.id) || ids.has(item.id) || typeof item.title !== "string" || !item.title.trim() || item.title.length > 100 || !isGroupColor(item.color) || !Array.isArray(item.domains) || item.domains.length === 0 || item.domains.length > 50 || !isMatchScope(item.matchScope) || typeof item.enabled !== "boolean" || !isSortOrder(item.sortOrder)) return null;
    const domains = item.domains.map((domain) => typeof domain === "string" ? normalizeDomainInput(domain) : null);
    if (domains.some((domain) => !domain) || new Set(domains).size !== domains.length) return null;
    ids.add(item.id);
    rules.push({ id: item.id, title: item.title.trim(), color: item.color, domains: domains as string[], matchScope: item.matchScope, enabled: item.enabled, sortOrder: item.sortOrder });
  }
  return rules;
}

function parseIgnoredSites(value: unknown): IgnoredSite[] | null {
  if (!Array.isArray(value) || value.length > MAX_PORTABLE_RECORDS) return null;
  const sites: IgnoredSite[] = [];
  const ids = new Set<string>();
  const domains = new Set<string>();
  for (const item of value) {
    if (!isPlainObject(item) || !hasOnlyKeys(item, ["id", "domain", "matchScope", "sortOrder"]) || !isRecordId(item.id) || ids.has(item.id) || typeof item.domain !== "string" || !isMatchScope(item.matchScope) || !isSortOrder(item.sortOrder)) return null;
    const domain = normalizeDomainInput(item.domain);
    if (!domain || domains.has(`${item.matchScope}:${domain}`)) return null;
    ids.add(item.id);
    domains.add(`${item.matchScope}:${domain}`);
    sites.push({ id: item.id, domain, matchScope: item.matchScope, sortOrder: item.sortOrder });
  }
  return sites;
}

function isMinimumTabs(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 2 && value <= 100;
}

function isSyncTimestamp(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));
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
