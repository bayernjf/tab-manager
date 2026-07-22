export const UNGROUPED = chrome.tabGroups.TAB_GROUP_ID_NONE;

export type GroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";
export type MatchScope = "exact" | "domain-and-subdomains";
export type DeviceClass = "desktop" | "tablet" | "mobile";
export type BoardKey = "ungrouped" | `auto:${string}` | `custom:${string}`;
export type BoardGroupKind = "automatic" | "custom" | "ungrouped";

export interface BoardGroup {
  boardKey: BoardKey;
  kind: BoardGroupKind;
  title: string;
  color: GroupColor;
  rank: number;
}

export interface BoardLayout {
  boardKey: BoardKey;
  deviceClass: DeviceClass;
  rank: number;
  autoFill: boolean;
  manualLane?: number;
  manualOrder?: number;
}

export interface BoardCustomGroup {
  id: string;
  title: string;
  color: GroupColor;
  sortOrder: number;
}

export interface BoardCustomGroupSyncRow {
  id: string;
  user_id: string;
  title: string;
  color: GroupColor;
  sort_order: number;
}

export interface BoardLayoutSyncRow {
  user_id: string;
  board_key: BoardKey;
  device_class: DeviceClass;
  rank: number;
  auto_fill: boolean;
  manual_lane: number | null;
  manual_order: number | null;
}

export interface BoardCard {
  boardKey: BoardKey;
  segmentIndex: number;
  heightUnits: 1 | 2;
  manualLane?: number;
  manualOrder?: number;
}

export interface BoardTab {
  id: number;
  title: string;
  url?: string;
  favIconUrl?: string;
}

export interface BoardLogicalGroup extends BoardGroup {
  tabs: readonly BoardTab[];
}

export interface BoardSegmentCard extends BoardLogicalGroup {
  tabs: BoardTab[];
  segmentIndex: number;
  segmentCount: number;
  heightUnits: 1 | 2;
}

export interface BoardTabDrop {
  tabId: number;
  targetBoardKey: BoardKey;
  position: "before" | "after" | "append";
  targetTabId?: number;
}

export interface BoardPlacement {
  boardKey: BoardKey;
  segmentIndex: number;
  heightUnits: 1 | 2;
  lane: number;
  order: number;
}

export interface BoardPlacementResult {
  placements: BoardPlacement[];
  laneHeights: number[];
}

const GROUP_COLORS: readonly GroupColor[] = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
const MATCH_SCOPES: readonly MatchScope[] = ["exact", "domain-and-subdomains"];
const DEVICE_CLASSES: readonly DeviceClass[] = ["desktop", "tablet", "mobile"];
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

export type AutoGroupDecision =
  | { kind: "ignore" }
  | { kind: "group"; title: string; color: GroupColor; siteKey: string };

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

export interface PortableImportPreview {
  data: PortableData;
  groupRuleCount: number;
  ignoredSiteCount: number;
}

export interface CloudCollectionResolution<T> {
  local: T[];
  initializeRemote: boolean;
}

export interface SyncFailureStatus {
  state: "error";
  message: string;
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
  boardCustomGroups: BoardCustomGroup[];
  boardLayouts: BoardLayout[];
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

export function automaticBoardKey(siteKey: string): BoardKey | null {
  const normalizedSiteKey = normalizeDomainInput(siteKey);
  return normalizedSiteKey ? `auto:${normalizedSiteKey}` : null;
}

export function customBoardKey(id: string): BoardKey | null {
  return isUuid(id) ? `custom:${id}` : null;
}

export function isBoardKey(value: unknown): value is BoardKey {
  if (value === "ungrouped") return true;
  if (typeof value !== "string") return false;
  if (value.startsWith("auto:")) return automaticBoardKey(value.slice("auto:".length)) === value;
  if (value.startsWith("custom:")) return customBoardKey(value.slice("custom:".length)) === value;
  return false;
}

export function heightUnitsForTabCount(tabCount: number): 1 | 2 {
  return tabCount <= 5 ? 1 : 2;
}

export function segmentTabs<T>(tabs: readonly T[]): T[][] {
  const segments: T[][] = [];
  for (let index = 0; index < tabs.length; index += 10) {
    segments.push(tabs.slice(index, index + 10));
  }
  return segments;
}

export function buildBoardCards(groups: readonly BoardLogicalGroup[]): BoardSegmentCard[] {
  const cards: BoardSegmentCard[] = [];
  for (const group of groups) {
    const segments = segmentTabs(group.tabs);
    const cardTabs = segments.length ? segments : group.kind === "custom" || group.kind === "ungrouped" ? [[]] : [];
    for (const [segmentIndex, tabs] of cardTabs.entries()) {
      cards.push({
        ...group,
        tabs,
        segmentIndex,
        segmentCount: cardTabs.length,
        heightUnits: heightUnitsForTabCount(tabs.length),
      });
    }
  }
  return cards;
}

export function moveBoardGroupRank(groups: readonly BoardGroup[], boardKey: BoardKey, rank: number): BoardGroup[] | null {
  if (boardKey === "ungrouped" || !isSortOrder(rank)) return null;
  const movable = groups.filter((group) => group.boardKey !== "ungrouped").sort((left, right) => left.rank - right.rank);
  const currentIndex = movable.findIndex((group) => group.boardKey === boardKey);
  if (currentIndex < 0 || rank < 1 || rank > movable.length) return null;
  const [moved] = movable.splice(currentIndex, 1);
  if (!moved) return null;
  movable.splice(rank - 1, 0, moved);
  const ranks = new Map(movable.map((group, index) => [group.boardKey, index + 1]));
  const ungrouped = groups.filter((group) => group.boardKey === "ungrouped").map((group) => ({ ...group, rank: 0 }));
  return [...ungrouped, ...movable.map((group) => ({ ...group, rank: ranks.get(group.boardKey) ?? group.rank }))];
}

export function validateBoardTabDrop(value: unknown): BoardTabDrop | null {
  if (!isPlainObject(value) || typeof value.tabId !== "number" || !Number.isInteger(value.tabId) || value.tabId <= 0 || !isBoardKey(value.targetBoardKey)) return null;
  if (value.position !== "before" && value.position !== "after" && value.position !== "append") return null;
  if (value.position === "append") return value.targetTabId === undefined ? { tabId: value.tabId, targetBoardKey: value.targetBoardKey, position: value.position } : null;
  if (typeof value.targetTabId !== "number" || !Number.isInteger(value.targetTabId) || value.targetTabId <= 0 || value.targetTabId === value.tabId) return null;
  return { tabId: value.tabId, targetBoardKey: value.targetBoardKey, position: value.position, targetTabId: value.targetTabId };
}

export function boardDropIndex(sourceIndex: number, targetIndex: number, position: "before" | "after"): number | null {
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || !Number.isInteger(targetIndex) || targetIndex < 0) return null;
  const insertionIndex = position === "before" ? targetIndex : targetIndex + 1;
  return sourceIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
}

export function isManagedBoardTabSource(groupId: number, automaticGroupIds: ReadonlySet<number>, customGroupIds: ReadonlySet<number>): boolean {
  return groupId === UNGROUPED || automaticGroupIds.has(groupId) || customGroupIds.has(groupId);
}

export function placeBoardCards(cards: readonly BoardCard[], laneCount: number, autoFill: boolean): BoardPlacementResult {
  if (!Number.isInteger(laneCount) || laneCount < 1) return { placements: [], laneHeights: [] };
  const laneHeights = Array<number>(laneCount).fill(0);
  const laneOrders = Array<number>(laneCount).fill(0);
  const placements: BoardPlacement[] = [];

  for (const card of cards) {
    const manualLane = card.manualLane;
    const lane = autoFill ? shortestLane(laneHeights) : validManualLane(manualLane, laneCount) ? manualLane : 0;
    const nextOrder = laneOrders[lane] ?? 0;
    const order = autoFill ? nextOrder : isSortOrder(card.manualOrder) ? card.manualOrder : nextOrder;
    placements.push({ boardKey: card.boardKey, segmentIndex: card.segmentIndex, heightUnits: card.heightUnits, lane, order });
    laneHeights[lane] = (laneHeights[lane] ?? 0) + card.heightUnits;
    laneOrders[lane] = Math.max(nextOrder, order + 1);
  }

  return { placements, laneHeights };
}

export function validateBoardLayout(value: unknown): BoardLayout | null {
  if (!isPlainObject(value) || !isBoardKey(value.boardKey) || !isDeviceClass(value.deviceClass) || !isSortOrder(value.rank) || typeof value.autoFill !== "boolean") return null;
  const hasManualLane = value.manualLane !== undefined;
  const hasManualOrder = value.manualOrder !== undefined;
  if (value.autoFill) {
    return hasManualLane || hasManualOrder ? null : { boardKey: value.boardKey, deviceClass: value.deviceClass, rank: value.rank, autoFill: true };
  }
  if (!hasManualLane || !hasManualOrder || !isSortOrder(value.manualLane) || !isSortOrder(value.manualOrder)) return null;
  return {
    boardKey: value.boardKey,
    deviceClass: value.deviceClass,
    rank: value.rank,
    autoFill: false,
    manualLane: value.manualLane,
    manualOrder: value.manualOrder,
  };
}

export function boardCustomGroupFromSyncRow(value: unknown, expectedUserId?: string): BoardCustomGroup | null {
  if (!isPlainObject(value) || typeof value.user_id !== "string" || (expectedUserId !== undefined && value.user_id !== expectedUserId) || !isUuid(value.id) || typeof value.title !== "string" || !value.title.trim() || value.title.length > 40 || !isGroupColor(value.color) || !isSortOrder(value.sort_order)) return null;
  return { id: value.id, title: value.title.trim(), color: value.color, sortOrder: value.sort_order };
}

export function boardLayoutFromSyncRow(value: unknown, expectedUserId?: string): BoardLayout | null {
  if (!isPlainObject(value) || typeof value.user_id !== "string" || (expectedUserId !== undefined && value.user_id !== expectedUserId) || !isBoardKey(value.board_key) || !isDeviceClass(value.device_class) || !isSortOrder(value.rank) || typeof value.auto_fill !== "boolean") return null;
  const manualLane = value.manual_lane === null ? undefined : value.manual_lane;
  const manualOrder = value.manual_order === null ? undefined : value.manual_order;
  return validateBoardLayout({ boardKey: value.board_key, deviceClass: value.device_class, rank: value.rank, autoFill: value.auto_fill, ...(manualLane === undefined ? {} : { manualLane }), ...(manualOrder === undefined ? {} : { manualOrder }) });
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

export function resolveAutoGroup(
  siteKey: string,
  settings: Settings,
  rules: readonly GroupRule[],
  ignoredSites: readonly IgnoredSite[],
): AutoGroupDecision {
  if (isIgnoredSite(siteKey, ignoredSites)) return { kind: "ignore" };
  const rule = findMatchingRule(siteKey, rules);
  if (rule) return { kind: "group", title: rule.title, color: rule.color, siteKey };
  return {
    kind: "group",
    title: siteTitle(siteKey),
    color: settings.defaultGroupColor ?? DEFAULT_SETTINGS.defaultGroupColor!,
    siteKey,
  };
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

export function previewPortableImport(value: unknown): PortableImportPreview | null {
  let parsedValue = value;
  if (typeof value === "string") {
    if (value.length > 1_000_000) return null;
    try {
      parsedValue = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  const data = parsePortableData(parsedValue);
  if (!data) return null;
  return { data, groupRuleCount: data.groupRules.length, ignoredSiteCount: data.ignoredSites.length };
}

export function applyPortableImport(state: StoredState, preview: PortableImportPreview, confirmed: boolean): StoredState {
  if (!confirmed) return state;
  return {
    ...state,
    settings: { ...preview.data.settings, lastSuccessfulSyncAt: null },
    groupRules: preview.data.groupRules.map((rule) => ({ ...rule, domains: [...rule.domains] })),
    ignoredSites: preview.data.ignoredSites.map((site) => ({ ...site })),
  };
}

export function resetOptionsForUser(state: StoredState, storedUserId: string | undefined, userId: string): { state: StoredState; changed: boolean } {
  if (storedUserId === userId) return { state, changed: false };
  return {
    state: {
      ...state,
      settings: { ...DEFAULT_SETTINGS },
      groupRules: [],
      ignoredSites: [],
      boardCustomGroups: [],
      boardLayouts: [],
    },
    changed: true,
  };
}

export function canConfirmOptionsImport(previewUserId: string | null, currentUserId: string | null): boolean {
  return previewUserId !== null && previewUserId === currentUserId;
}

export function validateOptionsSettings(value: unknown): Settings | null {
  if (!isPlainObject(value)) return null;
  const allowedKeys = ["autoGroupEnabled", "minimumTabs", "defaultGroupColor", "cloudSyncEnabled", "syncRulesEnabled", "syncIgnoreListEnabled", "lastSuccessfulSyncAt"];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) return null;
  const parsed = parsePortableSettings({
    autoGroupEnabled: value.autoGroupEnabled,
    minimumTabs: value.minimumTabs,
    defaultGroupColor: value.defaultGroupColor,
    cloudSyncEnabled: value.cloudSyncEnabled,
    syncRulesEnabled: value.syncRulesEnabled,
    syncIgnoreListEnabled: value.syncIgnoreListEnabled,
    lastSuccessfulSyncAt: null,
  });
  return parsed ? { ...parsed, lastSuccessfulSyncAt: null } : null;
}

export function createGroupRuleFromInput(value: unknown, id: string, sortOrder: number): GroupRule | null {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ["title", "color", "domains", "matchScope", "enabled"])) return null;
  return parseGroupRules([{ ...value, id, sortOrder }])?.[0] ?? null;
}

export function validateGroupRule(value: unknown): GroupRule | null {
  return parseGroupRules([value])?.[0] ?? null;
}

export function updateGroupRuleFromInput(value: unknown, existing: GroupRule): GroupRule | null {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ["id", "title", "color", "domains", "matchScope", "enabled"]) || value.id !== existing.id) return null;
  return parseGroupRules([{ ...value, sortOrder: existing.sortOrder }])?.[0] ?? null;
}

export function resolveCloudCollection<T>(local: readonly T[], remote: readonly T[]): CloudCollectionResolution<T> {
  if (remote.length > 0) return { local: [...remote], initializeRemote: false };
  return { local: [...local], initializeRemote: local.length > 0 };
}

export function syncFailureStatus(_error: unknown): SyncFailureStatus {
  return { state: "error", message: "云端同步暂时不可用，请稍后重试。" };
}

export function createIgnoredSiteFromInput(value: unknown, id: string, sortOrder: number): IgnoredSite | null {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ["domain", "matchScope"])) return null;
  return parseIgnoredSites([{ ...value, id, sortOrder }])?.[0] ?? null;
}

export function validateIgnoredSite(value: unknown): IgnoredSite | null {
  return parseIgnoredSites([value])?.[0] ?? null;
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

function isDeviceClass(value: unknown): value is DeviceClass {
  return typeof value === "string" && DEVICE_CLASSES.includes(value as DeviceClass);
}

function validManualLane(value: unknown, laneCount: number): value is number {
  return isSortOrder(value) && value < laneCount;
}

function shortestLane(laneHeights: readonly number[]): number {
  let shortestLaneIndex = 0;
  for (let index = 1; index < laneHeights.length; index += 1) {
    const currentHeight = laneHeights[index];
    const shortestHeight = laneHeights[shortestLaneIndex];
    if (currentHeight !== undefined && shortestHeight !== undefined && currentHeight < shortestHeight) shortestLaneIndex = index;
  }
  return shortestLaneIndex;
}

function isRecordId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
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
