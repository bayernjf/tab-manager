import { boardCardsForDevice, boardTabMatchesQuery, formatDeferredDateTime, getSiteKey, heightUnitsForTabCount, isBoardKey, manualBoardGridRow, moveManualBoardCard, nextDeferredOccurrence, placeBoardCards, isDeferredTabDue, segmentTabs, validateWorkspaceTitle, type BoardKey, type BoardLayout, type BoardSegmentCard, type DeferredTab, type DuplicateBoardTabGroup, type GroupColor, type Settings, type WorkspaceSnapshot, type WorkspaceTab } from "./shared.js";

interface BoardState {
  user: { id: string; email?: string } | null;
  loginRequired: boolean;
  message?: string;
  groups: BoardSegmentCard[];
  layouts?: BoardLayout[];
  settings?: Settings;
}

interface BoardResponse { error?: string }

interface DuplicatePreview {
  groups: DuplicateBoardTabGroup[];
}

interface DuplicateCloseResult {
  closed: number;
  skipped: number;
}

const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

const boardGrid = $<HTMLElement>("#board-grid");
const boardContent = $("#board-content");
const loginRequired = $("#login-required");
const loginMessage = $("#login-message");
const status = $("#board-status");
const autoFill = $<HTMLInputElement>("#auto-fill");
const newGroupForm = $<HTMLFormElement>("#new-group-form");
const newGroupTitle = $<HTMLInputElement>("#new-group-title");
const newGroupColor = $<HTMLSelectElement>("#new-group-color");
const boardSearch = $<HTMLInputElement>("#board-search");
const windowFilter = $<HTMLSelectElement>("#window-filter");
const reviewDuplicates = $<HTMLButtonElement>("#review-duplicates");
const duplicateReviewDialog = $<HTMLDialogElement>("#duplicate-review-dialog");
const duplicateReviewSummary = $("#duplicate-review-summary");
const duplicateReviewList = $("#duplicate-review-list");
const closeDuplicateReview = $<HTMLButtonElement>("#close-duplicate-review");
const cancelDuplicateReview = $<HTMLButtonElement>("#cancel-duplicate-review");
const confirmDuplicateReview = $<HTMLButtonElement>("#confirm-duplicate-review");
const openWorkspaces = $<HTMLButtonElement>("#open-workspaces"), workspaceDialog = $<HTMLDialogElement>("#workspace-dialog"), workspaceName = $<HTMLInputElement>("#workspace-name"), workspaceNameError = $<HTMLElement>("#workspace-name-error"), workspaceSelectAll = $<HTMLInputElement>("#workspace-select-all"), workspaceTabs = $("#workspace-tabs"), saveWorkspace = $<HTMLButtonElement>("#save-workspace"), workspaceDeviceName = $<HTMLInputElement>("#workspace-device-name"), workspaceList = $("#workspace-list"), closeWorkspaceDialog = $<HTMLButtonElement>("#close-workspace-dialog"), workspaceRestoreDialog = $<HTMLDialogElement>("#workspace-restore-dialog"), workspaceRestoreSummary = $("#workspace-restore-summary"), workspaceRestoreList = $("#workspace-restore-list"), confirmWorkspaceRestore = $<HTMLButtonElement>("#confirm-workspace-restore"), cancelWorkspaceRestore = $<HTMLButtonElement>("#cancel-workspace-restore");
const deferredReminders = $("#deferred-reminders"), deferredList = $("#deferred-list");
const boardStatistics = $("#board-statistics");
const scopeNav = $("#scope-nav");
const workspaceHeader = $("#workspace-header");

let currentState: BoardState | null = null;
let duplicateGroups: DuplicateBoardTabGroup[] = [];
let workspaces: WorkspaceSnapshot[] = [], restoreWorkspaceId: string | null = null;
let currentDevice: { id: string; name: string } | null = null;
let deviceNameOriginal = "";
type ScopeMode = "current" | "workspace";
let scopeMode: ScopeMode = "current";
let loadedWorkspace: { id: string; title: string; createdAt: string; deviceName?: string } | null = null;
let workspaceCards: BoardSegmentCard[] = [];
const WORKSPACE_DIALOG_VIEWPORT_MARGIN = 16;
const WORKSPACE_DIALOG_MOBILE_MAX_WIDTH = 640;

async function send<T>(message: unknown): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as T & BoardResponse;
  if (response?.error) throw new Error(response.error);
  return response;
}

function showStatus(message: string, error = false): void {
  status.textContent = message;
  status.className = error ? "status error" : "status";
}

async function loadWorkspaces(): Promise<void> { const result = await send<{ workspaces: WorkspaceSnapshot[]; device: { id: string; name: string } }>({ type: "get-workspaces" }); workspaces = result.workspaces; currentDevice = result.device; workspaceDeviceName.value = currentDevice.name; deviceNameOriginal = currentDevice.name; renderWorkspaces(); }
function renderWorkspaces(): void {
  workspaceList.replaceChildren(...workspaces.map((workspace) => {
    const row = document.createElement("div");
    row.className = "workspace-row";
    const name = document.createElement("span");
    name.textContent = `${workspace.title} · ${workspace.tabs.length} 个标签`;
    const actions = document.createElement("div");
    actions.className = "deferred-actions";
    const deviceInfo = document.createElement("span");
    deviceInfo.className = "workspace-device";
    const isCurrent = !workspace.deviceName || workspace.deviceName === currentDevice?.name;
    if (isCurrent) {
      const badge = document.createElement("span");
      badge.className = "workspace-device-badge";
      badge.textContent = "当前设备";
      deviceInfo.append(badge);
    }
    const deviceName = document.createElement("span");
    deviceName.className = "workspace-device-name";
    deviceName.textContent = isCurrent ? (currentDevice?.name ?? workspace.deviceName ?? "本设备") : (workspace.deviceName ?? "其他设备");
    deviceInfo.append(deviceName);
    const restore = makeButton("恢复", "deferred-action deferred-open", `恢复 ${workspace.title}`);
    restore.addEventListener("click", () => void previewWorkspaceRestore(workspace.id));
    const remove = makeButton("删除", "deferred-action deferred-delete", `删除 ${workspace.title}`);
    remove.addEventListener("click", () => void deleteWorkspace(workspace.id));
    actions.append(deviceInfo, restore, remove);
    row.append(name, actions);
    return row;
  }));
}
function workspaceTabInputs(): HTMLInputElement[] {
  return Array.from(workspaceTabs.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
}
function syncWorkspaceSelectAll(): void {
  const inputs = workspaceTabInputs();
  const checkedCount = inputs.filter((input) => input.checked).length;
  workspaceSelectAll.disabled = inputs.length === 0;
  workspaceSelectAll.checked = inputs.length > 0 && checkedCount === inputs.length;
  workspaceSelectAll.indeterminate = checkedCount > 0 && checkedCount < inputs.length;
}
function renderWorkspaceTabs(): void {
  const tabs = currentState?.groups.flatMap((group) => group.tabs).filter((tab): tab is typeof tab & { url: string } => Boolean(tab.url));
  workspaceTabs.replaceChildren(...(tabs ?? []).map((tab) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = true;
    input.value = String(tab.id);
    input.dataset.title = tab.title;
    input.dataset.url = tab.url;
    label.append(input, document.createTextNode(tab.title));
    return label;
  }));
  syncWorkspaceSelectAll();
}
function syncWorkspaceDialogResizeAnchor(): void {
  if (window.innerWidth <= WORKSPACE_DIALOG_MOBILE_MAX_WIDTH) {
    workspaceDialog.classList.remove("workspace-dialog-resize-anchored");
    workspaceDialog.style.removeProperty("--workspace-dialog-left");
    workspaceDialog.style.removeProperty("--workspace-dialog-top");
    return;
  }
  if (!workspaceDialog.open) return;
  const rect = workspaceDialog.getBoundingClientRect();
  const availableWidth = Math.max(0, window.innerWidth - WORKSPACE_DIALOG_VIEWPORT_MARGIN * 2);
  const availableHeight = Math.max(0, window.innerHeight - WORKSPACE_DIALOG_VIEWPORT_MARGIN * 2);
  const width = Math.min(rect.width, availableWidth);
  const height = Math.min(rect.height, availableHeight);
  const left = Math.min(
    Math.max(WORKSPACE_DIALOG_VIEWPORT_MARGIN, rect.left),
    Math.max(WORKSPACE_DIALOG_VIEWPORT_MARGIN, window.innerWidth - WORKSPACE_DIALOG_VIEWPORT_MARGIN - width),
  );
  const top = Math.min(
    Math.max(WORKSPACE_DIALOG_VIEWPORT_MARGIN, rect.top),
    Math.max(WORKSPACE_DIALOG_VIEWPORT_MARGIN, window.innerHeight - WORKSPACE_DIALOG_VIEWPORT_MARGIN - height),
  );
  workspaceDialog.style.setProperty("--workspace-dialog-left", `${Math.round(left)}px`);
  workspaceDialog.style.setProperty("--workspace-dialog-top", `${Math.round(top)}px`);
  workspaceDialog.classList.add("workspace-dialog-resize-anchored");
}
async function openWorkspaceDialog(): Promise<void> { renderWorkspaceTabs(); workspaceDialog.showModal(); syncWorkspaceDialogResizeAnchor(); workspaceName.focus(); await loadWorkspaces(); }
function clearWorkspaceNameError(): void {
  workspaceNameError.hidden = true;
  workspaceNameError.textContent = "";
  workspaceName.classList.remove("workspace-name-input-invalid");
  workspaceName.setAttribute("aria-invalid", "false");
}
function showWorkspaceError(message: string): void {
  workspaceNameError.textContent = message;
  workspaceNameError.hidden = false;
}
function showWorkspaceNameError(message: string): void {
  showWorkspaceError(message);
  workspaceName.classList.add("workspace-name-input-invalid");
  workspaceName.setAttribute("aria-invalid", "true");
  workspaceName.focus();
}
async function saveCurrentWorkspace(): Promise<void> {
  const title = validateWorkspaceTitle(workspaceName.value, workspaces.filter((workspace) => workspace.deviceName === currentDevice?.name).map((workspace) => workspace.title));
  if (title.status === "empty") {
    showWorkspaceNameError("请输入工作区名称");
    return;
  }
  if (title.status === "duplicate") {
    showWorkspaceNameError("该工作区名称已存在");
    return;
  }
  if (title.status !== "valid") { showWorkspaceNameError("工作区名称不能超过 80 字符"); return; }
  const tabs: WorkspaceTab[] = Array.from(workspaceTabs.querySelectorAll<HTMLInputElement>("input:checked")).map((input) => ({ title: input.dataset.title ?? "未命名标签页", url: input.dataset.url ?? "" }));
  if (tabs.length === 0) { showWorkspaceError("请至少选择一个标签"); return; }
  try {
    await send({ type: "save-workspace", title: title.title, tabs });
  } catch (error) {
    if (error instanceof Error) {
      showWorkspaceError(error.message);
      return;
    }
    throw error;
  }
  workspaceName.value = "";
  clearWorkspaceNameError();
  await loadWorkspaces();
  showStatus("工作区已保存");
}
async function previewWorkspaceRestore(id: string): Promise<void> { const result = await send<{ preview: { tabs: WorkspaceTab[]; unavailableCount: number } }>({ type: "get-workspace-restore-preview", id }); restoreWorkspaceId = id; workspaceRestoreSummary.textContent = `将打开 ${result.preview.tabs.length} 个标签${result.preview.unavailableCount ? `，跳过 ${result.preview.unavailableCount} 个不可用页面` : ""}`; workspaceRestoreList.replaceChildren(...result.preview.tabs.map((tab) => { const item = document.createElement("p"); item.textContent = tab.title; return item; })); workspaceRestoreDialog.showModal(); }
async function restoreWorkspace(): Promise<void> { if (!restoreWorkspaceId) return; const tab = await chrome.tabs.getCurrent(); const result = await send<{ created: number }>({ type: "restore-workspace", id: restoreWorkspaceId, windowId: tab?.windowId, confirmed: true }); workspaceRestoreDialog.close(); showStatus(`已打开 ${result.created} 个标签`); }
async function deleteWorkspace(id: string): Promise<void> { await send({ type: "delete-workspace", id }); await loadWorkspaces(); }
async function renameDevice(name: string): Promise<void> {
  try {
    const result = await send<{ name: string }>({ type: "set-device-name", name });
    if (currentDevice) currentDevice.name = result.name;
    workspaceDeviceName.value = result.name;
    deviceNameOriginal = result.name;
    renderWorkspaces();
  } catch (error) {
    workspaceDeviceName.value = deviceNameOriginal;
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function deviceClass(): "desktop" | "tablet" | "mobile" {
  if (window.innerWidth <= 640) return "mobile";
  if (window.innerWidth <= 980) return "tablet";
  return "desktop";
}

function laneCount(): number {
  return deviceClass() === "desktop" ? 3 : deviceClass() === "tablet" ? 2 : 1;
}

function groupColor(color: GroupColor): string {
  const colors: Record<GroupColor, string> = {
    grey: "#909994", blue: "#6d8fc4", red: "#cf5d5d", yellow: "#d2ad3f", green: "#5c9b70",
    pink: "#d77ca4", purple: "#8b70ba", cyan: "#4fa4ac", orange: "#d68b4a",
  };
  return colors[color];
}

function makeButton(label: string, className: string, title: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.textContent = label;
  return button;
}

function dragData(event: DragEvent, type: "board-tab" | "board-group" | "workspace-tab", value: string): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(type, value);
}

function clearDropTarget(event: DragEvent): void {
  event.currentTarget instanceof HTMLElement && event.currentTarget.classList.remove("drop-target");
}

function renderTab(tab: BoardSegmentCard["tabs"][number], targetBoardKey: BoardKey, targetSegmentIndex: number): HTMLElement {
  const row = document.createElement("div");
  row.className = "tab-row";
  row.draggable = true;
  row.title = tab.url || tab.title;
  const open = document.createElement("button");
  open.type = "button";
  open.className = "tab-open";
  open.setAttribute("aria-label", `打开标签：${tab.title}`);
  const icon = document.createElement("img");
  icon.className = "tab-icon";
  icon.alt = "";
  icon.src = tab.favIconUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
  icon.classList.toggle("github-tab-icon", getSiteKey(tab.url) === "github.com");
  const title = document.createElement("span");
  title.className = "tab-title";
  title.textContent = tab.title;
  open.append(icon, title);
  open.addEventListener("click", () => void activateTab(tab.id));
  const saveToWorkspace = makeButton("+", "tab-saveworkspace", `保存到工作区：${tab.title}`);
  saveToWorkspace.addEventListener("click", (event) => { event.stopPropagation(); void openSaveToWorkspaceMenu(row, tab, saveToWorkspace); });
  saveToWorkspace.addEventListener("dragstart", (event) => { event.preventDefault(); event.stopPropagation(); });
  const close = makeButton("×", "tab-close", `关闭标签：${tab.title}`);
  close.addEventListener("click", (event) => {
    event.stopPropagation();
    void closeTab(tab.id);
  });
  close.addEventListener("dragstart", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  const defer = makeButton("◷", "tab-defer", `稍后处理：${tab.title}`);
  defer.addEventListener("click", (event) => {
    event.stopPropagation();
    const existing = row.querySelector(".defer-menu") as (HTMLDivElement & { closeRef?: () => void }) | null;
    if (existing) { existing.closeRef?.(); return; }
    const menu = document.createElement("div") as HTMLDivElement & { closeRef?: () => void };
    menu.className = "defer-menu";
    let onOutside: ((event: MouseEvent) => void) | null = null;
    const closeMenu = () => { menu.remove(); if (onOutside) document.removeEventListener("mousedown", onOutside, true); };
    menu.closeRef = closeMenu;
    const times = currentState?.settings?.deferredShortcutTimes ?? ["09:00", "14:00", "18:00"];
    for (const time of times) {
      const option = makeButton(`倒计时 ${time}`, "defer-option", `倒计时至 ${time}`);
      option.addEventListener("click", () => { closeMenu(); void deferTab(tab.id, nextDeferredOccurrence(time).toISOString()); });
      menu.append(option);
    }
    onOutside = (event: MouseEvent) => { if (!menu.contains(event.target as Node) && !defer.contains(event.target as Node)) closeMenu(); };
    setTimeout(() => { if (onOutside) document.addEventListener("mousedown", onOutside, true); }, 0);
    row.append(menu);
  });
  row.append(saveToWorkspace, defer, close, open);
  row.addEventListener("dragstart", (event) => {
    if (event.target instanceof Element && event.target.closest(".tab-close")) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    row.classList.add("dragging");
    dragData(event, "board-tab", String(tab.id));
  });
  row.addEventListener("dragend", () => row.classList.remove("dragging"));
  row.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types.includes("board-tab")) return;
    event.preventDefault();
    row.classList.add("drop-target");
  });
  row.addEventListener("dragleave", clearDropTarget);
  row.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearDropTarget(event);
    const tabId = Number(event.dataTransfer?.getData("board-tab"));
    if (!Number.isInteger(tabId) || tabId < 0) return;
    const position = event.clientY < row.getBoundingClientRect().top + row.clientHeight / 2 ? "before" : "after";
    void moveTab(tabId, targetBoardKey, position, targetSegmentIndex, tab.id);
  });
  return row;
}

async function deferTab(tabId: number, dueAt: string): Promise<void> { try { await send({ type: "defer-board-tab", tabId, dueAt: new Date(dueAt).toISOString() }); showStatus("已加入稍后处理"); await load(); } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); } }

async function openSaveToWorkspaceMenu(row: HTMLElement, tab: BoardSegmentCard["tabs"][number], toggleButton: HTMLButtonElement): Promise<void> {
  const existing = row.querySelector(".workspace-save-menu") as (HTMLDivElement & { closeRef?: () => void }) | null;
  if (existing) { existing.closeRef?.(); return; }
  const menu = document.createElement("div") as HTMLDivElement & { closeRef?: () => void };
  menu.className = "workspace-save-menu";
  const description = document.createElement("p");
  description.className = "workspace-save-desc";
  description.textContent = "选择要保存到的工作区";
  const loading = document.createElement("p");
  loading.className = "empty";
  loading.textContent = "加载中…";
  menu.append(description, loading);
  row.append(menu);
  let onOutside: ((event: MouseEvent) => void) | null = null;
  const closeMenu = () => { menu.remove(); if (onOutside) document.removeEventListener("mousedown", onOutside, true); };
  menu.closeRef = closeMenu;
  onOutside = (event) => { if (!menu.contains(event.target as Node) && !toggleButton.contains(event.target as Node)) closeMenu(); };
  setTimeout(() => { if (onOutside) document.addEventListener("mousedown", onOutside, true); }, 0);
  try {
    const result = await send<{ workspaces: WorkspaceSnapshot[] }>({ type: "get-workspaces" });
    if (!result.workspaces.length) {
      closeMenu();
      await send({ type: "save-workspace", title: "默认", tabs: [{ title: tab.title, url: tab.url ?? "" }] });
      showStatus("已保存到默认工作区");
      return;
    }
    menu.replaceChildren(description, ...result.workspaces.map((workspace) => {
      const option = makeButton(workspace.title, "workspace-save-option", `保存到 ${workspace.title}`);
      option.addEventListener("click", () => { closeMenu(); void addTabToWorkspace(workspace.id, workspace.title, { title: tab.title, url: tab.url ?? "" }); });
      return option;
    }));
  } catch (error) {
    closeMenu();
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function addTabToWorkspace(id: string, title: string, tab: WorkspaceTab): Promise<void> {
  try {
    await send({ type: "add-tab-to-workspace", id, tab });
    showStatus(`已保存到 ${title}`);
  } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
}
function renderDeferredRow(tab: DeferredTab): HTMLElement {
  const row = document.createElement("div");
  row.className = "deferred-row";

  const icon = document.createElement("img");
  icon.className = "tab-icon deferred-icon";
  icon.alt = "";
  icon.src = tab.favIconUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
  icon.classList.toggle("github-tab-icon", getSiteKey(tab.url) === "github.com");
  const title = document.createElement("span");
  title.className = "deferred-title";
  title.textContent = tab.title;
  const due = isDeferredTabDue(tab);
  const reminderStatus = document.createElement("span");
  reminderStatus.className = `deferred-status ${due ? "due" : "scheduled"}`;
  reminderStatus.textContent = due ? `已到期 · ${formatDeferredDateTime(tab.dueAt)}` : `${formatDeferredDateTime(tab.dueAt)} 提醒`;

  const actions = document.createElement("div");
  actions.className = "deferred-actions";
  const open = makeButton("打开", "deferred-action deferred-open", `打开 ${tab.title}`);
  open.addEventListener("click", async () => {
    const current = await chrome.tabs.getCurrent();
    await send({ type: "open-deferred-tab", id: tab.id, windowId: current?.windowId });
    await Promise.all([renderDeferredTabs(), renderBoardStatistics()]);
  });
  const remove = makeButton("删除", "deferred-action deferred-delete", `删除 ${tab.title}`);
  remove.addEventListener("click", async () => {
    await send({ type: "delete-deferred-tab", id: tab.id });
    await Promise.all([renderDeferredTabs(), renderBoardStatistics()]);
  });
  actions.append(open, remove);
  row.append(icon, title, reminderStatus, actions);
  return row;
}

async function renderDeferredTabs(): Promise<void> {
  const tabs = (await send<{ tabs: DeferredTab[] }>({ type: "get-deferred-tabs" })).tabs
    .sort((first, second) => Date.parse(first.dueAt) - Date.parse(second.dueAt));
  deferredReminders.classList.toggle("hidden", tabs.length === 0);
  deferredList.replaceChildren(...tabs.map(renderDeferredRow));
}

async function renderBoardStatistics(): Promise<void> { const stats = await send<{ eligibleTabCount: number; duplicateTabCount: number; deferredTabCount?: number; dueDeferredCount?: number }>({ type: "get-board-statistics" }); const deferredTabCount = stats.deferredTabCount ?? stats.dueDeferredCount ?? 0; boardStatistics.replaceChildren(...[["网页标签", stats.eligibleTabCount], ["重复页面", stats.duplicateTabCount], ["待恢复提醒", deferredTabCount]].map(([label, value]) => { const card = document.createElement("div"); const number = document.createElement("strong"); number.textContent = String(value); const text = document.createElement("span"); text.textContent = String(label); card.append(number, text); return card; })); }

function renderCard(card: BoardSegmentCard, rank: number, automatic: boolean, placement: { slot: number; compositeHeight: 1 | 2 }): HTMLElement {
  const article = document.createElement("article");
  article.className = "group-card";
  article.dataset.height = String(card.heightUnits);
  article.style.setProperty("--group-color", groupColor(card.color));
  const row = manualBoardGridRow({ slot: placement.slot, heightUnits: placement.compositeHeight });
  article.style.gridRow = `${row.start} / span ${row.span}`;
  const canMoveGroup = card.boardKey !== "ungrouped";
  article.draggable = canMoveGroup;
  if (canMoveGroup) {
    article.addEventListener("dragstart", (event) => {
      article.classList.add("dragging");
      dragData(event, "board-group", card.boardKey);
    });
    article.addEventListener("dragend", () => article.classList.remove("dragging"));
  }
  article.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types.includes("board-group")) return;
    if (card.boardKey === "ungrouped") return;
    event.preventDefault();
    article.classList.add("drop-target");
  });
  article.addEventListener("dragleave", clearDropTarget);
  article.addEventListener("drop", (event) => {
    const boardKey = event.dataTransfer?.getData("board-group");
    if (!boardKey || !isBoardKey(boardKey) || card.boardKey === "ungrouped") return;
    event.preventDefault();
    clearDropTarget(event);
    void moveGroup(boardKey, card.boardKey, rank, automatic);
  });
  article.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types.includes("board-tab")) return;
    event.preventDefault();
    article.classList.add("drop-target");
  });
  article.addEventListener("drop", (event) => {
    const tabId = Number(event.dataTransfer?.getData("board-tab"));
    if (!Number.isInteger(tabId) || tabId < 0) return;
    event.preventDefault();
    clearDropTarget(event);
    void moveTab(tabId, card.boardKey, "append", card.segmentIndex);
  });

  const heading = document.createElement("div");
  heading.className = "card-title";
  const title = document.createElement("h2");
  title.textContent = card.title;
  heading.append(title);
  if (card.segmentCount > 1) {
    const segment = document.createElement("span");
    segment.className = "segment";
    segment.textContent = `第 ${card.segmentIndex + 1}/${card.segmentCount} 段`;
    heading.append(segment);
  }
  if (card.kind === "custom" && card.segmentIndex === 0) {
    const tools = document.createElement("div");
    tools.className = "card-tools";
    const remove = makeButton("×", "icon-button danger", `删除分组 ${card.title}`);
    remove.addEventListener("click", () => {
      const id = card.boardKey.slice("custom:".length);
      if (!window.confirm(`确定删除“${card.title}”吗？其中的标签页将变为未分组。`)) return;
      void deleteGroup(id);
    });
    tools.append(remove);
    heading.append(tools);
  }
  const tabs = document.createElement("div");
  tabs.className = "tabs";
  if (card.tabs.length) tabs.append(...card.tabs.map((tab) => renderTab(tab, card.boardKey, card.segmentIndex)));
  else {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "拖放标签到这里";
    tabs.append(empty);
  }
  article.append(heading, tabs);
  return article;
}

function renderWindowFilter(state: BoardState): void {
  const selected = windowFilter.value;
  const windows = new Map<number, string>();
  for (const tab of state.groups.flatMap((card) => card.tabs)) {
    if (tab.windowId !== undefined && tab.windowLabel) windows.set(tab.windowId, tab.windowLabel);
  }
  windowFilter.replaceChildren(new Option("全部窗口", ""), ...[...windows.entries()].map(([windowId, label]) => new Option(label, String(windowId))));
  windowFilter.value = windows.has(Number(selected)) ? selected : "";
}

function filteredCards(cards: BoardSegmentCard[]): BoardSegmentCard[] {
  const query = boardSearch.value;
  const windowId = windowFilter.value;
  if (!query.trim() && !windowId) return cards;
  return cards.flatMap((card) => {
    const tabs = card.tabs.filter((tab) => boardTabMatchesQuery(tab, query) && (!windowId || String(tab.windowId) === windowId));
    return tabs.length ? [{ ...card, tabs }] : [];
  });
}

function renderBoard(state: BoardState): void {
  boardGrid.replaceChildren();
  const layouts = state.layouts ?? [];
  const movable = state.groups.filter((card) => card.boardKey !== "ungrouped");
  const automatic = !movable.some((card) => layouts.find((layout) => layout.boardKey === card.boardKey && layout.deviceClass === deviceClass())?.autoFill === false);
  autoFill.checked = automatic;
  autoFill.disabled = movable.length === 0;
  const cards = filteredCards(boardCardsForDevice(state.groups, layouts, deviceClass()));
  const placement = placeBoardCards(cards, laneCount(), automatic);
  if (!cards.length) {
    boardGrid.style.gridTemplateColumns = "1fr";
    const empty = document.createElement("p");
    empty.className = "empty board-empty";
    empty.textContent = "没有匹配的标签";
    boardGrid.append(empty);
    return;
  }
  boardGrid.style.gridTemplateColumns = `repeat(${placement.laneHeights.length}, minmax(0, 1fr))`;
  const lanes = Array.from({ length: placement.laneHeights.length }, () => {
    const lane = document.createElement("div");
    lane.className = "board-lane";
    lane.classList.toggle("manual-layout", !automatic);
    return lane;
  });
  for (const item of [...placement.placements].sort((left, right) => left.lane - right.lane || left.order - right.order)) {
    const card = cards.find((candidate) => candidate.boardKey === item.boardKey && candidate.segmentIndex === item.segmentIndex);
    const lane = lanes[item.lane];
    if (card && lane) lane.append(renderCard(card, card.rank, automatic, item));
  }
  boardGrid.append(...lanes);
}

function duplicateCloseCount(groups: readonly DuplicateBoardTabGroup[]): number {
  return groups.reduce((count, group) => count + Math.max(0, group.tabs.length - 1), 0);
}

function renderDuplicateReview(groups: readonly DuplicateBoardTabGroup[]): void {
  duplicateGroups = [...groups];
  const closeCount = duplicateCloseCount(groups);
  duplicateReviewSummary.textContent = closeCount ? `发现 ${groups.length} 组完全相同的网址，将保留每组的第一条标签。` : "没有发现完全相同的网址。";
  duplicateReviewList.replaceChildren(...groups.map((group) => {
    const section = document.createElement("section");
    section.className = "duplicate-set";
    const url = document.createElement("p");
    url.className = "duplicate-url";
    url.textContent = group.url;
    const tabs = document.createElement("ul");
    tabs.className = "duplicate-tabs";
    for (const tab of group.tabs) {
      const item = document.createElement("li");
      const badge = document.createElement("span");
      const retained = tab.id === group.retainedTabId;
      badge.className = retained ? "duplicate-badge keep" : "duplicate-badge close";
      badge.textContent = retained ? "保留" : "关闭";
      const title = document.createElement("span");
      title.className = "duplicate-tab-title";
      title.textContent = tab.title;
      item.append(badge, title);
      tabs.append(item);
    }
    section.append(url, tabs);
    return section;
  }));
  confirmDuplicateReview.disabled = closeCount === 0;
  confirmDuplicateReview.textContent = closeCount ? `关闭 ${closeCount} 个重复标签` : "没有可关闭的重复标签";
}

async function openDuplicateReview(): Promise<void> {
  try {
    reviewDuplicates.disabled = true;
    const preview = await send<DuplicatePreview>({ type: "get-board-duplicate-preview" });
    renderDuplicateReview(preview.groups);
    duplicateReviewDialog.showModal();
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    reviewDuplicates.disabled = false;
  }
}

async function closeReviewedDuplicates(): Promise<void> {
  const groups = duplicateGroups.map((group) => ({ retainedTabId: group.retainedTabId, tabIds: group.tabs.map((tab) => tab.id) }));
  if (!groups.length) return;
  try {
    confirmDuplicateReview.disabled = true;
    const result = await send<DuplicateCloseResult>({ type: "close-board-duplicates", groups, confirmed: true });
    duplicateReviewDialog.close();
    showStatus(result.skipped ? `已关闭 ${result.closed} 个重复标签，跳过 ${result.skipped} 个已变化标签` : `已关闭 ${result.closed} 个重复标签`);
    await load();
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
    confirmDuplicateReview.disabled = false;
  }
}

function renderScopeNav(): void {
  scopeNav.replaceChildren();
  const scopes = document.createElement("div");
  scopes.className = "scope-nav-scopes";
  scopes.append(makeScopeButton("current", "当前"), makeScopeButton("workspace", "从工作区加载"));
  scopeNav.append(scopes);
  if (scopeMode !== "workspace") return;
  const list = document.createElement("div");
  list.className = "scope-nav-workspaces";
  if (!workspaces.length) {
    const empty = document.createElement("span");
    empty.className = "scope-nav-empty";
    empty.textContent = "暂无工作区";
    list.append(empty);
  } else {
    for (const workspace of workspaces) list.append(makeWorkspaceNavButton(workspace));
  }
  scopeNav.append(makeScopeChevron(), list);
}

function makeScopeButton(kind: ScopeMode, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "scope-nav-scope";
  button.textContent = label;
  button.setAttribute("aria-pressed", String(scopeMode === kind));
  button.addEventListener("click", () => void selectScopeMode(kind));
  return button;
}

function makeScopeChevron(): HTMLSpanElement {
  const chevron = document.createElement("span");
  chevron.className = "scope-nav-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "›";
  return chevron;
}

function makeWorkspaceNavButton(workspace: WorkspaceSnapshot): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "scope-nav-workspace";
  button.classList.toggle("selected", loadedWorkspace?.id === workspace.id);
  const title = document.createElement("span");
  title.className = "scope-nav-workspace-title";
  title.textContent = workspace.title;
  const count = document.createElement("span");
  count.className = "scope-nav-workspace-count";
  count.textContent = `${workspace.tabs.length} 标签`;
  button.append(title, count);
  button.addEventListener("click", () => void loadWorkspaceBoard(workspace.id));
  return button;
}

async function selectScopeMode(mode: ScopeMode): Promise<void> {
  if (scopeMode === mode) return;
  scopeMode = mode;
  if (mode === "workspace") {
    if (!workspaces.length) await loadWorkspaces();
    renderScopeNav();
    return;
  }
  await returnToCurrent();
}

async function loadWorkspaceBoard(id: string): Promise<void> {
  try {
    const result = await send<{ workspace: { id: string; title: string; createdAt: string; deviceName?: string }; cards: BoardSegmentCard[] }>({ type: "get-workspace-board", id });
    loadedWorkspace = result.workspace;
    workspaceCards = result.cards;
    scopeMode = "workspace";
    setWorkspaceMode(true);
    renderScopeNav();
    renderWorkspaceHeader();
    renderWorkspaceBoard();
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function renderWorkspaceBoard(): void {
  boardGrid.replaceChildren();
  const query = boardSearch.value;
  const cards = query
    ? workspaceCards.map((card) => ({ ...card, tabs: card.tabs.filter((tab) => boardTabMatchesQuery(tab, query)) })).filter((card) => card.tabs.length)
    : workspaceCards;
  const placement = placeBoardCards(cards, laneCount(), true);
  if (!cards.length) {
    boardGrid.style.gridTemplateColumns = "1fr";
    const empty = document.createElement("p");
    empty.className = "empty board-empty";
    empty.textContent = query ? "没有匹配的标签" : "该工作区没有标签";
    boardGrid.append(empty);
    return;
  }
  boardGrid.style.gridTemplateColumns = `repeat(${placement.laneHeights.length}, minmax(0, 1fr))`;
  const lanes = Array.from({ length: placement.laneHeights.length }, () => {
    const lane = document.createElement("div");
    lane.className = "board-lane manual-layout";
    return lane;
  });
  for (const item of [...placement.placements].sort((left, right) => left.lane - right.lane || left.order - right.order)) {
    const card = cards.find((candidate) => candidate.boardKey === item.boardKey && candidate.segmentIndex === item.segmentIndex);
    const lane = lanes[item.lane];
    if (card && lane) lane.append(renderWorkspaceCard(card, item));
  }
  boardGrid.append(...lanes);
}

function renderWorkspaceCard(card: BoardSegmentCard, placement: { slot: number; compositeHeight: 1 | 2 }): HTMLElement {
  const article = document.createElement("article");
  article.className = "group-card workspace-card";
  article.dataset.height = String(card.heightUnits);
  article.style.setProperty("--group-color", groupColor(card.color));
  const gridRow = manualBoardGridRow({ slot: placement.slot, heightUnits: placement.compositeHeight });
  article.style.gridRow = `${gridRow.start} / span ${gridRow.span}`;
  const heading = document.createElement("div");
  heading.className = "card-title";
  const title = document.createElement("h2");
  title.textContent = card.title;
  heading.append(title);
  if (card.segmentCount > 1) {
    const segment = document.createElement("span");
    segment.className = "segment";
    segment.textContent = `第 ${card.segmentIndex + 1}/${card.segmentCount} 段`;
    heading.append(segment);
  }
  const tabs = document.createElement("div");
  tabs.className = "tabs";
  if (card.tabs.length) tabs.append(...card.tabs.map((tab) => renderWorkspaceTab(tab)));
  else {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "暂无标签";
    tabs.append(empty);
  }
  article.append(heading, tabs);
  return article;
}

function faviconFor(url?: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return `${parsed.origin}/favicon.ico`;
  } catch {
    return "";
  }
}

function renderWorkspaceTab(tab: BoardSegmentCard["tabs"][number]): HTMLElement {
  const flatIndex = tab.id;
  const row = document.createElement("div");
  row.className = "tab-row workspace-tab";
  row.draggable = true;
  row.title = tab.url || tab.title;
  const open = document.createElement("button");
  open.type = "button";
  open.className = "tab-open";
  open.setAttribute("aria-label", `打开标签：${tab.title}`);
  const icon = document.createElement("img");
  icon.className = "tab-icon";
  icon.alt = "";
  const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
  icon.src = faviconFor(tab.url) || fallback;
  icon.addEventListener("error", () => { if (icon.src !== fallback) icon.src = fallback; });
  icon.classList.toggle("github-tab-icon", getSiteKey(tab.url) === "github.com");
  const titleEl = document.createElement("span");
  titleEl.className = "tab-title";
  titleEl.textContent = tab.title;
  open.append(icon, titleEl);
  if (tab.url) open.addEventListener("click", () => void chrome.tabs.create({ url: tab.url }));
  else open.disabled = true;
  const edit = makeButton("✎", "tab-edit", `编辑标签：${tab.title}`);
  edit.addEventListener("click", (event) => { event.stopPropagation(); beginEditWorkspaceTab(row, flatIndex, tab); });
  const close = makeButton("×", "tab-close", `从工作区删除：${tab.title}`);
  close.addEventListener("click", (event) => { event.stopPropagation(); void deleteWorkspaceTab(flatIndex); });
  row.append(edit, close, open);
  row.addEventListener("dragstart", (event) => {
    if (event.target instanceof Element && event.target.closest(".tab-close, .tab-edit")) { event.preventDefault(); return; }
    event.stopPropagation();
    row.classList.add("dragging");
    dragData(event, "workspace-tab", String(flatIndex));
  });
  row.addEventListener("dragend", () => row.classList.remove("dragging"));
  row.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types.includes("workspace-tab")) return;
    event.preventDefault();
    row.classList.add("drop-target");
  });
  row.addEventListener("dragleave", clearDropTarget);
  row.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearDropTarget(event);
    const fromIndex = Number(event.dataTransfer?.getData("workspace-tab"));
    if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex === flatIndex) return;
    void moveWorkspaceTabHandler(fromIndex, flatIndex);
  });
  return row;
}

function beginEditWorkspaceTab(row: HTMLElement, flatIndex: number, tab: BoardSegmentCard["tabs"][number]): void {
  row.replaceChildren();
  row.draggable = false;
  row.classList.add("editing");
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.className = "workspace-edit-input";
  titleInput.value = tab.title;
  titleInput.placeholder = "标题";
  const urlInput = document.createElement("input");
  urlInput.type = "url";
  urlInput.className = "workspace-edit-input";
  urlInput.value = tab.url ?? "";
  urlInput.placeholder = "网址";
  const save = makeButton("保存", "button workspace-edit-save", "保存");
  save.addEventListener("click", (event) => { event.stopPropagation(); void saveWorkspaceTabEdit(flatIndex, titleInput.value, urlInput.value); });
  const cancel = makeButton("取消", "button secondary workspace-edit-cancel", "取消");
  cancel.addEventListener("click", (event) => { event.stopPropagation(); renderWorkspaceBoard(); });
  row.append(titleInput, urlInput, save, cancel);
  titleInput.focus();
}

async function saveWorkspaceTabEdit(flatIndex: number, title: string, url: string): Promise<void> {
  if (!loadedWorkspace) return;
  try {
    await send({ type: "update-workspace-tab", id: loadedWorkspace.id, index: flatIndex, title, url });
    showStatus("标签已更新");
    await loadWorkspaceBoard(loadedWorkspace.id);
  } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
}

async function deleteWorkspaceTab(flatIndex: number): Promise<void> {
  if (!loadedWorkspace) return;
  try {
    await send({ type: "remove-workspace-tab", id: loadedWorkspace.id, index: flatIndex });
    showStatus("标签已从工作区删除");
    await loadWorkspaceBoard(loadedWorkspace.id);
    await loadWorkspaces();
  } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
}

async function addWorkspaceTab(url: string, title: string): Promise<void> {
  if (!loadedWorkspace) return;
  try {
    await send({ type: "add-tab-to-workspace", id: loadedWorkspace.id, tab: { title, url } });
    showStatus("标签已添加到工作区");
    await loadWorkspaceBoard(loadedWorkspace.id);
    await loadWorkspaces();
  } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
}

async function moveWorkspaceTabHandler(fromIndex: number, toIndex: number): Promise<void> {
  if (!loadedWorkspace) return;
  try {
    await send({ type: "move-workspace-tab", id: loadedWorkspace.id, fromIndex, toIndex });
    await loadWorkspaceBoard(loadedWorkspace.id);
  } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
}

async function returnToCurrent(): Promise<void> {
  scopeMode = "current";
  loadedWorkspace = null;
  workspaceCards = [];
  setWorkspaceMode(false);
  renderScopeNav();
  workspaceHeader.replaceChildren();
  await load();
}

function setWorkspaceMode(on: boolean): void {
  boardContent.classList.toggle("workspace-mode", on);
  newGroupForm.classList.toggle("hidden", on);
  windowFilter.classList.toggle("hidden", on);
  reviewDuplicates.classList.toggle("hidden", on);
  boardStatistics.classList.toggle("hidden", on);
  deferredReminders.classList.toggle("hidden", on);
  workspaceHeader.classList.toggle("hidden", !on);
}

function renderWorkspaceHeader(): void {
  workspaceHeader.replaceChildren();
  if (!loadedWorkspace) return;
  const info = document.createElement("span");
  info.className = "workspace-header-info";
  const tabCount = workspaceCards.reduce((sum, card) => sum + card.tabs.length, 0);
  const deviceSuffix = loadedWorkspace.deviceName ? `（${loadedWorkspace.deviceName}）` : "";
  info.textContent = `工作区：${loadedWorkspace.title}${deviceSuffix} · ${tabCount} 个标签 · 保存于 ${formatDeferredDateTime(loadedWorkspace.createdAt)}`;
  const addForm = document.createElement("form");
  addForm.className = "workspace-add-form";
  const urlInput = document.createElement("input");
  urlInput.type = "url";
  urlInput.className = "workspace-add-url";
  urlInput.placeholder = "新增标签网址";
  urlInput.required = true;
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.className = "workspace-add-title";
  titleInput.placeholder = "标题（可选）";
  const addBtn = makeButton("添加", "button", "添加到工作区");
  addBtn.type = "submit";
  addForm.append(urlInput, titleInput, addBtn);
  addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;
    void addWorkspaceTab(url, titleInput.value.trim() || url);
    urlInput.value = "";
    titleInput.value = "";
  });
  const back = makeButton("返回当前", "button secondary", "返回当前看板");
  back.addEventListener("click", () => void returnToCurrent());
  workspaceHeader.append(info, addForm, back);
}

async function load(): Promise<void> {
  const boardTab = await chrome.tabs.getCurrent();
  const state = await send<BoardState>({ type: "get-board-state", windowId: boardTab?.windowId });
  currentState = state;
  const needsLogin = state.loginRequired || !state.user;
  loginRequired.classList.toggle("hidden", !needsLogin);
  boardContent.classList.toggle("hidden", needsLogin);
  if (needsLogin) {
    loginMessage.textContent = state.message || "请先登录后使用标签看板。";
    return;
  }
  renderScopeNav();
  renderWindowFilter(state);
  renderBoard(state);
  await renderDeferredTabs();
  await renderBoardStatistics();
}

function rebalanceGroupSegments(boardKey: BoardKey): void {
  if (!currentState) return;
  const cards = currentState.groups.filter((card) => card.boardKey === boardKey);
  if (cards.length <= 1) return;
  const template = cards[0];
  if (!template) return;
  const allTabs = cards.flatMap((card) => card.tabs);
  const segments = segmentTabs(allTabs).length ? segmentTabs(allTabs) : [[]];
  const existing = currentState.groups.filter((card) => card.boardKey !== boardKey);
  const rebuilt: BoardSegmentCard[] = segments.map((tabs, index) => ({
    ...template,
    tabs,
    segmentIndex: index,
    segmentCount: segments.length,
    heightUnits: heightUnitsForTabCount(tabs.length),
  }));
  currentState.groups = [...existing, ...rebuilt].sort((left, right) => {
    if (left.boardKey !== right.boardKey) return (left.rank ?? 0) - (right.rank ?? 0);
    return left.segmentIndex - right.segmentIndex;
  });
}

function applyOptimisticTabMove(tabId: number, targetBoardKey: BoardKey, position: "before" | "after" | "append", targetSegmentIndex: number, targetTabId?: number): void {
  if (!currentState) return;
  let movedTab: BoardSegmentCard["tabs"][number] | undefined;
  for (const card of currentState.groups) {
    const index = card.tabs.findIndex((tab) => tab.id === tabId);
    if (index >= 0) { [movedTab] = card.tabs.splice(index, 1); break; }
  }
  if (!movedTab) return;
  const targetCard = currentState.groups.find((card) => card.boardKey === targetBoardKey && card.segmentIndex === targetSegmentIndex);
  if (targetCard) {
    if (position === "append" || targetTabId === undefined) {
      targetCard.tabs.push(movedTab);
    } else {
      const targetIndex = targetCard.tabs.findIndex((tab) => tab.id === targetTabId);
      if (targetIndex < 0) { targetCard.tabs.push(movedTab); }
      else { targetCard.tabs.splice(position === "before" ? targetIndex : targetIndex + 1, 0, movedTab); }
    }
  }
  rebalanceGroupSegments(targetBoardKey);
}

async function moveTab(tabId: number, targetBoardKey: BoardKey, position: "before" | "after" | "append", targetSegmentIndex: number, targetTabId?: number): Promise<void> {
  if (!currentState) return;
  const snapshot = structuredClone(currentState);
  try {
    applyOptimisticTabMove(tabId, targetBoardKey, position, targetSegmentIndex, targetTabId);
    renderBoard(currentState);
    await send({ type: "move-board-tab", drop: { tabId, targetBoardKey, position, ...(targetTabId === undefined ? {} : { targetTabId }) } });
    showStatus("标签已移动");
  } catch (error) {
    currentState = snapshot;
    renderBoard(currentState);
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function activateTab(tabId: number): Promise<void> {
  try {
    await send({ type: "activate-board-tab", tabId });
  } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
}

async function closeTab(tabId: number): Promise<void> {
  try {
    await send({ type: "close-board-tab", tabId });
    showStatus("标签已关闭");
    await load();
  } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
}

function applyOptimisticGroupReorder(boardKey: BoardKey, targetBoardKey: BoardKey): void {
  if (!currentState) return;
  const groupMap = new Map<BoardKey, BoardSegmentCard>();
  for (const card of currentState.groups) {
    if (card.boardKey !== "ungrouped" && !groupMap.has(card.boardKey)) groupMap.set(card.boardKey, card);
  }
  const sorted = [...groupMap.values()].sort((left, right) => left.rank - right.rank);
  const sourceIndex = sorted.findIndex((group) => group.boardKey === boardKey);
  const targetIndex = sorted.findIndex((group) => group.boardKey === targetBoardKey);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
  const [moved] = sorted.splice(sourceIndex, 1);
  if (!moved) return;
  sorted.splice(targetIndex, 0, moved);
  const newRanks = new Map(sorted.map((group, index) => [group.boardKey, index + 1]));
  for (const card of currentState.groups) {
    const newRank = newRanks.get(card.boardKey);
    if (newRank !== undefined) card.rank = newRank;
  }
}

function computeManualGroupMove(boardKey: BoardKey, targetBoardKey: BoardKey): BoardLayout[] | null {
  if (!currentState || boardKey === targetBoardKey) return null;
  const layouts = currentState.layouts ?? [];
  const cards = boardCardsForDevice(currentState.groups.filter((card) => card.boardKey !== "ungrouped"), layouts, deviceClass());
  const placement = placeBoardCards(cards, laneCount(), false);
  const byKey = new Map(cards.filter((card) => card.segmentIndex === 0).map((card) => [card.boardKey, card]));
  if (!placement.placements.find((item) => item.boardKey === targetBoardKey)) return null;
  const moved = placement.placements.find((item) => item.boardKey === boardKey);
  if (!moved || !byKey.has(boardKey)) return null;
  const resolved = moveManualBoardCard(placement.placements, boardKey, targetBoardKey, laneCount());
  if (!resolved) return null;
  const originalByKey = new Map(placement.placements.filter((item) => item.segmentIndex === 0).map((item) => [item.boardKey, item]));
  return resolved.filter((item) => item.segmentIndex === 0).flatMap((item) => {
    const original = originalByKey.get(item.boardKey);
    const card = byKey.get(item.boardKey);
    return card && original && (item.lane !== original.lane || item.slot !== original.slot)
      ? [{ boardKey: item.boardKey, deviceClass: deviceClass(), rank: card.rank, autoFill: false as const, manualLane: item.lane, manualSlot: item.slot }]
      : [];
  });
}

function applyOptimisticManualLayouts(newLayouts: BoardLayout[]): void {
  if (!currentState) return;
  const layouts = currentState.layouts ?? [];
  const layoutMap = new Map(layouts.map((layout) => [`${layout.deviceClass}:${layout.boardKey}`, layout]));
  for (const layout of newLayouts) layoutMap.set(`${layout.deviceClass}:${layout.boardKey}`, layout);
  currentState.layouts = [...layoutMap.values()];
}

async function persistManualGroupMove(newLayouts: BoardLayout[]): Promise<void> {
  await Promise.all(newLayouts.map((layout) => send({ type: "save-board-layout", layout })));
}

async function moveGroup(boardKey: BoardKey, targetBoardKey: BoardKey, rank: number, automatic: boolean): Promise<void> {
  if (!currentState || boardKey === "ungrouped") return;
  const snapshot = structuredClone(currentState);
  try {
    if (automatic) {
      applyOptimisticGroupReorder(boardKey, targetBoardKey);
      renderBoard(currentState);
      await send({ type: "move-board-group", boardKey, rank });
      showStatus("分组顺序已保存");
    } else {
      const newLayouts = computeManualGroupMove(boardKey, targetBoardKey);
      if (newLayouts?.length) {
        applyOptimisticManualLayouts(newLayouts);
        renderBoard(currentState);
      }
      if (newLayouts?.length) await persistManualGroupMove(newLayouts);
      else if (!newLayouts) throw new Error("目标分组已变化，请刷新看板后重试");
      showStatus("手动位置已保存");
    }
  } catch (error) {
    currentState = snapshot;
    renderBoard(currentState);
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function deleteGroup(id: string): Promise<void> {
  try {
    await send({ type: "delete-board-group", id, confirmed: true });
    showStatus("自定义分组已删除");
    await load();
  } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
}

async function saveAutoFill(enabled: boolean): Promise<void> {
  if (!currentState) return;
  const cards = boardCardsForDevice(currentState.groups.filter((card) => card.boardKey !== "ungrouped"), currentState.layouts ?? [], deviceClass());
  const positions = placeBoardCards(cards, laneCount(), true);
  const groups = currentState.groups.filter((card) => card.boardKey !== "ungrouped" && card.segmentIndex === 0);
  try {
  await Promise.all(groups.flatMap((card) => {
    const position = positions.placements.find((item) => item.boardKey === card.boardKey && item.segmentIndex === 0);
    if (!position) return [];
    return [send({
      type: "save-board-layout",
      layout: enabled
        ? { boardKey: card.boardKey, deviceClass: deviceClass(), rank: card.rank, autoFill: true }
        : { boardKey: card.boardKey, deviceClass: deviceClass(), rank: card.rank, autoFill: false, manualLane: position.lane, manualSlot: position.slot },
    })];
  }));
    showStatus(enabled ? "已启用自动填充" : "已关闭自动填充");
    await load();
  } catch (error) {
    autoFill.checked = !enabled;
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function refresh(): Promise<void> {
  if (scopeMode === "workspace" && loadedWorkspace) await loadWorkspaceBoard(loadedWorkspace.id);
  else await load();
}

$("#refresh").addEventListener("click", () => void refresh().catch((error) => showStatus(String(error), true)));
reviewDuplicates.addEventListener("click", () => void openDuplicateReview());
openWorkspaces.addEventListener("click", () => void openWorkspaceDialog().catch((error) => showStatus(String(error), true)));
workspaceSelectAll.addEventListener("change", () => {
  for (const input of workspaceTabInputs()) input.checked = workspaceSelectAll.checked;
  syncWorkspaceSelectAll();
});
workspaceTabs.addEventListener("change", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.type === "checkbox") syncWorkspaceSelectAll();
});
closeWorkspaceDialog.addEventListener("click", () => workspaceDialog.close()); saveWorkspace.addEventListener("click", () => void saveCurrentWorkspace().catch((error) => showStatus(String(error), true))); workspaceName.addEventListener("input", clearWorkspaceNameError); workspaceDialog.addEventListener("close", clearWorkspaceNameError); confirmWorkspaceRestore.addEventListener("click", () => void restoreWorkspace().catch((error) => showStatus(String(error), true))); cancelWorkspaceRestore.addEventListener("click", () => workspaceRestoreDialog.close());
workspaceDeviceName.addEventListener("focus", () => { deviceNameOriginal = workspaceDeviceName.value; workspaceDeviceName.select(); });
workspaceDeviceName.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { workspaceDeviceName.value = deviceNameOriginal; workspaceDeviceName.blur(); event.preventDefault(); }
  else if (event.key === "Enter") { event.preventDefault(); workspaceDeviceName.blur(); }
});
workspaceDeviceName.addEventListener("blur", () => {
  const trimmed = workspaceDeviceName.value.trim();
  if (!trimmed) { workspaceDeviceName.value = deviceNameOriginal; return; }
  if (trimmed === deviceNameOriginal) return;
  void renameDevice(trimmed);
});
closeDuplicateReview.addEventListener("click", () => duplicateReviewDialog.close());
cancelDuplicateReview.addEventListener("click", () => duplicateReviewDialog.close());
confirmDuplicateReview.addEventListener("click", () => void closeReviewedDuplicates());
autoFill.addEventListener("change", () => void saveAutoFill(autoFill.checked));
boardSearch.addEventListener("input", () => { if (scopeMode === "workspace") renderWorkspaceBoard(); else if (currentState) renderBoard(currentState); });
windowFilter.addEventListener("change", () => currentState && renderBoard(currentState));
newGroupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    try {
      await send({ type: "create-board-group", title: newGroupTitle.value, color: newGroupColor.value });
      newGroupTitle.value = "";
      showStatus("自定义分组已创建");
      await load();
    } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
  })();
});

window.addEventListener("resize", () => {
  syncWorkspaceDialogResizeAnchor();
  if (currentState && !currentState.loginRequired) renderBoard(currentState);
});

async function revalidateBoardSession(): Promise<void> {
  try {
    const result = await send<{ user: { id: string; email?: string } | null; sync: { state: "ready" | "error"; message?: string } }>({ type: "restore-session" });
    if (!result.user) {
      loginRequired.classList.remove("hidden");
      boardContent.classList.add("hidden");
      loginMessage.textContent = "登录已过期，请重新登录。";
      return;
    }
    await load();
  } catch {
    // background re-validation is best-effort
  }
}

async function init(): Promise<void> {
  await load();
  if (currentState?.user) void revalidateBoardSession();
}

let boardRefreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleBoardRefresh(): void {
  if (scopeMode !== "current") return;
  if (boardRefreshTimer) clearTimeout(boardRefreshTimer);
  boardRefreshTimer = setTimeout(() => { boardRefreshTimer = null; void load().catch((error) => showStatus(error instanceof Error ? error.message : String(error), true)); }, 300);
}

chrome.tabs.onCreated.addListener(() => scheduleBoardRefresh());
chrome.tabs.onRemoved.addListener(() => scheduleBoardRefresh());
chrome.tabs.onUpdated.addListener(() => scheduleBoardRefresh());
chrome.tabs.onAttached.addListener(() => scheduleBoardRefresh());
chrome.tabs.onDetached.addListener(() => scheduleBoardRefresh());

void init().catch((error) => showStatus(error instanceof Error ? error.message : String(error), true));
