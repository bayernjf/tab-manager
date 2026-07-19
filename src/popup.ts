import { DEFAULT_SETTINGS, UNGROUPED, type GroupColor, type Settings } from "./shared.js";

interface PopupTab { id?: number; title: string; url?: string; favIconUrl?: string; groupId: number; pinned: boolean }
interface PopupGroup { id: string; title: string; color: GroupColor; groupId: number }
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
const groupName = $<HTMLInputElement>("#group-name");
const groupColor = $<HTMLSelectElement>("#group-color");

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

function renderTabs(tabs: PopupTab[]): void {
  tabsList.replaceChildren();
  const available = tabs.filter((tab) => tab.id != null && !tab.pinned);
  if (!available.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "当前窗口没有可分组的标签页";
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
    const badge = document.createElement("small");
    badge.textContent = tab.groupId === UNGROUPED ? "" : "已分组";
    label.append(checkbox, icon, text, badge);
    tabsList.append(label);
  }
}

function renderGroups(groups: PopupGroup[]): void {
  groupsList.replaceChildren();
  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "还没有通过插件创建的自定义分组";
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
    remove.textContent = "解散";
    remove.addEventListener("click", async () => {
      try {
        await send({ type: "delete-custom-group", id: group.id });
        await load();
        showStatus("自定义分组已解散");
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
  renderTabs(state.tabs);
  renderGroups(state.customGroups);
}

async function saveSettings(): Promise<void> {
  const settings = { ...DEFAULT_SETTINGS, autoGroupEnabled: autoToggle.checked, minimumTabs: Number(minimumTabs.value) };
  await send({ type: "update-settings", settings });
  showStatus("设置已保存");
  await load();
}

autoToggle.addEventListener("change", () => void saveSettings().catch((error) => showStatus(String(error), true)));
minimumTabs.addEventListener("change", () => void saveSettings().catch((error) => showStatus(String(error), true)));

$("#select-all").addEventListener("click", () => {
  document.querySelectorAll<HTMLInputElement>('#tabs-list input[type="checkbox"]').forEach((input) => { input.checked = true; });
});

$("#create-group").addEventListener("click", async () => {
  const tabIds = Array.from(document.querySelectorAll<HTMLInputElement>('#tabs-list input[type="checkbox"]:checked')).map((input) => Number(input.value));
  try {
    await send({ type: "create-custom-group", tabIds, title: groupName.value, color: groupColor.value });
    groupName.value = "";
    await load();
    showStatus("自定义分组已创建");
  } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
});

$("#reconcile").addEventListener("click", async () => {
  try {
    await send({ type: "reconcile-now" });
    await load();
    showStatus("已重新整理");
  } catch (error) { showStatus(String(error), true); }
});

void load().catch((error) => showStatus(error instanceof Error ? error.message : String(error), true));
