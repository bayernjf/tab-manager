import { i18n } from "./i18n.js";
import { formatShortcutKeys, isMacPlatform, SHORTCUT_COMMANDS } from "./shared.js";
import type { GroupColor, GroupRule, IgnoredSite, Language, MatchScope, PortableData, Settings, Theme } from "./shared.js";

type OptionsState = { user: { id: string; email?: string } | null; settings: Settings; rules: GroupRule[]; ignoredSites: IgnoredSite[]; status: { authenticated: boolean; cloudSyncEnabled: boolean; syncRulesEnabled: boolean; syncIgnoreListEnabled: boolean; lastSuccessfulSyncAt: string | null; sync: { state: "ready" | "error" | "syncing"; message?: string } } };
type ImportPreview = { groupRuleCount: number; ignoredSiteCount: number };
const colors: readonly GroupColor[] = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
const colorLabels: Record<GroupColor, string> = { grey: i18n.t("grey"), blue: i18n.t("blue"), red: i18n.t("red"), yellow: i18n.t("yellow"), green: i18n.t("green"), pink: i18n.t("pink"), purple: i18n.t("purple"), cyan: i18n.t("cyan"), orange: i18n.t("orange") };
const MAX_DEFERRED_SHORTCUTS = 5;
const $ = <T extends Element>(selector: string): T => { const item = document.querySelector<T>(selector); if (!item) throw new Error(`Missing element: ${selector}`); return item; };
const accountCard = $<HTMLElement>("#account-card"), loginRequired = $<HTMLElement>("#login-required"), loginInstruction = $<HTMLElement>("#login-instruction"), openLogin = $<HTMLButtonElement>("#open-login"), accountEmail = $("#account-email"), accountState = $("#account-state"), defaultColor = $<HTMLSelectElement>("#default-color"), themeSelect = $<HTMLSelectElement>("#theme-select"), languageSelect = $<HTMLSelectElement>("#language-select"), cloudSync = $<HTMLInputElement>("#cloud-sync"), rulesSync = $<HTMLInputElement>("#rules-sync"), ignoreSync = $<HTMLInputElement>("#ignore-sync"), newTabBoard = $<HTMLInputElement>("#new-tab-board"), deferredShortcuts = $("#deferred-shortcuts"), deferredShortcutCount = $<HTMLElement>("#deferred-shortcut-count"), addDeferredShortcut = $<HTMLButtonElement>("#add-deferred-shortcut"), shortcutList = $<HTMLUListElement>("#shortcut-list"), openShortcutSettings = $<HTMLButtonElement>("#open-shortcut-settings"), ruleForm = $<HTMLFormElement>("#rule-form"), ruleId = $<HTMLInputElement>("#rule-id"), ruleTitle = $<HTMLInputElement>("#rule-title"), ruleDomains = $<HTMLInputElement>("#rule-domains"), ruleScope = $<HTMLSelectElement>("#rule-scope"), ruleColor = $<HTMLSelectElement>("#rule-color"), ruleEnabled = $<HTMLInputElement>("#rule-enabled"), rulesList = $("#rules-list"), ignoredForm = $<HTMLFormElement>("#ignored-form"), ignoredDomain = $<HTMLInputElement>("#ignored-domain"), ignoredScope = $<HTMLSelectElement>("#ignored-scope"), ignoredList = $("#ignored-list"), importFile = $<HTMLInputElement>("#import-file"), importPreview = $("#import-preview"), confirmImport = $<HTMLButtonElement>("#confirm-import"), cancelImport = $<HTMLButtonElement>("#cancel-import");
let state: OptionsState | null = null;
let importReady = false;
async function send<T>(message: unknown): Promise<T> { const result = await chrome.runtime.sendMessage(message) as T & { error?: string }; if (result.error) throw new Error(result.error); return result; }
function applyTheme(theme: Theme): void { document.documentElement.setAttribute("data-theme", theme); }
function showStatus(message: string, error = false): void {
  const toast = document.createElement("div");
  toast.className = error ? "option-toast error" : "option-toast";
  toast.textContent = message;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  document.body.append(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 240); }, 2000);
}
function populateColors(select: HTMLSelectElement): void { select.replaceChildren(); for (const color of colors) { const option = document.createElement("option"); option.value = color; option.textContent = colorLabels[color]; select.append(option); } }
function formatScope(scope: MatchScope): string { return scope === "exact" ? i18n.t("exact") : i18n.t("domainAndSubdomains"); }
function emptyList(message: string): HTMLParagraphElement { const item = document.createElement("p"); item.className = "empty"; item.textContent = message; return item; }
function renderRules(rules: GroupRule[]): void { rulesList.replaceChildren(); if (!rules.length) { rulesList.append(emptyList(i18n.t("noRules"))); return; } for (const rule of rules) { const row = document.createElement("article"); row.className = "list-item"; const detail = document.createElement("div"); const title = document.createElement("strong"); title.textContent = rule.title; const info = document.createElement("p"); info.className = "muted"; info.textContent = `${rule.domains.join("、")} · ${formatScope(rule.matchScope)} · ${colorLabels[rule.color]}${rule.enabled ? "" : ` · ${i18n.t("disabled")}`}`; detail.append(title, info); const actions = document.createElement("div"); actions.className = "list-actions"; const edit = document.createElement("button"); edit.type = "button"; edit.textContent = i18n.t("edit"); edit.addEventListener("click", () => editRule(rule)); const remove = document.createElement("button"); remove.type = "button"; remove.className = "secondary"; remove.textContent = i18n.t("delete"); remove.addEventListener("click", () => void removeRule(rule.id)); actions.append(edit, remove); row.append(detail, actions); rulesList.append(row); } }
function renderIgnored(sites: IgnoredSite[]): void { ignoredList.replaceChildren(); if (!sites.length) { ignoredList.append(emptyList(i18n.t("noIgnoredSites"))); return; } for (const site of sites) { const row = document.createElement("article"); row.className = "list-item"; const detail = document.createElement("div"); const domain = document.createElement("strong"); domain.textContent = site.domain; const info = document.createElement("p"); info.className = "muted"; info.textContent = formatScope(site.matchScope); detail.append(domain, info); const remove = document.createElement("button"); remove.type = "button"; remove.className = "secondary"; remove.textContent = i18n.t("delete"); remove.addEventListener("click", () => void removeIgnored(site.id)); row.append(detail, remove); ignoredList.append(row); } }
function setAuthenticatedUi(authenticated: boolean): void { accountCard.hidden = !authenticated; loginRequired.hidden = authenticated; document.querySelectorAll<HTMLButtonElement>(".nav-link").forEach((button) => { const available = authenticated || button.dataset.panel === "account"; button.disabled = !available; button.setAttribute("aria-disabled", String(!available)); }); if (!authenticated) { document.querySelectorAll<HTMLElement>(".panel").forEach((panel) => { panel.hidden = panel.id !== "account"; }); document.querySelectorAll<HTMLButtonElement>(".nav-link").forEach((button) => { const active = button.dataset.panel === "account"; button.classList.toggle("active", active); button.setAttribute("aria-current", active ? "page" : "false"); }); } }
function updateShortcutEditorState(): void { const rows = deferredShortcuts.querySelectorAll<HTMLDivElement>(".deferred-shortcut"); const count = rows.length; deferredShortcutCount.textContent = `${count} / ${MAX_DEFERRED_SHORTCUTS}`; addDeferredShortcut.hidden = count >= MAX_DEFERRED_SHORTCUTS; rows.forEach((row, index) => { const input = row.querySelector<HTMLInputElement>(".deferred-shortcut-input"); const remove = row.querySelector<HTMLButtonElement>(".deferred-shortcut-remove"); if (!input || !remove) return; input.ariaLabel = i18n.t("shortcutTimes") + ` ${index + 1}`; remove.ariaLabel = i18n.t("delete") + ` ${index + 1}`; remove.disabled = count <= 1; }); }
function createShortcutInput(time: string): HTMLDivElement { const row = document.createElement("div"); row.className = "deferred-shortcut"; const input = document.createElement("input"); input.type = "time"; input.className = "deferred-shortcut-input"; input.value = time; input.ariaLabel = i18n.t("shortcutTimes"); const remove = document.createElement("button"); remove.type = "button"; remove.className = "deferred-shortcut-remove"; remove.textContent = "×"; remove.ariaLabel = i18n.t("delete"); remove.addEventListener("click", () => { const rows = Array.from(deferredShortcuts.querySelectorAll<HTMLDivElement>(".deferred-shortcut")); const index = rows.indexOf(row); const focusTarget = rows[index + 1]?.querySelector<HTMLInputElement>(".deferred-shortcut-input") ?? rows[index - 1]?.querySelector<HTMLInputElement>(".deferred-shortcut-input") ?? addDeferredShortcut; row.remove(); updateShortcutEditorState(); focusTarget?.focus(); }); row.append(input, remove); return row; }
function renderShortcutInputs(times: readonly string[]): void { deferredShortcuts.replaceChildren(...times.map(createShortcutInput)); updateShortcutEditorState(); }
function renderShortcutKeysWithValues(commands: readonly { name?: string; shortcut?: string }[], platform: "mac" | "other"): void {
  const platformLabel = i18n.t(platform === "mac" ? "shortcutPlatformMac" : "shortcutPlatformOther");
  const commandMap = new Map<string, string>();
  for (const c of commands) { if (c.name) commandMap.set(c.name, c.shortcut ?? ""); }
  const items = SHORTCUT_COMMANDS.map((entry) => {
    const item = document.createElement("li");
    item.className = "shortcut-keys-item";
    const label = document.createElement("span");
    label.className = "shortcut-keys-label";
    label.textContent = i18n.t(entry.descriptionKey);
    const key = document.createElement("kbd");
    key.className = "shortcut-keys-key";
    const actual = commandMap.get(entry.command);
    key.textContent = actual ? formatShortcutKeys(actual, platform) : i18n.t("shortcutNotSet");
    if (!actual) key.classList.add("shortcut-keys-not-set");
    item.setAttribute("aria-label", `${label.textContent}：${key.textContent}`);
    const platformHint = document.createElement("span");
    platformHint.className = "shortcut-keys-platform";
    platformHint.textContent = platformLabel;
    item.append(label, key, platformHint);
    return item;
  });
  shortcutList.replaceChildren(...items);
}
async function renderShortcutKeys(): Promise<void> {
  const platform: "mac" | "other" = isMacPlatform(navigator.platform) ? "mac" : "other";
  try {
    const commands = await chrome.commands.getAll();
    renderShortcutKeysWithValues(commands, platform);
  } catch {
    renderShortcutKeysWithValues([], platform);
  }
}
function render(next: OptionsState): void { state = next; applyTheme(next.settings.theme ?? "light"); const authenticated = next.status.authenticated; setAuthenticatedUi(authenticated); accountEmail.textContent = next.user?.email ?? i18n.t("notLoggedIn"); accountState.textContent = authenticated ? `${i18n.t("cloudSync")}${next.status.cloudSyncEnabled ? i18n.t("cloudSyncEnabled") : i18n.t("cloudSyncDisabled")}${next.status.lastSuccessfulSyncAt ? `，${i18n.t("lastSync", [new Date(next.status.lastSuccessfulSyncAt).toLocaleString(i18n.detectLanguage().startsWith("zh") ? "zh-CN" : "en-US")])}` : ""}${next.status.sync.state === "syncing" ? `，${i18n.t("syncing")}` : ""}${next.status.sync.state === "error" ? `，${next.status.sync.message}` : ""}` : i18n.t("pleaseLoginHint"); void renderShortcutKeys(); if (!authenticated) return; defaultColor.value = next.settings.defaultGroupColor ?? "blue"; themeSelect.value = next.settings.theme ?? "light"; languageSelect.value = next.settings.language ?? ""; cloudSync.checked = next.settings.cloudSyncEnabled ?? true; rulesSync.checked = next.settings.syncRulesEnabled ?? true; ignoreSync.checked = next.settings.syncIgnoreListEnabled ?? true; newTabBoard.checked = next.settings.openBoardOnNewTab ?? false; renderShortcutInputs(next.settings.deferredShortcutTimes ?? ["09:00", "14:00", "18:00"]); renderRules(next.rules); renderIgnored(next.ignoredSites); }
async function load(): Promise<void> { render(await send<OptionsState>({ type: "get-options-state" })); }
async function syncBackground(): Promise<void> { try { render(await send<OptionsState>({ type: "sync-options" })); } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); } }
function settingsPayload(): Settings { if (!state) throw new Error(i18n.t("settingsNotLoaded")); return { ...state.settings, defaultGroupColor: defaultColor.value as GroupColor, theme: themeSelect.value as Theme, language: languageSelect.value ? languageSelect.value as Language : undefined, deferredShortcutTimes: Array.from(deferredShortcuts.querySelectorAll<HTMLInputElement>("input")).map((input) => input.value), cloudSyncEnabled: cloudSync.checked, syncRulesEnabled: rulesSync.checked, syncIgnoreListEnabled: ignoreSync.checked, openBoardOnNewTab: newTabBoard.checked, lastSuccessfulSyncAt: null }; }
function resetRuleForm(): void { ruleForm.reset(); ruleId.value = ""; ruleEnabled.checked = true; $("#rule-submit").textContent = i18n.t("addRule"); $<HTMLButtonElement>("#rule-cancel").hidden = true; }
function editRule(rule: GroupRule): void { ruleId.value = rule.id; ruleTitle.value = rule.title; ruleDomains.value = rule.domains.join(", "); ruleScope.value = rule.matchScope; ruleColor.value = rule.color; ruleEnabled.checked = rule.enabled; $("#rule-submit").textContent = i18n.t("saveRule"); $<HTMLButtonElement>("#rule-cancel").hidden = false; document.querySelector<HTMLElement>("#rule-form")?.scrollIntoView({ behavior: "smooth", block: "center" }); ruleTitle.focus(); }
async function removeRule(id: string): Promise<void> { if (!window.confirm(i18n.t("deleteRuleConfirm"))) return; try { await send({ type: "delete-group-rule", id }); await load(); showStatus(i18n.t("ruleDeleted")); } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); } }
async function removeIgnored(id: string): Promise<void> { if (!window.confirm(i18n.t("deleteSiteConfirm"))) return; try { await send({ type: "delete-ignored-site", id }); await load(); showStatus(i18n.t("siteDeleted")); } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); } }
for (const select of [defaultColor, ruleColor]) populateColors(select);
document.querySelectorAll<HTMLButtonElement>(".nav-link").forEach((button) => button.addEventListener("click", () => { const target = button.dataset.panel; if (!target) return; document.querySelectorAll<HTMLElement>(".panel").forEach((panel) => { panel.hidden = panel.id !== target; }); document.querySelectorAll<HTMLButtonElement>(".nav-link").forEach((item) => { const active = item === button; item.classList.toggle("active", active); item.setAttribute("aria-current", active ? "page" : "false"); }); $<HTMLElement>("#" + target).focus(); }));
openLogin.addEventListener("click", () => void (async () => { loginInstruction.hidden = true; try { await chrome.action.openPopup(); } catch { loginInstruction.hidden = false; showStatus(i18n.t("loginInstruction"), true); } })());
function activatePanelFromHash(): void {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return;
  const shortcutJump = hash === "shortcut-times";
  const target = shortcutJump ? "preferences" : hash;
  const navBtn = document.querySelector<HTMLButtonElement>(`.nav-link[data-panel="${target}"]`);
  if (!navBtn || navBtn.disabled) return;
  navBtn.click();
  if (shortcutJump) {
    const card = document.getElementById("shortcut-times-card");
    if (!card) return;
    requestAnimationFrame(() => {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("highlight");
      setTimeout(() => card.classList.remove("highlight"), 1600);
    });
  }
}
addDeferredShortcut.addEventListener("click", () => { const count = deferredShortcuts.querySelectorAll(".deferred-shortcut-input").length; if (count >= MAX_DEFERRED_SHORTCUTS) return; const row = createShortcutInput("09:00"); deferredShortcuts.append(row); updateShortcutEditorState(); const input = row.querySelector<HTMLInputElement>(".deferred-shortcut-input"); input?.focus(); });
openShortcutSettings.addEventListener("click", () => { void chrome.tabs.create({ url: "chrome://extensions/shortcuts" }).catch(() => { showStatus(i18n.t("shortcutKeysEditButton"), true); }); });
$("#sync-form").addEventListener("submit", (event) => { event.preventDefault(); void (async () => { try { await send({ type: "save-options-settings", settings: settingsPayload() }); await load(); showStatus(i18n.t("settingsSaved")); } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); } })(); });
$("#preferences-form").addEventListener("submit", (event) => { event.preventDefault(); void (async () => { try { await send({ type: "save-options-settings", settings: settingsPayload() }); await load(); showStatus(i18n.t("preferencesSaved")); } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); } })(); });
$("#appearance-form").addEventListener("submit", (event) => { event.preventDefault(); void (async () => { try { const payload = settingsPayload(); const previousLanguage = state?.settings.language; await send({ type: "save-options-settings", settings: payload }); applyTheme(payload.theme ?? "light"); if (payload.language !== previousLanguage) { await i18n.setLanguage(payload.language); i18n.applyI18n(); } await load(); showStatus(i18n.t("appearanceSaved")); } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); } })(); });
$("#sync-now").addEventListener("click", () => void (async () => { try { const result = await send<{ synced: boolean }>({ type: "sync-now" }); await load(); showStatus(result.synced ? i18n.t("syncCompleted") : i18n.t("syncNotEnabled")); } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); } })());
$("#sign-out").addEventListener("click", () => void (async () => { try { await send({ type: "auth-sign-out" }); await load(); showStatus(i18n.t("signOutSuccess")); } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); } })());
ruleForm.addEventListener("submit", (event) => { event.preventDefault(); void (async () => { const rule = { id: ruleId.value, title: ruleTitle.value, domains: ruleDomains.value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean), matchScope: ruleScope.value, color: ruleColor.value, enabled: ruleEnabled.checked }; try { await send({ type: ruleId.value ? "update-group-rule" : "create-group-rule", rule }); resetRuleForm(); await load(); showStatus(i18n.t("saved")); } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); } })(); });
$("#rule-cancel").addEventListener("click", resetRuleForm);
ignoredForm.addEventListener("submit", (event) => { event.preventDefault(); void (async () => { try { await send({ type: "create-ignored-site", site: { domain: ignoredDomain.value, matchScope: ignoredScope.value } }); ignoredForm.reset(); await load(); showStatus(i18n.t("saved")); } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); } })(); });
$("#export-data").addEventListener("click", () => void (async () => { try { const { data } = await send<{ data: PortableData }>({ type: "export-options-data" }); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "tab-garden-settings.json"; anchor.hidden = true; document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); showStatus(i18n.t("dataExported")); } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); } })());
importFile.addEventListener("change", () => void (async () => { const file = importFile.files?.[0]; importReady = false; confirmImport.disabled = true; cancelImport.disabled = true; importPreview.textContent = ""; if (!file) return; try { const preview = await send<ImportPreview>({ type: "import-options-data", data: await file.text() }); importReady = true; confirmImport.disabled = false; cancelImport.disabled = false; importPreview.textContent = i18n.t("importingRules", [String(preview.groupRuleCount), String(preview.ignoredSiteCount)]); } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); } })());
confirmImport.addEventListener("click", () => void (async () => { if (!importReady || !window.confirm(i18n.t("confirmImportPrompt"))) return; try { await send({ type: "import-options-data", confirmed: true }); importReady = false; importFile.value = ""; importPreview.textContent = i18n.t("importCompleted"); confirmImport.disabled = true; cancelImport.disabled = true; await load(); showStatus(i18n.t("settingsSaved")); } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); } })());
cancelImport.addEventListener("click", () => void (async () => { await send({ type: "import-options-data", cancelled: true }); importReady = false; importFile.value = ""; importPreview.textContent = i18n.t("importCancelled"); confirmImport.disabled = true; cancelImport.disabled = true; })());
void (async () => {
  await i18n.initFromStorage();
  i18n.applyI18n();
  void load().then(() => { if (state?.status.authenticated) { activatePanelFromHash(); void syncBackground(); } }).catch((error) => showStatus(error instanceof Error ? error.message : String(error), true));
})();
window.addEventListener("hashchange", () => activatePanelFromHash());
