import { getAccessToken } from "./auth.js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseConfigured } from "./supabase-config.js";
import { type Settings } from "./shared.js";
import { loadState, saveSettings } from "./storage.js";

interface SettingsRow {
  user_id: string;
  auto_group_enabled: boolean;
  minimum_tabs: number;
}

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

function toSettings(row: SettingsRow): Settings {
  return { autoGroupEnabled: row.auto_group_enabled, minimumTabs: row.minimum_tabs };
}

export async function pushSettings(userId: string, settings: Settings): Promise<void> {
  await databaseRequest<unknown>("/user_settings?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      auto_group_enabled: settings.autoGroupEnabled,
      minimum_tabs: settings.minimumTabs,
    }),
  });
}

export async function syncSettings(userId: string): Promise<Settings> {
  const rows = await databaseRequest<SettingsRow[]>(
    `/user_settings?user_id=eq.${encodeURIComponent(userId)}&select=user_id,auto_group_enabled,minimum_tabs&limit=1`,
  );
  if (rows[0]) {
    const remoteSettings = toSettings(rows[0]);
    await saveSettings(remoteSettings);
    return remoteSettings;
  }
  const { settings } = await loadState();
  await pushSettings(userId, settings);
  return settings;
}
