import { getAccessToken } from "./auth.js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseConfigured } from "./supabase-config.js";
import {
  boardCustomGroupFromSyncRow,
  boardLayoutFromSyncRow,
  groupRuleFromSyncRow,
  ignoredSiteFromSyncRow,
  resolveCloudCollection,
  settingsFromSyncRow,
  type GroupRule,
  type GroupRuleSyncRow,
  type IgnoredSite,
  type IgnoredSiteSyncRow,
  type Settings,
  type SettingsSyncRow,
  type BoardCustomGroup,
  type BoardCustomGroupSyncRow,
  type BoardLayout,
  type BoardLayoutSyncRow,
} from "./shared.js";
import { loadState, saveSettings } from "./storage.js";

async function databaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  assertSupabaseConfigured();
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("登录已过期，请重新登录");
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string; details?: string };
    throw new Error(body.message || body.details || `同步失败 (${response.status})`);
  }
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Supabase 返回了无法解析的同步响应");
  }
}

export async function pushSettings(userId: string, settings: Settings): Promise<void> {
  const concreteSettings = settingsFromSyncRow({
    user_id: userId,
    auto_group_enabled: settings.autoGroupEnabled,
    minimum_tabs: settings.minimumTabs,
    default_group_color: settings.defaultGroupColor,
    cloud_sync_enabled: settings.cloudSyncEnabled,
    sync_rules_enabled: settings.syncRulesEnabled,
    sync_ignore_list_enabled: settings.syncIgnoreListEnabled,
  });
  if (!concreteSettings) throw new Error("设置包含无效数据");
  await databaseRequest<unknown>("/user_settings?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      auto_group_enabled: concreteSettings.autoGroupEnabled,
      minimum_tabs: concreteSettings.minimumTabs,
      default_group_color: concreteSettings.defaultGroupColor,
      cloud_sync_enabled: concreteSettings.cloudSyncEnabled,
      sync_rules_enabled: concreteSettings.syncRulesEnabled,
      sync_ignore_list_enabled: concreteSettings.syncIgnoreListEnabled,
    }),
  });
}

export async function syncSettings(userId: string): Promise<Settings> {
  const rows = await databaseRequest<SettingsSyncRow[]>(
    `/user_settings?user_id=eq.${encodeURIComponent(userId)}&select=user_id,auto_group_enabled,minimum_tabs,default_group_color,cloud_sync_enabled,sync_rules_enabled,sync_ignore_list_enabled&limit=1`,
  );
  if (rows[0]) {
    const remoteSettings = settingsFromSyncRow(rows[0], userId);
    if (!remoteSettings) throw new Error("Supabase 返回了无效的设置数据");
    await saveSettings(remoteSettings);
    return remoteSettings;
  }
  const { settings } = await loadState();
  await pushSettings(userId, settings);
  return settings;
}

export async function fetchGroupRules(userId: string): Promise<GroupRule[]> {
  const rows = await databaseRequest<GroupRuleSyncRow[]>(
    `/group_rules?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,title,color,domains,match_scope,enabled,sort_order&order=sort_order.asc,id.asc`,
  );
  const rules = rows.map((row) => groupRuleFromSyncRow(row, userId));
  if (rules.some((rule) => !rule)) throw new Error("Supabase 返回了无效的分组规则数据");
  return rules as GroupRule[];
}

export async function replaceGroupRules(userId: string, rules: readonly GroupRule[]): Promise<void> {
  const rows = rules.map((rule): GroupRuleSyncRow => ({
    id: rule.id, user_id: userId, title: rule.title, color: rule.color, domains: [...rule.domains], match_scope: rule.matchScope, enabled: rule.enabled, sort_order: rule.sortOrder,
  }));
  if (rows.some((row) => !groupRuleFromSyncRow(row))) throw new Error("分组规则包含无效数据");
  await databaseRequest<unknown>(`/group_rules?user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (rows.length) {
    await databaseRequest<unknown>("/group_rules", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(rows),
    });
  }
}

export async function fetchIgnoredSites(userId: string): Promise<IgnoredSite[]> {
  const rows = await databaseRequest<IgnoredSiteSyncRow[]>(
    `/ignored_sites?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,domain,match_scope,sort_order&order=sort_order.asc,id.asc`,
  );
  const sites = rows.map((row) => ignoredSiteFromSyncRow(row, userId));
  if (sites.some((site) => !site)) throw new Error("Supabase 返回了无效的忽略站点数据");
  return sites as IgnoredSite[];
}

export async function replaceIgnoredSites(userId: string, sites: readonly IgnoredSite[]): Promise<void> {
  const rows = sites.map((site): IgnoredSiteSyncRow => ({
    id: site.id, user_id: userId, domain: site.domain, match_scope: site.matchScope, sort_order: site.sortOrder,
  }));
  if (rows.some((row) => !ignoredSiteFromSyncRow(row))) throw new Error("忽略站点包含无效数据");
  await databaseRequest<unknown>(`/ignored_sites?user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (rows.length) {
    await databaseRequest<unknown>("/ignored_sites", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(rows),
    });
  }
}

export async function fetchBoardCustomGroups(userId: string): Promise<BoardCustomGroup[]> {
  const rows = await databaseRequest<BoardCustomGroupSyncRow[]>(
    `/board_custom_groups?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,title,color,sort_order&order=sort_order.asc,id.asc`,
  );
  const groups = rows.map((row) => boardCustomGroupFromSyncRow(row, userId));
  if (groups.some((group) => !group)) throw new Error("Supabase 返回了无效的看板分组数据");
  return groups as BoardCustomGroup[];
}

export async function replaceBoardCustomGroups(userId: string, groups: readonly BoardCustomGroup[]): Promise<void> {
  const rows = groups.map((group): BoardCustomGroupSyncRow => ({ id: group.id, user_id: userId, title: group.title, color: group.color, sort_order: group.sortOrder }));
  if (rows.some((row) => !boardCustomGroupFromSyncRow(row, userId))) throw new Error("看板分组包含无效数据");
  await databaseRequest<unknown>(`/board_custom_groups?user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (rows.length) await databaseRequest<unknown>("/board_custom_groups", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows) });
}

export async function fetchBoardLayouts(userId: string): Promise<BoardLayout[]> {
  const rows = await databaseRequest<BoardLayoutSyncRow[]>(
    `/board_layouts?user_id=eq.${encodeURIComponent(userId)}&select=user_id,board_key,device_class,rank,auto_fill,manual_lane,manual_order&order=device_class.asc,rank.asc,board_key.asc`,
  );
  const layouts = rows.map((row) => boardLayoutFromSyncRow(row, userId));
  if (layouts.some((layout) => !layout)) throw new Error("Supabase 返回了无效的看板布局数据");
  return layouts as BoardLayout[];
}

export async function replaceBoardLayouts(userId: string, layouts: readonly BoardLayout[]): Promise<void> {
  const rows = layouts.map((layout): BoardLayoutSyncRow => ({ user_id: userId, board_key: layout.boardKey, device_class: layout.deviceClass, rank: layout.rank, auto_fill: layout.autoFill, manual_lane: layout.manualLane ?? null, manual_order: layout.manualOrder ?? null }));
  if (rows.some((row) => !boardLayoutFromSyncRow(row, userId))) throw new Error("看板布局包含无效数据");
  await databaseRequest<unknown>(`/board_layouts?user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (rows.length) await databaseRequest<unknown>("/board_layouts", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows) });
}

export interface BoardSyncData {
  boardCustomGroups?: BoardCustomGroup[];
  boardLayouts?: BoardLayout[];
}

export async function fetchBoardSyncData(userId: string, settings: Settings): Promise<BoardSyncData> {
  if (!isCloudSyncEnabled(userId, settings)) return {};
  const [boardCustomGroups, boardLayouts] = await Promise.all([fetchBoardCustomGroups(userId), fetchBoardLayouts(userId)]);
  return { boardCustomGroups, boardLayouts };
}

export async function replaceBoardSyncData(userId: string, settings: Settings, data: BoardSyncData): Promise<void> {
  if (!isCloudSyncEnabled(userId, settings)) return;
  if (data.boardCustomGroups !== undefined) await replaceBoardCustomGroups(userId, data.boardCustomGroups);
  if (data.boardLayouts !== undefined) await replaceBoardLayouts(userId, data.boardLayouts);
}

export async function restoreBoardSyncData(
  userId: string,
  settings: Settings,
  localData: Required<BoardSyncData>,
): Promise<BoardSyncData> {
  const remoteData = await fetchBoardSyncData(userId, settings);
  const restoredData: BoardSyncData = {};
  const initialData: BoardSyncData = {};

  if (remoteData.boardCustomGroups !== undefined) {
    const resolution = resolveCloudCollection(localData.boardCustomGroups, remoteData.boardCustomGroups);
    restoredData.boardCustomGroups = resolution.local;
    if (resolution.initializeRemote) initialData.boardCustomGroups = resolution.local;
  }
  if (remoteData.boardLayouts !== undefined) {
    const resolution = resolveCloudCollection(localData.boardLayouts, remoteData.boardLayouts);
    restoredData.boardLayouts = resolution.local;
    if (resolution.initializeRemote) initialData.boardLayouts = resolution.local;
  }

  if (initialData.boardCustomGroups !== undefined || initialData.boardLayouts !== undefined) {
    await replaceBoardSyncData(userId, settings, initialData);
  }
  return restoredData;
}

export interface OptionalSyncData {
  groupRules?: GroupRule[];
  ignoredSites?: IgnoredSite[];
}

export async function restoreOptionalSyncData(
  userId: string,
  settings: Settings,
  localData: Required<OptionalSyncData>,
): Promise<OptionalSyncData> {
  const remoteData = await fetchOptionalSyncData(userId, settings);
  const restoredData: OptionalSyncData = {};
  const initialData: OptionalSyncData = {};

  if (remoteData.groupRules !== undefined) {
    const resolution = resolveCloudCollection(localData.groupRules, remoteData.groupRules);
    restoredData.groupRules = resolution.local;
    if (resolution.initializeRemote) initialData.groupRules = resolution.local;
  }
  if (remoteData.ignoredSites !== undefined) {
    const resolution = resolveCloudCollection(localData.ignoredSites, remoteData.ignoredSites);
    restoredData.ignoredSites = resolution.local;
    if (resolution.initializeRemote) initialData.ignoredSites = resolution.local;
  }

  if (initialData.groupRules !== undefined || initialData.ignoredSites !== undefined) {
    await replaceOptionalSyncData(userId, settings, initialData);
  }
  return restoredData;
}

export async function fetchOptionalSyncData(userId: string, settings: Settings): Promise<OptionalSyncData> {
  const concreteSettings = settingsFromSyncRow({
    user_id: userId,
    auto_group_enabled: settings.autoGroupEnabled,
    minimum_tabs: settings.minimumTabs,
    default_group_color: settings.defaultGroupColor,
    cloud_sync_enabled: settings.cloudSyncEnabled,
    sync_rules_enabled: settings.syncRulesEnabled,
    sync_ignore_list_enabled: settings.syncIgnoreListEnabled,
  });
  if (!concreteSettings) throw new Error("设置包含无效数据");
  if (!concreteSettings.cloudSyncEnabled) return {};
  const data: OptionalSyncData = {};
  if (concreteSettings.syncRulesEnabled) data.groupRules = await fetchGroupRules(userId);
  if (concreteSettings.syncIgnoreListEnabled) data.ignoredSites = await fetchIgnoredSites(userId);
  return data;
}

export async function replaceOptionalSyncData(userId: string, settings: Settings, data: OptionalSyncData): Promise<void> {
  const concreteSettings = settingsFromSyncRow({
    user_id: userId,
    auto_group_enabled: settings.autoGroupEnabled,
    minimum_tabs: settings.minimumTabs,
    default_group_color: settings.defaultGroupColor,
    cloud_sync_enabled: settings.cloudSyncEnabled,
    sync_rules_enabled: settings.syncRulesEnabled,
    sync_ignore_list_enabled: settings.syncIgnoreListEnabled,
  });
  if (!concreteSettings) throw new Error("设置包含无效数据");
  if (!concreteSettings.cloudSyncEnabled) return;
  if (concreteSettings.syncRulesEnabled && data.groupRules) await replaceGroupRules(userId, data.groupRules);
  if (concreteSettings.syncIgnoreListEnabled && data.ignoredSites) await replaceIgnoredSites(userId, data.ignoredSites);
}

function isCloudSyncEnabled(userId: string, settings: Settings): boolean {
  const concreteSettings = settingsFromSyncRow({
    user_id: userId,
    auto_group_enabled: settings.autoGroupEnabled,
    minimum_tabs: settings.minimumTabs,
    default_group_color: settings.defaultGroupColor,
    cloud_sync_enabled: settings.cloudSyncEnabled,
    sync_rules_enabled: settings.syncRulesEnabled,
    sync_ignore_list_enabled: settings.syncIgnoreListEnabled,
  });
  if (!concreteSettings) throw new Error("设置包含无效数据");
  return concreteSettings.cloudSyncEnabled === true;
}
