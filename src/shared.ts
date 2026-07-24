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
  /** Stable manual grid row. manualOrder is retained only while old local data migrates. */
  manualSlot?: number;
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
  manual_slot: number | null;
  manual_order: number | null;
}

export interface BoardCard {
  boardKey: BoardKey;
  segmentIndex: number;
  heightUnits: 1 | 2;
  /** Logical-group order used when automatic placement chooses rectangles. */
  rank?: number;
  manualLane?: number;
  manualSlot?: number;
  manualOrder?: number;
}

export interface BoardTab {
  id: number;
  windowId?: number;
  windowLabel?: string;
  isCurrentWindow?: boolean;
  title: string;
  url?: string;
  favIconUrl?: string;
}

export interface DuplicateBoardTabGroup {
  url: string;
  retainedTabId: number;
  tabs: BoardTab[];
}

export interface WorkspaceTab {
  title: string;
  url: string;
}

export interface WorkspaceSnapshot {
  id: string;
  title: string;
  createdAt: string;
  tabs: WorkspaceTab[];
}

export interface WorkspaceRestorePreview {
  tabs: WorkspaceTab[];
  unavailableCount: number;
}

export interface DeferredTab {
  id: string;
  title: string;
  url: string;
  favIconUrl?: string;
  dueAt: string;
  createdAt: string;
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
  slot: number;
  /** Dimensions of the logical group's indivisible rectangle. */
  compositeWidth: number;
  compositeHeight: 1 | 2;
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
  openBoardOnNewTab: boolean;
  deferredShortcutMinutes?: number[];
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
  open_board_on_new_tab?: boolean;
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
  openBoardOnNewTab: boolean;
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

export interface VirtualBoardAssignment {
  windowId: number;
  tabId: number;
  boardKey: Exclude<BoardKey, "ungrouped">;
  order: number;
}

export interface VirtualBoardTab extends BoardTab {
  windowId?: number;
}

export interface VirtualBoardGroupInput {
  /** Retained for single-window callers while tabs migrate to carrying their own window. */
  windowId?: number;
  tabs: readonly VirtualBoardTab[];
  settings: Settings;
  rules: readonly GroupRule[];
  ignoredSites: readonly IgnoredSite[];
  customGroups: readonly BoardCustomGroup[];
  assignments: Record<string, VirtualBoardAssignment>;
}

export interface StoredState {
  settings: Settings;
  boardAssignments: Record<string, VirtualBoardAssignment>;
  groupRules: GroupRule[];
  ignoredSites: IgnoredSite[];
  boardCustomGroups: BoardCustomGroup[];
  boardLayouts: BoardLayout[];
}

export const DEFAULT_SETTINGS: Settings = {
  autoGroupEnabled: true,
  minimumTabs: 2,
  openBoardOnNewTab: false,
  deferredShortcutMinutes: [1, 3, 5],
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
  const openBoardOnNewTab = value.open_board_on_new_tab === undefined ? DEFAULT_SETTINGS.openBoardOnNewTab : value.open_board_on_new_tab;
  if (!isGroupColor(defaultGroupColor) || typeof cloudSyncEnabled !== "boolean" || typeof syncRulesEnabled !== "boolean" || typeof syncIgnoreListEnabled !== "boolean" || typeof openBoardOnNewTab !== "boolean") return null;
  return {
    autoGroupEnabled: value.auto_group_enabled,
    minimumTabs: value.minimum_tabs,
    openBoardOnNewTab,
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

export function boardWindowLabel(windowIndex: number): string | null {
  return Number.isInteger(windowIndex) && windowIndex > 0 ? `窗口 ${windowIndex}` : null;
}

export function boardTabMatchesQuery(tab: BoardTab, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [tab.title, tab.url ?? "", getSiteKey(tab.url) ?? ""].some((value) => value.toLocaleLowerCase().includes(needle));
}

export function findDuplicateBoardTabs(tabs: readonly BoardTab[]): DuplicateBoardTabGroup[] {
  const byUrl = new Map<string, BoardTab[]>();
  for (const tab of tabs) {
    if (!tab.url) continue;
    try {
      const url = new URL(tab.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      const group = byUrl.get(url.href) ?? [];
      group.push(tab);
      byUrl.set(url.href, group);
    } catch {
      // Ignore malformed runtime URLs.
    }
  }
  return [...byUrl.entries()].flatMap(([url, group]) => {
    const retained = group[0];
    return retained && group.length > 1 ? [{ url, retainedTabId: retained.id, tabs: [...group] }] : [];
  });
}

function workspaceTab(value: unknown): WorkspaceTab | null {
  if (!isPlainObject(value) || typeof value.title !== "string" || !value.title.trim() || value.title.length > 160 || typeof value.url !== "string" || value.url.length > 4_000) return null;
  try {
    const url = new URL(value.url);
    return url.protocol === "http:" || url.protocol === "https:" ? { title: value.title.trim(), url: url.href } : null;
  } catch {
    return null;
  }
}

export type WorkspaceTitleValidation =
  | { status: "valid"; title: string }
  | { status: "empty" | "duplicate" | "invalid" };

export function validateWorkspaceTitle(value: unknown, existingTitles: readonly string[]): WorkspaceTitleValidation {
  if (typeof value !== "string") return { status: "invalid" };
  const title = value.trim();
  if (!title) return { status: "empty" };
  if (title.length > 80) return { status: "invalid" };
  const key = title.toLowerCase();
  return existingTitles.some((existingTitle) => typeof existingTitle === "string" && existingTitle.trim().toLowerCase() === key)
    ? { status: "duplicate" }
    : { status: "valid", title };
}

export function validateWorkspaceSnapshot(value: unknown): WorkspaceSnapshot | null {
  if (!isPlainObject(value) || !isRecordId(value.id) || typeof value.title !== "string" || value.title.length > 80 || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) || !Array.isArray(value.tabs) || value.tabs.length < 1 || value.tabs.length > 200) return null;
  const title = validateWorkspaceTitle(value.title, []);
  if (title.status !== "valid") return null;
  const tabs = value.tabs.map(workspaceTab);
  return tabs.every((tab): tab is WorkspaceTab => tab !== null) ? { id: value.id, title: title.title, createdAt: value.createdAt, tabs } : null;
}

export function workspaceRestorePreview(snapshot: WorkspaceSnapshot): WorkspaceRestorePreview {
  const tabs = snapshot.tabs.flatMap((tab) => workspaceTab(tab) ?? []);
  return { tabs, unavailableCount: snapshot.tabs.length - tabs.length };
}

export function validateDeferredTab(value: unknown): DeferredTab | null {
  if (!isPlainObject(value) || !isRecordId(value.id) || typeof value.dueAt !== "string" || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.dueAt)) || !Number.isFinite(Date.parse(value.createdAt))) return null;
  const tab = workspaceTab(value);
  if (!tab) return null;
  const favIconUrl = typeof value.favIconUrl === "string" && value.favIconUrl.length <= 4_000 ? value.favIconUrl : undefined;
  return { id: value.id, title: tab.title, url: tab.url, ...(favIconUrl ? { favIconUrl } : {}), dueAt: value.dueAt, createdAt: value.createdAt };
}

export function isDeferredTabDue(tab: DeferredTab, now = Date.now()): boolean {
  return Date.parse(tab.dueAt) <= now;
}

export function formatDeferredDateTime(value: string): string {
  const date = new Date(value);
  const pad = (part: number): string => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function normalizeDeferredShortcutMinutes(value: unknown): number[] | null {
  if (value === undefined) return [1, 3, 5];
  if (!Array.isArray(value) || value.length < 1 || value.length > 5 || value.some((item) => typeof item !== "number" || !Number.isInteger(item) || item < 1 || item > 10_080)) return null;
  const unique = [...new Set(value)];
  return unique.length ? unique : null;
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

export function virtualBoardAssignmentKey(windowId: number, tabId: number): string {
  return `${windowId}:${tabId}`;
}

export function moveVirtualBoardAssignment(
  assignments: Record<string, VirtualBoardAssignment>,
  windowId: number,
  tabId: number,
  boardKey: BoardKey,
  order = 0,
): Record<string, VirtualBoardAssignment> {
  const key = virtualBoardAssignmentKey(windowId, tabId);
  const next = { ...assignments };
  if (boardKey === "ungrouped") {
    delete next[key];
    return next;
  }
  return { ...next, [key]: { windowId, tabId, boardKey, order } };
}

export function buildVirtualBoardGroups(input: VirtualBoardGroupInput): BoardLogicalGroup[] {
  const customByKey = new Map(input.customGroups.flatMap((group) => {
    const key = customBoardKey(group.id);
    return key ? [[key, group] as const] : [];
  }));
  const assignmentFor = (tab: VirtualBoardTab): VirtualBoardAssignment | undefined => {
    const windowId = tab.windowId ?? input.windowId;
    return windowId === undefined ? undefined : input.assignments[virtualBoardAssignmentKey(windowId, tab.id)];
  };
  const naturalBySite = new Map<string, VirtualBoardTab[]>();
  for (const tab of input.tabs) {
    if (assignmentFor(tab)) continue;
    const siteKey = getSiteKey(tab.url);
    if (!siteKey || resolveAutoGroup(siteKey, input.settings, input.rules, input.ignoredSites).kind === "ignore") continue;
    const siteTabs = naturalBySite.get(siteKey) ?? [];
    siteTabs.push(tab);
    naturalBySite.set(siteKey, siteTabs);
  }
  const tabsByKey = new Map<BoardKey, Array<{ tab: VirtualBoardTab; order: number }>>();
  const put = (key: BoardKey, tab: VirtualBoardTab, order: number): void => {
    const tabs = tabsByKey.get(key) ?? [];
    tabs.push({ tab, order });
    tabsByKey.set(key, tabs);
  };
  for (const tab of input.tabs) {
    const assignment = assignmentFor(tab);
    if (assignment) {
      if (assignment.boardKey.startsWith("custom:") && !customByKey.has(assignment.boardKey)) continue;
      if (assignment.boardKey.startsWith("auto:")) {
        const siteKey = assignment.boardKey.slice("auto:".length);
        if (!input.settings.autoGroupEnabled || resolveAutoGroup(siteKey, input.settings, input.rules, input.ignoredSites).kind === "ignore") continue;
      }
      put(assignment.boardKey, tab, assignment.order);
      continue;
    }
    const siteKey = getSiteKey(tab.url);
    const natural = siteKey ? naturalBySite.get(siteKey) : undefined;
    const key = siteKey && natural && input.settings.autoGroupEnabled && natural.length >= input.settings.minimumTabs ? automaticBoardKey(siteKey) : null;
    if (key) put(key, tab, tab.id);
  }
  const tabsFor = (key: BoardKey): BoardTab[] => (tabsByKey.get(key) ?? [])
    .sort((left, right) => left.order - right.order || left.tab.id - right.tab.id).map(({ tab }) => tab);
  const groups: BoardLogicalGroup[] = [{ boardKey: "ungrouped", kind: "ungrouped", title: "未分组", color: "grey", rank: 0, tabs: [] }];
  for (const custom of [...input.customGroups].sort((left, right) => left.sortOrder - right.sortOrder)) {
    const key = customBoardKey(custom.id);
    if (key) groups.push({ boardKey: key, kind: "custom", title: custom.title, color: custom.color, rank: custom.sortOrder + 1, tabs: tabsFor(key) });
  }
  const automaticKeys = [...tabsByKey.keys()].filter((key): key is `auto:${string}` => key.startsWith("auto:")).sort();
  for (const [index, key] of automaticKeys.entries()) {
    const siteKey = key.slice("auto:".length);
    const decision = resolveAutoGroup(siteKey, input.settings, input.rules, input.ignoredSites);
    groups.push({ boardKey: key, kind: "automatic", title: decision.kind === "group" ? decision.title : siteKey, color: decision.kind === "group" ? decision.color : input.settings.defaultGroupColor ?? "blue", rank: input.customGroups.length + index + 1, tabs: tabsFor(key) });
  }
  const groupedIds = new Set(groups.flatMap((group) => group.tabs.map((tab) => tab.id)));
  const ungrouped = groups[0];
  if (ungrouped) ungrouped.tabs = input.tabs.filter((tab) => !groupedIds.has(tab.id));
  return groups;
}

export function boardDropIndex(sourceIndex: number, targetIndex: number, position: "before" | "after"): number | null {
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || !Number.isInteger(targetIndex) || targetIndex < 0) return null;
  const insertionIndex = position === "before" ? targetIndex : targetIndex + 1;
  return sourceIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
}

export function placeBoardCards(cards: readonly BoardCard[], laneCount: number, autoFill: boolean): BoardPlacementResult {
  if (!Number.isInteger(laneCount) || laneCount < 1) return { placements: [], laneHeights: [] };
  const grouped = new Map<BoardKey, { cards: BoardCard[]; index: number; rank: number }>();
  cards.forEach((card, index) => {
    const current = grouped.get(card.boardKey);
    if (current) current.cards.push(card);
    else grouped.set(card.boardKey, { cards: [card], index, rank: isSortOrder(card.rank) ? card.rank : index });
  });
  const composites = [...grouped.values()]
    .map((group) => ({
      ...group,
      cards: [...group.cards].sort((left, right) => left.segmentIndex - right.segmentIndex),
      width: group.cards.length,
      height: group.cards.reduce<1 | 2>((height, card) => Math.max(height, card.heightUnits) as 1 | 2, 1),
    }))
    .sort((left, right) => autoFill ? left.rank - right.rank || left.index - right.index : left.index - right.index);
  const columns = Math.max(laneCount, ...composites.map((composite) => composite.width));
  const occupied = new Set<string>();
  const placements: BoardPlacement[] = [];

  const fits = (lane: number, slot: number, width: number, height: number): boolean => {
    if (lane < 0 || lane + width > columns || slot < 0) return false;
    for (let column = lane; column < lane + width; column += 1) for (let row = slot; row < slot + height; row += 1) {
      if (occupied.has(`${column}:${row}`)) return false;
    }
    return true;
  };
  const firstFit = (width: number, height: number, fromSlot = 0): { lane: number; slot: number } => {
    for (let slot = fromSlot; ; slot += 1) for (let lane = 0; lane <= columns - width; lane += 1) {
      if (fits(lane, slot, width, height)) return { lane, slot };
    }
  };
  for (const composite of composites) {
    const first = composite.cards[0];
    if (!first) continue;
    const requestedLane = validManualLane(first.manualLane, columns) ? first.manualLane : 0;
    const requestedSlot = first.manualSlot ?? first.manualOrder;
    const position = !autoFill && isSortOrder(requestedSlot) && fits(requestedLane, requestedSlot, composite.width, composite.height)
      ? { lane: requestedLane, slot: requestedSlot }
      : firstFit(composite.width, composite.height, !autoFill && isSortOrder(requestedSlot) ? requestedSlot : 0);
    for (let column = position.lane; column < position.lane + composite.width; column += 1) for (let row = position.slot; row < position.slot + composite.height; row += 1) occupied.add(`${column}:${row}`);
    composite.cards.forEach((card, offset) => placements.push({
      boardKey: card.boardKey,
      segmentIndex: card.segmentIndex,
      heightUnits: card.heightUnits,
      lane: position.lane + offset,
      order: position.slot,
      slot: position.slot,
      compositeWidth: composite.width,
      compositeHeight: composite.height,
    }));
  }
  const laneHeights = Array.from({ length: columns }, (_value, lane) => placements.reduce((height, placement) => placement.lane === lane ? Math.max(height, placement.slot + placement.compositeHeight) : height, 0));
  return { placements, laneHeights };
}

export function boardCardsForDevice<T extends BoardCard>(cards: readonly T[], layouts: readonly BoardLayout[], deviceClass: DeviceClass): T[] {
  return cards.map((card) => {
    const layout = layouts.find((item) => item.boardKey === card.boardKey && item.deviceClass === deviceClass);
    const baseSlot = layout?.manualSlot ?? layout?.manualOrder;
    return {
      ...card,
      ...(layout?.manualLane === undefined ? {} : { manualLane: layout.manualLane }),
      ...(baseSlot === undefined ? {} : { manualSlot: baseSlot }),
      ...(layout?.manualOrder === undefined ? {} : { manualOrder: layout.manualOrder }),
    };
  });
}

export function manualBoardGridRow(placement: Pick<BoardPlacement, "slot" | "heightUnits">): { start: number; span: 1 | 2 } {
  return { start: placement.slot + 1, span: placement.heightUnits };
}

export function moveManualBoardCard(placements: readonly BoardPlacement[], boardKey: BoardKey, targetBoardKey: BoardKey, laneCount?: number): BoardPlacement[] | null {
  const visibleLaneCount = laneCount ?? Math.max(1, ...placements.map((placement) => placement.lane + 1));
  if (!Number.isInteger(visibleLaneCount) || visibleLaneCount < 1) return null;
  const source = placements.find((placement) => placement.boardKey === boardKey && placement.segmentIndex === 0);
  const target = placements.find((placement) => placement.boardKey === targetBoardKey && placement.segmentIndex === 0);
  if (!source || !target || source === target) return null;

  const sourceSegments = placements
    .filter((placement) => placement.boardKey === boardKey)
    .sort((left, right) => left.segmentIndex - right.segmentIndex);
  const sourceWidth = sourceSegments.length;
  const sourceHeight = source.compositeHeight ?? source.heightUnits;
  // A composite wider than the visible board remains horizontally scrollable;
  // its only durable origin is zero. Otherwise keep its whole width on-board.
  const sourceStart = Math.min(Math.max(0, target.lane), Math.max(0, visibleLaneCount - sourceWidth));
  const sourceEnd = sourceStart + sourceWidth;
  return placements.map((placement) => {
    const offset = sourceSegments.indexOf(placement);
    if (offset >= 0) return { ...placement, lane: sourceStart + offset, order: target.slot, slot: target.slot };
    const placementEnd = placement.lane + (placement.compositeWidth ?? 1);
    const overlapsMovedColumns = placement.lane < sourceEnd && placementEnd > sourceStart;
    return overlapsMovedColumns && placement.slot >= target.slot
      ? { ...placement, order: placement.slot + sourceHeight, slot: placement.slot + sourceHeight }
      : placement;
  });
}

export function validateBoardLayout(value: unknown): BoardLayout | null {
  if (!isPlainObject(value) || !isBoardKey(value.boardKey) || !isDeviceClass(value.deviceClass) || !isSortOrder(value.rank) || typeof value.autoFill !== "boolean") return null;
  const hasManualLane = value.manualLane !== undefined;
  const hasManualSlot = value.manualSlot !== undefined;
  const hasManualOrder = value.manualOrder !== undefined;
  if (value.autoFill) {
    return hasManualLane || hasManualSlot || hasManualOrder ? null : { boardKey: value.boardKey, deviceClass: value.deviceClass, rank: value.rank, autoFill: true };
  }
  const manualSlot = hasManualSlot ? value.manualSlot : value.manualOrder;
  if (!hasManualLane || !isSortOrder(value.manualLane) || !isSortOrder(manualSlot)) return null;
  return {
    boardKey: value.boardKey,
    deviceClass: value.deviceClass,
    rank: value.rank,
    autoFill: false,
    manualLane: value.manualLane,
    manualSlot,
  };
}

export function boardCustomGroupFromSyncRow(value: unknown, expectedUserId?: string): BoardCustomGroup | null {
  if (!isPlainObject(value) || typeof value.user_id !== "string" || (expectedUserId !== undefined && value.user_id !== expectedUserId) || !isUuid(value.id) || typeof value.title !== "string" || !value.title.trim() || value.title.length > 40 || !isGroupColor(value.color) || !isSortOrder(value.sort_order)) return null;
  return { id: value.id, title: value.title.trim(), color: value.color, sortOrder: value.sort_order };
}

export function boardLayoutFromSyncRow(value: unknown, expectedUserId?: string): BoardLayout | null {
  if (!isPlainObject(value) || typeof value.user_id !== "string" || (expectedUserId !== undefined && value.user_id !== expectedUserId) || !isBoardKey(value.board_key) || !isDeviceClass(value.device_class) || !isSortOrder(value.rank) || typeof value.auto_fill !== "boolean") return null;
  const manualLane = value.manual_lane === null ? undefined : value.manual_lane;
  const manualSlot = value.manual_slot === null || value.manual_slot === undefined ? value.manual_order : value.manual_slot;
  return validateBoardLayout({ boardKey: value.board_key, deviceClass: value.device_class, rank: value.rank, autoFill: value.auto_fill, ...(manualLane === undefined ? {} : { manualLane }), ...(manualSlot === null || manualSlot === undefined ? {} : { manualSlot }) });
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
      openBoardOnNewTab: settings.openBoardOnNewTab ?? DEFAULT_SETTINGS.openBoardOnNewTab,
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
  const allowedKeys = ["autoGroupEnabled", "minimumTabs", "openBoardOnNewTab", "deferredShortcutMinutes", "defaultGroupColor", "cloudSyncEnabled", "syncRulesEnabled", "syncIgnoreListEnabled", "lastSuccessfulSyncAt"];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) return null;
  const parsed = parsePortableSettings({
    autoGroupEnabled: value.autoGroupEnabled,
    minimumTabs: value.minimumTabs,
    openBoardOnNewTab: value.openBoardOnNewTab,
    defaultGroupColor: value.defaultGroupColor,
    cloudSyncEnabled: value.cloudSyncEnabled,
    syncRulesEnabled: value.syncRulesEnabled,
    syncIgnoreListEnabled: value.syncIgnoreListEnabled,
    lastSuccessfulSyncAt: null,
  });
  const deferredShortcutMinutes = normalizeDeferredShortcutMinutes(value.deferredShortcutMinutes);
  return parsed && deferredShortcutMinutes ? { ...parsed, deferredShortcutMinutes, lastSuccessfulSyncAt: null } : null;
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
  const requiredKeys = ["autoGroupEnabled", "minimumTabs", "defaultGroupColor", "cloudSyncEnabled", "syncRulesEnabled", "syncIgnoreListEnabled", "lastSuccessfulSyncAt"];
  const currentKeys = [...requiredKeys, "openBoardOnNewTab"];
  if (!isPlainObject(value) || (!hasOnlyKeys(value, requiredKeys) && !hasOnlyKeys(value, currentKeys))) return null;
  const openBoardOnNewTab = value.openBoardOnNewTab === undefined ? DEFAULT_SETTINGS.openBoardOnNewTab : value.openBoardOnNewTab;
  if (typeof value.autoGroupEnabled !== "boolean" || !isMinimumTabs(value.minimumTabs) || !isGroupColor(value.defaultGroupColor) || typeof value.cloudSyncEnabled !== "boolean" || typeof value.syncRulesEnabled !== "boolean" || typeof value.syncIgnoreListEnabled !== "boolean" || typeof openBoardOnNewTab !== "boolean" || !isSyncTimestamp(value.lastSuccessfulSyncAt)) return null;
  return { autoGroupEnabled: value.autoGroupEnabled, minimumTabs: value.minimumTabs, openBoardOnNewTab, defaultGroupColor: value.defaultGroupColor, cloudSyncEnabled: value.cloudSyncEnabled, syncRulesEnabled: value.syncRulesEnabled, syncIgnoreListEnabled: value.syncIgnoreListEnabled, lastSuccessfulSyncAt: value.lastSuccessfulSyncAt };
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

export function isBrowserNewTabUrl(value: string | undefined): boolean {
  return value === "chrome://newtab/" || value === "edge://newtab/";
}

export function siteTitle(siteKey: string): string {
  const firstPart = siteKey.split(".")[0];
  if (!firstPart) return siteKey;
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
}
