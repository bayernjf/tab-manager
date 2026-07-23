import { boardCardsForDevice, boardTabMatchesQuery, getSiteKey, isBoardKey, manualBoardGridRow, moveManualBoardCard, placeBoardCards, isDeferredTabDue, type BoardKey, type BoardLayout, type BoardSegmentCard, type DeferredTab, type DuplicateBoardTabGroup, type GroupColor, type WorkspaceSnapshot, type WorkspaceTab } from "./shared.js";

interface BoardState {
  user: { id: string; email?: string } | null;
  loginRequired: boolean;
  message?: string;
  groups: BoardSegmentCard[];
  layouts?: BoardLayout[];
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
const openWorkspaces = $<HTMLButtonElement>("#open-workspaces"), workspaceDialog = $<HTMLDialogElement>("#workspace-dialog"), workspaceName = $<HTMLInputElement>("#workspace-name"), workspaceTabs = $("#workspace-tabs"), saveWorkspace = $<HTMLButtonElement>("#save-workspace"), workspaceList = $("#workspace-list"), closeWorkspaceDialog = $<HTMLButtonElement>("#close-workspace-dialog"), workspaceRestoreDialog = $<HTMLDialogElement>("#workspace-restore-dialog"), workspaceRestoreSummary = $("#workspace-restore-summary"), workspaceRestoreList = $("#workspace-restore-list"), confirmWorkspaceRestore = $<HTMLButtonElement>("#confirm-workspace-restore"), cancelWorkspaceRestore = $<HTMLButtonElement>("#cancel-workspace-restore");
const deferredReminders = $("#deferred-reminders"), deferredList = $("#deferred-list");
const boardStatistics = $("#board-statistics");

let currentState: BoardState | null = null;
let duplicateGroups: DuplicateBoardTabGroup[] = [];
let workspaces: WorkspaceSnapshot[] = [], restoreWorkspaceId: string | null = null;

async function send<T>(message: unknown): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as T & BoardResponse;
  if (response?.error) throw new Error(response.error);
  return response;
}

function showStatus(message: string, error = false): void {
  status.textContent = message;
  status.className = error ? "status error" : "status";
}

async function loadWorkspaces(): Promise<void> { workspaces = (await send<{ workspaces: WorkspaceSnapshot[] }>({ type: "get-workspaces" })).workspaces; renderWorkspaces(); }
function renderWorkspaces(): void {
  workspaceList.replaceChildren(...workspaces.map((workspace) => { const row = document.createElement("div"); row.className = "workspace-row"; const name = document.createElement("span"); name.textContent = `${workspace.title} · ${workspace.tabs.length} 个标签`; const restore = makeButton("恢复", "button secondary", `恢复 ${workspace.title}`); restore.addEventListener("click", () => void previewWorkspaceRestore(workspace.id)); const remove = makeButton("删除", "icon-button danger", `删除 ${workspace.title}`); remove.addEventListener("click", () => void deleteWorkspace(workspace.id)); row.append(name, restore, remove); return row; }));
}
function renderWorkspaceTabs(): void { const tabs = currentState?.groups.flatMap((group) => group.tabs).filter((tab): tab is typeof tab & { url: string } => Boolean(tab.url)); workspaceTabs.replaceChildren(...(tabs ?? []).map((tab) => { const label = document.createElement("label"); const input = document.createElement("input"); input.type = "checkbox"; input.checked = true; input.value = String(tab.id); input.dataset.title = tab.title; input.dataset.url = tab.url; label.append(input, document.createTextNode(tab.title)); return label; })); }
async function openWorkspaceDialog(): Promise<void> { renderWorkspaceTabs(); await loadWorkspaces(); workspaceDialog.showModal(); }
async function saveCurrentWorkspace(): Promise<void> { const tabs: WorkspaceTab[] = Array.from(workspaceTabs.querySelectorAll<HTMLInputElement>("input:checked")).map((input) => ({ title: input.dataset.title ?? "未命名标签页", url: input.dataset.url ?? "" })); await send({ type: "save-workspace", title: workspaceName.value, tabs }); workspaceName.value = ""; await loadWorkspaces(); showStatus("工作区已保存"); }
async function previewWorkspaceRestore(id: string): Promise<void> { const result = await send<{ preview: { tabs: WorkspaceTab[]; unavailableCount: number } }>({ type: "get-workspace-restore-preview", id }); restoreWorkspaceId = id; workspaceRestoreSummary.textContent = `将打开 ${result.preview.tabs.length} 个标签${result.preview.unavailableCount ? `，跳过 ${result.preview.unavailableCount} 个不可用页面` : ""}`; workspaceRestoreList.replaceChildren(...result.preview.tabs.map((tab) => { const item = document.createElement("p"); item.textContent = tab.title; return item; })); workspaceRestoreDialog.showModal(); }
async function restoreWorkspace(): Promise<void> { if (!restoreWorkspaceId) return; const tab = await chrome.tabs.getCurrent(); const result = await send<{ created: number }>({ type: "restore-workspace", id: restoreWorkspaceId, windowId: tab?.windowId, confirmed: true }); workspaceRestoreDialog.close(); showStatus(`已打开 ${result.created} 个标签`); }
async function deleteWorkspace(id: string): Promise<void> { await send({ type: "delete-workspace", id }); await loadWorkspaces(); }

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

function dragData(event: DragEvent, type: "board-tab" | "board-group", value: string): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(type, value);
}

function clearDropTarget(event: DragEvent): void {
  event.currentTarget instanceof HTMLElement && event.currentTarget.classList.remove("drop-target");
}

function renderTab(tab: BoardSegmentCard["tabs"][number], targetBoardKey: BoardKey): HTMLElement {
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
  if (tab.isCurrentWindow) {
    const current = document.createElement("span");
    current.className = "tab-current";
    current.textContent = "当前";
    open.append(current);
  }
  if (tab.windowLabel) {
    const windowLabel = document.createElement("span");
    windowLabel.className = "tab-window";
    windowLabel.textContent = tab.windowLabel;
    open.append(windowLabel);
  }
  open.addEventListener("click", () => void activateTab(tab.id));
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
  defer.addEventListener("click", (event) => { event.stopPropagation(); const dueAt = window.prompt("提醒时间（例如 2026-07-24T09:00）", ""); if (dueAt) void deferTab(tab.id, dueAt); });
  row.append(defer, close, open);
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
    void moveTab(tabId, targetBoardKey, position, tab.id);
  });
  return row;
}

async function deferTab(tabId: number, dueAt: string): Promise<void> { try { await send({ type: "defer-board-tab", tabId, dueAt: new Date(dueAt).toISOString() }); showStatus("已加入稍后处理"); await load(); } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); } }
async function renderDeferredTabs(): Promise<void> { const tabs = (await send<{ tabs: DeferredTab[] }>({ type: "get-deferred-tabs" })).tabs.filter((tab) => isDeferredTabDue(tab)); deferredReminders.classList.toggle("hidden", tabs.length === 0); deferredList.replaceChildren(...tabs.map((tab) => { const row = document.createElement("div"); row.className = "deferred-row"; const title = document.createElement("span"); title.textContent = tab.title; const open = makeButton("打开", "button secondary", `打开 ${tab.title}`); open.addEventListener("click", async () => { const current = await chrome.tabs.getCurrent(); await send({ type: "open-deferred-tab", id: tab.id, windowId: current?.windowId }); }); const remove = makeButton("删除", "icon-button danger", `删除 ${tab.title}`); remove.addEventListener("click", async () => { await send({ type: "delete-deferred-tab", id: tab.id }); await renderDeferredTabs(); }); row.append(title, open, remove); return row; })); }
async function renderBoardStatistics(): Promise<void> { const stats = await send<{ eligibleTabCount: number; duplicateTabCount: number; dueDeferredCount: number }>({ type: "get-board-statistics" }); boardStatistics.replaceChildren(...[["网页标签", stats.eligibleTabCount], ["重复页面", stats.duplicateTabCount], ["待恢复提醒", stats.dueDeferredCount]].map(([label, value]) => { const card = document.createElement("div"); const number = document.createElement("strong"); number.textContent = String(value); const text = document.createElement("span"); text.textContent = String(label); card.append(number, text); return card; })); }

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
    void moveTab(tabId, card.boardKey, "append");
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
  if (card.tabs.length) tabs.append(...card.tabs.map((tab) => renderTab(tab, card.boardKey)));
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
  renderWindowFilter(state);
  renderBoard(state);
  await renderDeferredTabs();
  await renderBoardStatistics();
}

async function moveTab(tabId: number, targetBoardKey: BoardKey, position: "before" | "after" | "append", targetTabId?: number): Promise<void> {
  try {
    await send({ type: "move-board-tab", drop: { tabId, targetBoardKey, position, ...(targetTabId === undefined ? {} : { targetTabId }) } });
    showStatus("标签已移动");
    await load();
  } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
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

async function moveGroup(boardKey: BoardKey, targetBoardKey: BoardKey, rank: number, automatic: boolean): Promise<void> {
  if (!currentState || boardKey === "ungrouped") return;
  try {
    if (automatic) {
      await send({ type: "move-board-group", boardKey, rank });
      showStatus("分组顺序已保存");
    } else {
      await saveManualGroupPosition(boardKey, targetBoardKey);
      showStatus("手动位置已保存");
    }
    await load();
  } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
}

async function saveManualGroupPosition(boardKey: BoardKey, targetBoardKey: BoardKey): Promise<void> {
  if (!currentState || boardKey === targetBoardKey) return;
  const layouts = currentState.layouts ?? [];
  const cards = boardCardsForDevice(currentState.groups.filter((card) => card.boardKey !== "ungrouped"), layouts, deviceClass());
  const placement = placeBoardCards(cards, laneCount(), false);
  const byKey = new Map(cards.filter((card) => card.segmentIndex === 0).map((card) => [card.boardKey, card]));
  const targetPlacement = placement.placements.find((item) => item.boardKey === targetBoardKey);
  if (!targetPlacement) throw new Error("目标分组已变化，请刷新看板后重试");
  const moved = placement.placements.find((item) => item.boardKey === boardKey);
  if (!moved || !byKey.has(boardKey)) throw new Error("分组已变化，请刷新看板后重试");
  const resolved = moveManualBoardCard(placement.placements, boardKey, targetBoardKey, laneCount());
  if (!resolved) throw new Error("目标分组已变化，请刷新看板后重试");
  const originalByKey = new Map(placement.placements.filter((item) => item.segmentIndex === 0).map((item) => [item.boardKey, item]));
  await Promise.all(resolved.filter((item) => item.segmentIndex === 0).flatMap((item) => {
    const original = originalByKey.get(item.boardKey);
    const card = byKey.get(item.boardKey);
    return card && original && (item.lane !== original.lane || item.slot !== original.slot)
      ? [send({ type: "save-board-layout", layout: { boardKey: item.boardKey, deviceClass: deviceClass(), rank: card.rank, autoFill: false, manualLane: item.lane, manualSlot: item.slot } })]
      : [];
  }));
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

$("#refresh").addEventListener("click", () => void load().catch((error) => showStatus(String(error), true)));
reviewDuplicates.addEventListener("click", () => void openDuplicateReview());
openWorkspaces.addEventListener("click", () => void openWorkspaceDialog().catch((error) => showStatus(String(error), true)));
closeWorkspaceDialog.addEventListener("click", () => workspaceDialog.close()); saveWorkspace.addEventListener("click", () => void saveCurrentWorkspace().catch((error) => showStatus(String(error), true))); confirmWorkspaceRestore.addEventListener("click", () => void restoreWorkspace().catch((error) => showStatus(String(error), true))); cancelWorkspaceRestore.addEventListener("click", () => workspaceRestoreDialog.close());
closeDuplicateReview.addEventListener("click", () => duplicateReviewDialog.close());
cancelDuplicateReview.addEventListener("click", () => duplicateReviewDialog.close());
confirmDuplicateReview.addEventListener("click", () => void closeReviewedDuplicates());
autoFill.addEventListener("change", () => void saveAutoFill(autoFill.checked));
boardSearch.addEventListener("input", () => currentState && renderBoard(currentState));
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
  if (currentState && !currentState.loginRequired) renderBoard(currentState);
});

void load().catch((error) => showStatus(error instanceof Error ? error.message : String(error), true));
