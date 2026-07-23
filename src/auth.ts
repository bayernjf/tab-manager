import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseConfigured } from "./supabase-config.js";

export interface AuthUser { id: string; email?: string }
interface AuthSession { access_token: string; refresh_token: string; expires_at: number; rememberUntil?: number; user: AuthUser }

interface AuthRequestError extends Error { status: number }

const SESSION_KEY = "supabaseSession";
const REMEMBER_DEVICE_DURATION_SECONDS = 7 * 24 * 60 * 60;

function endpoint(path: string): string {
  assertSupabaseConfigured();
  return `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1${path}`;
}

async function request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const response = await fetch(endpoint(path), {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken ?? SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({})) as T & { msg?: string; message?: string; error_description?: string };
  if (!response.ok) {
    const error = new Error(body.msg || body.message || body.error_description || `认证请求失败 (${response.status})`) as AuthRequestError;
    error.status = response.status;
    throw error;
  }
  return body;
}

export function isExplicitAuthenticationFailure(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error
    && (error.status === 400 || error.status === 401 || error.status === 403);
}

function toSession(data: { access_token: string; refresh_token: string; expires_in: number; user: AuthUser }, rememberUntil?: number): AuthSession {
  return { ...data, expires_at: Math.floor(Date.now() / 1000) + data.expires_in, ...(rememberUntil === undefined ? {} : { rememberUntil }) };
}

export function isRememberedSessionValid(rememberUntil: number | undefined, now = Math.floor(Date.now() / 1000)): boolean {
  return rememberUntil === undefined || rememberUntil > now;
}

async function saveSession(session: AuthSession | null): Promise<void> {
  if (session) await chrome.storage.local.set({ [SESSION_KEY]: session });
  else await chrome.storage.local.remove(SESSION_KEY);
}

async function storedSession(): Promise<AuthSession | null> {
  const data = await chrome.storage.local.get(SESSION_KEY);
  return (data[SESSION_KEY] as AuthSession | undefined) ?? null;
}

/** Returns the locally cached account without making an authentication request. */
export async function getStoredUser(): Promise<AuthUser | null> {
  return (await storedSession())?.user ?? null;
}

export async function signUp(email: string, password: string): Promise<{ user: AuthUser | null; requiresEmailConfirmation: boolean }> {
  const data = await request<{ access_token?: string; refresh_token?: string; expires_in?: number; user: AuthUser | null }>("/signup", {
    method: "POST", body: JSON.stringify({ email, password }),
  });
  if (data.access_token && data.refresh_token && data.expires_in && data.user) {
    await saveSession(toSession({ ...data, access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in, user: data.user }));
  }
  return { user: data.user, requiresEmailConfirmation: !data.access_token };
}

export async function signIn(email: string, password: string, rememberForSevenDays = false): Promise<AuthUser> {
  const data = await request<{ access_token: string; refresh_token: string; expires_in: number; user: AuthUser }>("/token?grant_type=password", {
    method: "POST", body: JSON.stringify({ email, password }),
  });
  const rememberUntil = rememberForSevenDays ? Math.floor(Date.now() / 1000) + REMEMBER_DEVICE_DURATION_SECONDS : undefined;
  await saveSession(toSession(data, rememberUntil));
  return data.user;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getValidSession();
  if (!session) return null;
  try {
    return await request<AuthUser>("/user", { method: "GET" }, session.access_token);
  } catch (error) {
    if (isExplicitAuthenticationFailure(error)) {
      await saveSession(null);
      return null;
    }
    return session.user;
  }
}

async function getValidSession(): Promise<AuthSession | null> {
  let session = await storedSession();
  if (!session) return null;
  if (!isRememberedSessionValid(session.rememberUntil)) {
    await saveSession(null);
    return null;
  }
  if (session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
    try {
      const data = await request<{ access_token: string; refresh_token: string; expires_in: number; user: AuthUser }>("/token?grant_type=refresh_token", {
        method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      session = toSession(data, session.rememberUntil);
      await saveSession(session);
    } catch (error) {
      if (isExplicitAuthenticationFailure(error)) {
        await saveSession(null);
        return null;
      }
      return session;
    }
  }
  return session;
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getValidSession();
  return session && session.expires_at > Math.floor(Date.now() / 1000) ? session.access_token : null;
}

export async function signOut(): Promise<void> {
  const session = await storedSession();
  try {
    if (session) await request("/logout", { method: "POST" }, session.access_token);
  } finally {
    await saveSession(null);
  }
}
