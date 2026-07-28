import { i18n } from "./i18n.js";
import { DEFAULT_SETTINGS, type GroupColor, type Settings, type Theme } from "./shared.js";

interface PopupTab { id?: number; title: string; url?: string; favIconUrl?: string; pinned: boolean }
interface PopupGroup { id: string; title: string; color: GroupColor }
interface PopupState { tabs: PopupTab[]; settings: Settings; customGroups: PopupGroup[] }

const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

const tabsList = $("#tabs-list");
const groupsList = $("#groups-list");
const status = $("#status");
const autoToggle = $<HTMLInputElement>("#auto-toggle");
const minimumTabs = $<HTMLSelectElement>("#minimum-tabs");
const themeToggle = $<HTMLButtonElement>("#theme-toggle");
const groupName = $<HTMLInputElement>("#group-name");
const groupColor = $<HTMLSelectElement>("#group-color");
const bootView = $("#boot-view");
const authView = $("#auth-view");
const appView = $("#app-view");
const authForm = $<HTMLFormElement>("#auth-form");
const authEmail = $<HTMLInputElement>("#auth-email");
const authPassword = $<HTMLInputElement>("#auth-password");
const authConfirm = $<HTMLInputElement>("#auth-confirm");
const rememberDevice = $<HTMLInputElement>("#remember-device");
const authStatus = $("#auth-status");
const authSubmit = $<HTMLButtonElement>("#auth-submit");
let authMode: "login" | "signup" = "login";

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

async function send<T>(message: unknown): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as T & { error?: string };
  if (response?.error) throw new Error(response.error);
  return response;
}

function showStatus(message: string, error = false): void {
  status.textContent = message;
  status.className = error ? "status error" : "status";
  if (message) setTimeout(() => { status.textContent = ""; }, 2400);
}

function setAuthMode(mode: "login" | "signup"): void {
  authMode = mode;
  $("#login-tab").classList.toggle("active", mode === "login");
  $("#signup-tab").classList.toggle("active", mode === "signup");
  $("#confirm-field").classList.toggle("hidden", mode === "login");
  $("#remember-device-row").classList.toggle("hidden", mode === "signup");
  authConfirm.required = mode === "signup";
  authPassword.autocomplete = mode === "login" ? "current-password" : "new-password";
  authSubmit.textContent = mode === "login" ? i18n.t("login") : i18n.t("createAccount");
  authStatus.textContent = "";
}

function showAuth(authenticated: boolean): void {
  bootView.classList.add("hidden");
  bootView.setAttribute("aria-busy", "false");
  authView.classList.toggle("hidden", authenticated);
  appView.classList.toggle("hidden", !authenticated);
}

$("#login-tab").addEventListener("click", () => setAuthMode("login"));
$("#signup-tab").addEventListener("click", () => setAuthMode("signup"));

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authStatus.className = "auth-message";
  if (authMode === "signup" && authPassword.value !== authConfirm.value) {
    authStatus.textContent = i18n.t("passwordMismatch");
    authStatus.classList.add("error");
    return;
  }
  authSubmit.disabled = true;
  try {
    if (authMode === "login") {
      await send({ type: "auth-sign-in", email: authEmail.value, password: authPassword.value, rememberForSevenDays: rememberDevice.checked });
      showAuth(true);
      await load();
    } else {
      const result = await send<{ requiresEmailConfirmation: boolean }>({ type: "auth-sign-up", email: authEmail.value, password: authPassword.value });
      if (result.requiresEmailConfirmation) {
          setAuthMode("login");
          authStatus.textContent = i18n.t("signupSuccess");
          authPassword.value = "";
          authConfirm.value = "";
        } else {
        showAuth(true);
        await load();
      }
    }
  } catch (error) {
    authStatus.textContent = error instanceof Error ? error.message : String(error);
    authStatus.classList.add("error");
  } finally { authSubmit.disabled = false; }
});

$("#logout").addEventListener("click", async () => {
  try {
    await send({ type: "auth-sign-out" });
    authPassword.value = "";
    showAuth(false);
  } catch (error) { showStatus(String(error), true); }
});

function renderTabs(tabs: PopupTab[]): void {
  tabsList.replaceChildren();
  const available = tabs.filter((tab) => tab.id != null && !tab.pinned);
  if (!available.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = i18n.t("noGroupableTabs");
    tabsList.append(empty);
    return;
  }
  for (const tab of available) {
    const label = document.createElement("label");
    label.className = "tab-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = String(tab.id);
    const icon = document.createElement("img");
    icon.alt = "";
    icon.src = tab.favIconUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
    const text = document.createElement("span");
    text.textContent = tab.title;
    text.title = tab.url || tab.title;
    label.append(checkbox, icon, text);
    tabsList.append(label);
  }
}

function renderGroups(groups: PopupGroup[]): void {
  groupsList.replaceChildren();
  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = i18n.t("noCustomGroups");
    groupsList.append(empty);
    return;
  }
  for (const group of groups) {
    const row = document.createElement("div");
    row.className = "group-row";
    const dot = document.createElement("i");
    dot.className = `dot ${group.color}`;
    const title = document.createElement("span");
    title.textContent = group.title;
    const remove = document.createElement("button");
    remove.className = "ghost danger";
    remove.textContent = i18n.t("dissolve");
    remove.addEventListener("click", async () => {
      try {
        await send({ type: "delete-custom-group", id: group.id });
        await load();
        showStatus(i18n.t("customGroupDissolved"));
      } catch (error) { showStatus(String(error), true); }
    });
    row.append(dot, title, remove);
    groupsList.append(row);
  }
}

async function load(): Promise<void> {
  const state = await send<PopupState>({ type: "get-popup-state" });
  autoToggle.checked = state.settings.autoGroupEnabled;
  minimumTabs.value = String(state.settings.minimumTabs);
  themeToggle.setAttribute("aria-pressed", String(state.settings.theme === "dark"));
  applyTheme(state.settings.theme ?? "light");
  renderTabs(state.tabs);
  renderGroups(state.customGroups);
}

async function restoreSessionInBackground(): Promise<void> {
  const result = await send<{ user: { id: string; email?: string } | null; sync: { state: "ready" | "error"; message?: string } }>({ type: "restore-session" });
  if (!result.user) {
    authPassword.value = "";
    showAuth(false);
    return;
  }
  await load();
  if (result.sync.state === "error" && result.sync.message) showStatus(result.sync.message, true);
}

async function saveSettings(): Promise<void> {
  const theme = themeToggle.getAttribute("aria-pressed") === "true" ? "dark" as Theme : "light" as Theme;
  const settings = { ...DEFAULT_SETTINGS, autoGroupEnabled: autoToggle.checked, minimumTabs: Number(minimumTabs.value), theme };
  await send({ type: "update-settings", settings });
  applyTheme(settings.theme);
  showStatus(i18n.t("settingsSaved"));
  await load();
}

autoToggle.addEventListener("change", () => void saveSettings().catch((error) => showStatus(String(error), true)));
minimumTabs.addEventListener("change", () => void saveSettings().catch((error) => showStatus(String(error), true)));
themeToggle.addEventListener("click", () => {
  const isDark = themeToggle.getAttribute("aria-pressed") === "true";
  themeToggle.setAttribute("aria-pressed", String(!isDark));
  saveSettings().catch((error) => showStatus(String(error), true));
});

$("#select-all").addEventListener("click", () => {
  document.querySelectorAll<HTMLInputElement>('#tabs-list input[type="checkbox"]').forEach((input) => { input.checked = true; });
});

$("#create-group").addEventListener("click", async () => {
  const tabIds = Array.from(document.querySelectorAll<HTMLInputElement>('#tabs-list input[type="checkbox"]:checked')).map((input) => Number(input.value));
  try {
    await send({ type: "create-custom-group", tabIds, title: groupName.value, color: groupColor.value });
    groupName.value = "";
    await load();
    showStatus(i18n.t("customGroupCreated"));
  } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
});

$("#open-board").addEventListener("click", async () => {
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active?.windowId == null) throw new Error(i18n.t("cantFindWindow"));
    await send({ type: "open-tab-board", windowId: active.windowId });
    window.close();
  } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
});

void send<{ user: { id: string; email?: string } | null }>({ type: "auth-state" }).then(async ({ user }) => {
  showAuth(Boolean(user));
  if (user) {
    await load();
    void restoreSessionInBackground().catch((error) => showStatus(error instanceof Error ? error.message : String(error), true));
  }
}).catch((error) => {
  showAuth(false);
  authStatus.textContent = error instanceof Error ? error.message : String(error);
  authStatus.classList.add("error");
});
