/**
 * Board page shell: page-level state, tab/group rendering, batch selection,
 * duplicate review, theme, keyboard navigation, and lifecycle wiring. Saved
 * workspaces live in board-workspace.ts and deferred reminders in
 * board-deferred.ts.
 */

import { i18n } from "./i18n.js";
import { boardCardsForDevice, boardTabMatchesQuery, DEFAULT_SETTINGS, getSiteKey, isBoardKey, moveBoardTabOptimistically, manualBoardGridRow, moveManualBoardCard, placeBoardCards, nextDeferredOccurrence, type BoardKey, type BoardLayout, type BoardSegmentCard, type DuplicateBoardTabGroup, type Settings, type Theme, type TimelineFilterRange } from "./shared.js";
import { $, boardToast, clearDropTarget, deviceClass, dragData, groupColor, laneCount, makeButton, send, showStatus } from "./board-dom.js";
import { renderTimelineView } from "./board-timeline.js";
import { closeRecentlyClosedDialog, openRecentlyClosed, renderRecentlyClosedList } from "./board-recently-closed.js";
import { getWorkspaceCards, initWorkspaceBoard, openSaveToWorkspaceMenu, refreshWorkspaceView, refreshWorkspacesCache, renderScopeNav, renderWorkspaceBoard, scopeMode, syncWorkspaceDialogResizeAnchor, wireWorkspaceBoard } from "./board-workspace.js";
import { deferTab, initDeferredBoard, openDeferMenu, renderBoardStatistics, renderDeferredTabs } from "./board-deferred.js";

interface BoardState {
  user: { id: string; email?: string } | null;
  loginRequired: boolean;
  message?: string;
  groups: BoardSegmentCard[];
  layouts?: BoardLayout[];
  settings?: Settings;
}

interface DuplicatePreview {
  groups: DuplicateBoardTabGroup[];
}

interface DuplicateCloseResult {
  closed: number;
  skipped: number;
}

const boardGrid = $<HTMLElement>("#board-grid");
const boardContent = $("#board-content");
const loginRequired = $("#login-required");
const loginMessage = $("#login-message");
const autoFill = $<HTMLInputElement>("#auto-fill");
const boardThemeToggle = $<HTMLButtonElement>("#board-theme-toggle");
const newGroupForm = $<HTMLFormElement>("#new-group-form");
const newGroupTitle = $<HTMLInputElement>("#new-group-title");
const newGroupColor = $<HTMLSelectElement>("#new-group-color");
const newGroupToggle = $<HTMLButtonElement>("#new-group-toggle");
const newGroupCancel = $<HTMLButtonElement>("#new-group-cancel");
const boardSearch = $<HTMLInputElement>("#board-search");
const windowFilter = $<HTMLSelectElement>("#window-filter");
const reviewDuplicates = $<HTMLButtonElement>("#review-duplicates");
const duplicateReviewDialog = $<HTMLDialogElement>("#duplicate-review-dialog");
const duplicateReviewSummary = $("#duplicate-review-summary");
const duplicateReviewList = $("#duplicate-review-list");
const closeDuplicateReview = $<HTMLButtonElement>("#close-duplicate-review");
const cancelDuplicateReview = $<HTMLButtonElement>("#cancel-duplicate-review");
const confirmDuplicateReview = $<HTMLButtonElement>("#confirm-duplicate-review");
const toggleSelectModeBtn = $<HTMLButtonElement>("#toggle-select-mode");
const exitSelectModeBtn = $<HTMLButtonElement>("#exit-select-mode");
const batchActionBar = $("#batch-action-bar");
const batchSelectAll = $<HTMLInputElement>("#batch-select-all");
const batchSelectedCount = $("#batch-selected-count");
const batchCloseBtn = $<HTMLButtonElement>("#batch-close-btn");
const batchDeferBtn = $<HTMLButtonElement>("#batch-defer-btn");
const batchMoveBtn = $<HTMLButtonElement>("#batch-move-btn");
const viewToggleBoard = $<HTMLButtonElement>("#view-toggle-board");
const viewToggleTimeline = $<HTMLButtonElement>("#view-toggle-timeline");
const timelineToolbar = $("#timeline-toolbar");
const timelineSort = $<HTMLSelectElement>("#timeline-sort");
const timelineFilter = $("#timeline-filter");
const recentlyClosedBtn = $<HTMLButtonElement>("#recently-closed-btn");
const recentlyClosedSearch = $<HTMLInputElement>("#recently-closed-search");
const closeRecentlyClosed = $<HTMLButtonElement>("#close-recently-closed");
const cancelRecentlyClosed = $<HTMLButtonElement>("#cancel-recently-closed");
const batchMoveDialog = $<HTMLDialogElement>("#batch-move-dialog");
const batchMoveList = $("#batch-move-list");
const closeBatchMove = $<HTMLButtonElement>("#close-batch-move");
const cancelBatchMove = $<HTMLButtonElement>("#cancel-batch-move");

let currentState: BoardState | null = null;
let duplicateGroups: DuplicateBoardTabGroup[] = [];
let selectMode = false;
const selectedTabIds = new Set<number>();
type ViewMode = "board" | "timeline";
let viewMode: ViewMode = "board";
const collapsedGroups = new Set<string>();
let currentWindowId: number | undefined;
let timelineFilterValue: TimelineFilterRange = "all";
let navFocusIndex = -1;
let navTabIds: number[] = [];
const COLLAPSED_STORAGE_KEY = "board_collapsed_groups";

async function loadCollapsedGroups(): Promise<void> {
  try {
    const data = await chrome.storage.local.get(COLLAPSED_STORAGE_KEY);
    const allData = data[COLLAPSED_STORAGE_KEY] as Record<string, string[]> | undefined;
    const stored = currentWindowId != null ? allData?.[String(currentWindowId)] : undefined;
    if (Array.isArray(stored)) {
      collapsedGroups.clear();
      stored.forEach((key) => collapsedGroups.add(key));
    }
  } catch {}
}

async function saveCollapsedGroups(): Promise<void> {
  try {
    const data = await chrome.storage.local.get(COLLAPSED_STORAGE_KEY);
    const allData = (data[COLLAPSED_STORAGE_KEY] as Record<string, string[]> | undefined) ?? {};
    if (currentWindowId != null) allData[String(currentWindowId)] = [...collapsedGroups];
    await chrome.storage.local.set({ [COLLAPSED_STORAGE_KEY]: allData });
  } catch {}
}

function toggleGroupCollapse(boardKey: string): void {
  if (collapsedGroups.has(boardKey)) collapsedGroups.delete(boardKey);
  else collapsedGroups.add(boardKey);
  void saveCollapsedGroups();
  if (viewMode === "board") rerenderBoardOrWorkspace();
}

function setSelectMode(on: boolean): void {
  selectMode = on;
  if (!on) selectedTabIds.clear();
  batchActionBar.classList.toggle("hidden", !on);
  toggleSelectModeBtn.classList.toggle("hidden", on);
  viewToggleBoard.disabled = on;
  viewToggleTimeline.disabled = on;
  if (viewMode === "board") rerenderBoardOrWorkspace();
  syncBatchActionBar();
}

function rerenderBoardOrWorkspace(): void {
  if (scopeMode === "workspace") renderWorkspaceBoard();
  else if (currentState) renderBoard(currentState);
}

function syncBatchActionBar(): void {
  const count = selectedTabIds.size;
  batchSelectedCount.textContent = i18n.t("selectedCount", [String(count)]);
  const allTabIds = getVisibleTabIds();
  batchSelectAll.checked = allTabIds.length > 0 && count === allTabIds.length;
  batchSelectAll.indeterminate = count > 0 && count < allTabIds.length;
  const hasSelection = count > 0;
  batchCloseBtn.disabled = !hasSelection;
  batchDeferBtn.disabled = !hasSelection;
  batchMoveBtn.disabled = !hasSelection;
}

function getVisibleTabIds(): number[] {
  // 工作区视图里卡片上的 tab id 是数组下标伪 id（shared.ts
  // groupWorkspaceTabsByDomain），并非真实浏览器标签 id；键盘（d/m/Enter）
  // 与批量操作一律只允许作用于真实标签，否则会把伪 id 当成真 id 关闭/激活
  // 不相关的真实标签页。
  if (scopeMode === "workspace") return [];
  const cards = currentState?.groups ?? [];
  const query = boardSearch.value;
  const windowId = windowFilter.value;
  return cards.flatMap((card) => card.tabs)
    .filter((tab) => boardTabMatchesQuery(tab, query) && (!windowId || String(tab.windowId) === windowId))
    .map((tab) => tab.id)
    .filter((id) => typeof id === "number" && id >= 0);
}

function toggleTabSelection(tabId: number, force?: boolean): void {
  const shouldSelect = force ?? !selectedTabIds.has(tabId);
  if (shouldSelect) selectedTabIds.add(tabId);
  else selectedTabIds.delete(tabId);
  syncBatchActionBar();
}

function setAllTabsSelection(selected: boolean): void {
  const ids = getVisibleTabIds();
  for (const id of ids) {
    if (selected) selectedTabIds.add(id);
    else selectedTabIds.delete(id);
  }
  syncBatchActionBar();
  if (viewMode === "board") rerenderBoardOrWorkspace();
}

async function batchCloseSelected(): Promise<void> {
  const ids = [...selectedTabIds];
  if (!ids.length) return;
  if (!window.confirm(i18n.t("confirmBatchClose", [String(ids.length)]))) return;
  try {
    const result = await send<{ closed: number; skipped: number }>({ type: "batch-close-tabs", tabIds: ids });
    const msg = typeof result === "object" && result && (result as { skipped?: number }).skipped
      ? i18n.t("closedDuplicatesSkipped", [String((result as { closed: number }).closed), String((result as { skipped: number }).skipped)])
      : i18n.t("closedDuplicates", [String(typeof result === "object" && result ? (result as { closed: number }).closed : ids.length)]);
    showStatus(msg);
    setSelectMode(false);
    await load();
  } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
}

async function batchDeferSelected(): Promise<void> {
  const ids = [...selectedTabIds];
  if (!ids.length) return;
  const time = (currentState?.settings?.deferredShortcutTimes ?? ["18:00"])[0]!;
  const dueAt = nextDeferredOccurrence(time).toISOString();
  try {
    const result = await send<{ deferred: number }>({ type: "batch-defer-tabs", tabIds: ids, dueAt });
    const count = typeof result === "object" && result ? (result as { deferred: number }).deferred : ids.length;
    showStatus(i18n.t("batchDeferredDone", [String(count)]) || i18n.t("addedToLater"));
    setSelectMode(false);
    await load();
  } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
}

function openBatchMoveDialog(): void {
  if (!selectedTabIds.size) return;
  if (!currentState) return;
  const groups = currentState.groups.filter((card) => card.segmentIndex === 0);
  batchMoveList.replaceChildren(...groups.map((card) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "batch-move-option";
    const swatch = document.createElement("span");
    swatch.className = "batch-move-swatch";
    swatch.style.background = groupColor(card.color);
    const title = document.createElement("span");
    title.textContent = card.title;
    const count = document.createElement("span");
    count.className = "segment";
    count.textContent = `${card.tabs.length} ${i18n.t("tabs")}`;
    btn.append(swatch, title, count);
    btn.addEventListener("click", () => {
      batchMoveDialog.close();
      void batchMoveSelectedTo(card.boardKey);
    });
    return btn;
  }));
  batchMoveDialog.showModal();
}

async function batchMoveSelectedTo(targetBoardKey: BoardKey): Promise<void> {
  const ids = [...selectedTabIds];
  if (!ids.length || !currentState) return;
  try {
    const result = await send<{ moved: number; notFound: number }>({ type: "batch-move-tabs-to-group", tabIds: ids, targetBoardKey });
    const moved = typeof result === "object" && result ? (result as { moved: number }).moved : ids.length;
    const notFound = typeof result === "object" && result ? (result as { notFound?: number }).notFound ?? 0 : 0;
    const msg = notFound > 0
      ? `${i18n.t("tabMoved")} (${i18n.t("batchMovedSkipped", [String(moved), String(notFound)]) || `${moved} 已移动，${notFound} 跳过`})`
      : i18n.t("tabMoved");
    showStatus(msg);
    setSelectMode(false);
    await load();
  } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
}

function setViewMode(mode: ViewMode): void {
  viewMode = mode;
  viewToggleBoard.setAttribute("aria-pressed", String(mode === "board"));
  viewToggleTimeline.setAttribute("aria-pressed", String(mode === "timeline"));
  boardGrid.classList.toggle("board-timeline", mode === "timeline");
  boardGrid.classList.toggle("board-grid", mode === "board");
  timelineToolbar.classList.toggle("hidden", mode !== "timeline");
  if (mode === "timeline") renderTimeline();
  else rerenderBoardOrWorkspace();
}

function renderTimeline(): Promise<void> {
  return renderTimelineView({
    cards: scopeMode === "workspace" ? getWorkspaceCards() : (currentState?.groups ?? []),
    query: boardSearch.value,
    windowId: windowFilter.value,
    sortBy: timelineSort.value,
    filter: timelineFilterValue,
    grid: boardGrid,
    groupColor,
    activate: activateTab,
  });
}


function rebuildNavOrder(): void {
  navTabIds = getVisibleTabIds();
  if (navFocusIndex >= navTabIds.length) navFocusIndex = navTabIds.length - 1;
  if (navFocusIndex < 0 && navTabIds.length > 0) navFocusIndex = 0;
}

function scrollNavIntoView(): void {
  if (navFocusIndex < 0 || !navTabIds.length) return;
  const tid = navTabIds[navFocusIndex];
  if (tid === undefined) return;
  if (viewMode === "board") {
    const row = boardGrid.querySelector<HTMLElement>(`.tab-row[data-tab-id="${tid}"]`);
    boardGrid.querySelectorAll(".tab-row.nav-focused").forEach((el) => el.classList.remove("nav-focused"));
    row?.classList.add("nav-focused");
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  } else {
    const rows = boardGrid.querySelectorAll<HTMLElement>(".timeline-row");
    rows.forEach((el) => el.classList.remove("nav-focused"));
    const target = Array.from(rows).find((r, i) => i === navFocusIndex);
    target?.classList.add("nav-focused");
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

async function navDeleteCurrent(): Promise<void> {
  rebuildNavOrder();
  if (navFocusIndex < 0 || !navTabIds.length) return;
  const tid = navTabIds[navFocusIndex];
  if (tid === undefined) return;
  await closeTab(tid);
}

function navMoveCurrent(): void {
  rebuildNavOrder();
  if (navFocusIndex < 0 || !navTabIds.length) return;
  const tid = navTabIds[navFocusIndex];
  if (tid === undefined) return;
  if (selectMode) return;
  setSelectMode(true);
  toggleTabSelection(tid, true);
  openBatchMoveDialog();
}

async function navDeferCurrent(): Promise<void> {
  rebuildNavOrder();
  if (navFocusIndex < 0 || !navTabIds.length) return;
  const tid = navTabIds[navFocusIndex];
  if (tid === undefined) return;
  const time = (currentState?.settings?.deferredShortcutTimes ?? ["18:00"])[0]!;
  const dueAt = nextDeferredOccurrence(time).toISOString();
  await deferTab(tid, dueAt);
}

function renderTab(tab: BoardSegmentCard["tabs"][number], targetBoardKey: BoardKey, targetSegmentIndex: number): HTMLElement {
  const row = document.createElement("div");
  row.className = "tab-row";
  if (selectMode) row.classList.add("select-mode");
  if (typeof tab.id === "number" && selectedTabIds.has(tab.id)) row.classList.add("selected");
  if (typeof tab.id === "number") row.dataset.tabId = String(tab.id);
  row.draggable = true;
  row.title = tab.url || tab.title;
  let checkbox: HTMLInputElement | null = null;
  if (selectMode && typeof tab.id === "number") {
    checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "tab-select-checkbox";
    checkbox.checked = selectedTabIds.has(tab.id);
    checkbox.setAttribute("aria-label", `${i18n.t("selectAllTabs")} ${tab.title}`);
    checkbox.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    checkbox.addEventListener("change", () => {
      if (checkbox) {
        toggleTabSelection(tab.id, checkbox.checked);
        row.classList.toggle("selected", checkbox.checked);
      }
    });
    row.append(checkbox);
  }
  const open = document.createElement("button");
  open.type = "button";
  open.className = "tab-open";
  open.setAttribute("aria-label", `${i18n.t("openTab")}${tab.title}`);
  const icon = document.createElement("img");
  icon.className = "tab-icon";
  icon.alt = "";
  icon.src = tab.favIconUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
  icon.classList.toggle("github-tab-icon", getSiteKey(tab.url) === "github.com");
  const titleEl = document.createElement("span");
  titleEl.className = "tab-title";
  titleEl.textContent = tab.title;
  open.append(icon, titleEl);
  open.addEventListener("click", (event) => {
    if (selectMode && typeof tab.id === "number") {
      event.preventDefault();
      event.stopPropagation();
      toggleTabSelection(tab.id);
      const nowSelected = selectedTabIds.has(tab.id);
      row.classList.toggle("selected", nowSelected);
      if (checkbox) checkbox.checked = nowSelected;
      return;
    }
    void activateTab(tab.id);
  });
  const saveToWorkspace = makeButton("+", "tab-saveworkspace", `${i18n.t("saveToWorkspace")}${tab.title}`);
  saveToWorkspace.addEventListener("click", (event) => { event.stopPropagation(); void openSaveToWorkspaceMenu(tab, saveToWorkspace); });
  saveToWorkspace.addEventListener("dragstart", (event) => { event.preventDefault(); event.stopPropagation(); });
  const close = makeButton("×", "tab-close", `${i18n.t("closeTab")}${tab.title}`);
  close.addEventListener("click", (event) => {
    event.stopPropagation();
    const card = row.closest(".group-card") as HTMLElement | null;
    const heading = card?.querySelector(".card-title") as HTMLElement | null;
    void closeTab(tab.id, heading ?? close);
  });
  close.addEventListener("dragstart", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  const defer = makeButton("◷", "tab-defer", `${i18n.t("deferTab")}${tab.title}`);
  defer.addEventListener("click", (event) => {
    event.stopPropagation();
    openDeferMenu(tab, defer);
  });
  row.append(saveToWorkspace, defer, close, open);
  row.addEventListener("click", (event) => {
    if (!selectMode || typeof tab.id !== "number") return;
    if (event.target instanceof Element && event.target.closest("button, input")) return;
    toggleTabSelection(tab.id);
    row.classList.toggle("selected", selectedTabIds.has(tab.id));
    const cb = row.querySelector<HTMLInputElement>(".tab-select-checkbox");
    if (cb) cb.checked = selectedTabIds.has(tab.id);
  });
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

function renderCard(card: BoardSegmentCard, rank: number, automatic: boolean, placement: { slot: number; compositeHeight: 1 | 2 }): HTMLElement {
  const article = document.createElement("article");
  article.className = "group-card";
  if (collapsedGroups.has(card.boardKey)) article.classList.add("collapsed");
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
  const collapseBtn = makeButton("▼", "icon-button group-collapse", i18n.t("toggleCollapse"));
  collapseBtn.textContent = collapsedGroups.has(card.boardKey) ? "▶" : "▼";
  collapseBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleGroupCollapse(card.boardKey);
  });
  heading.append(collapseBtn);
  const title = document.createElement("h2");
  title.textContent = card.title;
  heading.append(title);
  if (card.segmentCount > 1) {
    const segment = document.createElement("span");
    segment.className = "segment";
    segment.textContent = i18n.t("segment", [String(card.segmentIndex + 1), String(card.segmentCount)]);
    heading.append(segment);
  }
  if (card.kind === "custom" && card.segmentIndex === 0) {
    const tools = document.createElement("div");
    tools.className = "card-tools";
    const remove = makeButton("×", "icon-button danger", `${i18n.t("deleteGroup")} ${card.title}`);
    remove.addEventListener("click", () => {
      const id = card.boardKey.slice("custom:".length);
      if (!window.confirm(i18n.t("confirmDeleteGroup", [card.title]))) return;
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
    empty.textContent = i18n.t("dropTabsHere");
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
  windowFilter.replaceChildren(new Option(i18n.t("allWindows"), ""), ...[...windows.entries()].map(([windowId, label]) => new Option(label, String(windowId))));
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
    empty.textContent = i18n.t("noMatchingTabs");
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
  duplicateReviewSummary.textContent = closeCount ? i18n.t("duplicateSummary", [String(groups.length)]) : i18n.t("noDuplicates");
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
      badge.textContent = retained ? i18n.t("keep") : i18n.t("close");
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
  confirmDuplicateReview.textContent = closeCount ? i18n.t("closeDuplicateTabs", [String(closeCount)]) : i18n.t("noDuplicatesToClose");
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
    showStatus(result.skipped ? i18n.t("closedDuplicatesSkipped", [String(result.closed), String(result.skipped)]) : i18n.t("closedDuplicates", [String(result.closed)]));
    await load();
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
    confirmDuplicateReview.disabled = false;
  }
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  boardThemeToggle.setAttribute("aria-pressed", String(theme === "dark"));
}

async function load(): Promise<void> {
  const boardTab = await chrome.tabs.getCurrent();
  currentWindowId = boardTab?.windowId;
  const state = await send<BoardState>({ type: "get-board-state", windowId: boardTab?.windowId });
  currentState = state;
  applyTheme(state.settings?.theme ?? "light");
  const needsLogin = state.loginRequired || !state.user;
  loginRequired.classList.toggle("hidden", !needsLogin);
  boardContent.classList.toggle("hidden", needsLogin);
  if (needsLogin) {
    loginMessage.textContent = state.message || i18n.t("loginMessage");
    return;
  }
  await loadCollapsedGroups();
  renderScopeNav();
  renderWindowFilter(state);
  if (viewMode === "timeline") renderTimeline();
  else renderBoard(state);
  rebuildNavOrder();
  await renderDeferredTabs();
  await renderBoardStatistics();
  void refreshWorkspacesCache().catch(() => {});
}

async function moveTab(tabId: number, targetBoardKey: BoardKey, position: "before" | "after" | "append", targetSegmentIndex: number, targetTabId?: number): Promise<void> {
  if (!currentState) return;
  const snapshot = structuredClone(currentState);
  try {
    currentState.groups = moveBoardTabOptimistically(currentState.groups, { tabId, targetBoardKey, position, targetSegmentIndex, ...(targetTabId === undefined ? {} : { targetTabId }) });
    renderBoard(currentState);
    await send({ type: "move-board-tab", drop: { tabId, targetBoardKey, position, ...(targetTabId === undefined ? {} : { targetTabId }) } });
    showStatus(i18n.t("tabMoved"));
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

async function closeTab(tabId: number, anchor?: HTMLElement): Promise<void> {
  try {
    await send({ type: "close-board-tab", tabId });
    boardToast(i18n.t("tabClosed"), false, anchor);
  } catch (error) { boardToast(error instanceof Error ? error.message : String(error), true, anchor); }
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
      showStatus(i18n.t("groupOrderSaved"));
    } else {
      const newLayouts = computeManualGroupMove(boardKey, targetBoardKey);
      if (newLayouts?.length) {
        applyOptimisticManualLayouts(newLayouts);
        renderBoard(currentState);
      }
      if (newLayouts?.length) await persistManualGroupMove(newLayouts);
      else if (!newLayouts) throw new Error(i18n.t("targetGroupChanged"));
      showStatus(i18n.t("manualPositionSaved"));
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
    showStatus(i18n.t("customGroupDeleted"));
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
    showStatus(enabled ? i18n.t("autoFillEnabled") : i18n.t("autoFillDisabled"));
    await load();
  } catch (error) {
    autoFill.checked = !enabled;
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function saveBoardTheme(theme: Theme): Promise<void> {
  // 与 popup 同一约束：保存必须以当前设置为基数。currentState 尚未加载时
  // 先拉取，绝不能用 DEFAULT_SETTINGS 当基数——那会把云同步等字段静默重置。
  if (!currentState?.settings) await load();
  const current = { ...(currentState?.settings ?? DEFAULT_SETTINGS) };
  current.theme = theme;
  await send({ type: "update-settings", settings: current });
  applyTheme(theme);
  if (currentState) currentState.settings = current;
}

async function refresh(): Promise<void> {
  if (!(await refreshWorkspaceView())) await load();
}

$("#refresh").addEventListener("click", () => void refresh().catch((error) => showStatus(String(error), true)));
reviewDuplicates.addEventListener("click", () => void openDuplicateReview());
closeDuplicateReview.addEventListener("click", () => duplicateReviewDialog.close());
cancelDuplicateReview.addEventListener("click", () => duplicateReviewDialog.close());
confirmDuplicateReview.addEventListener("click", () => void closeReviewedDuplicates());
autoFill.addEventListener("change", () => void saveAutoFill(autoFill.checked));
boardThemeToggle.addEventListener("click", () => {
  const isDark = boardThemeToggle.getAttribute("aria-pressed") === "true";
  void saveBoardTheme(isDark ? "light" : "dark").catch((error) => {
    applyTheme(isDark ? "light" : "dark");
    showStatus(error instanceof Error ? error.message : String(error), true);
  });
});
boardSearch.addEventListener("input", () => {
  if (viewMode === "timeline") renderTimeline();
  else if (scopeMode === "workspace") renderWorkspaceBoard();
  else if (currentState) renderBoard(currentState);
  rebuildNavOrder();
});
windowFilter.addEventListener("change", () => {
  if (viewMode === "timeline") renderTimeline();
  else if (currentState) renderBoard(currentState);
  rebuildNavOrder();
});
toggleSelectModeBtn.addEventListener("click", () => setSelectMode(true));
exitSelectModeBtn.addEventListener("click", () => setSelectMode(false));
batchSelectAll.addEventListener("change", () => setAllTabsSelection(batchSelectAll.checked));
batchCloseBtn.addEventListener("click", () => void batchCloseSelected());
batchDeferBtn.addEventListener("click", () => void batchDeferSelected());
batchMoveBtn.addEventListener("click", openBatchMoveDialog);
closeBatchMove.addEventListener("click", () => batchMoveDialog.close());
cancelBatchMove.addEventListener("click", () => batchMoveDialog.close());
viewToggleBoard.addEventListener("click", () => { if (!selectMode) setViewMode("board"); });
viewToggleTimeline.addEventListener("click", () => { if (!selectMode) setViewMode("timeline"); });
timelineSort.addEventListener("change", renderTimeline);
timelineFilter.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest(".timeline-filter-btn") as HTMLElement | null;
  if (!btn) return;
  timelineFilterValue = (btn.dataset.filter ?? "all") as TimelineFilterRange;
  timelineFilter.querySelectorAll(".timeline-filter-btn").forEach((el) => el.classList.toggle("active", el === btn));
  renderTimeline();
});
recentlyClosedBtn.addEventListener("click", () => void openRecentlyClosed());
recentlyClosedSearch.addEventListener("input", (event) => renderRecentlyClosedList((event.target as HTMLInputElement).value));
closeRecentlyClosed.addEventListener("click", closeRecentlyClosedDialog);
cancelRecentlyClosed.addEventListener("click", closeRecentlyClosedDialog);
document.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  rebuildNavOrder();
  switch (event.key.toLowerCase()) {
    case "j":
      event.preventDefault();
      if (navTabIds.length === 0) return;
      navFocusIndex = navFocusIndex + 1 >= navTabIds.length ? 0 : navFocusIndex + 1;
      scrollNavIntoView();
      break;
    case "k":
      event.preventDefault();
      if (navTabIds.length === 0) return;
      navFocusIndex = navFocusIndex - 1 < 0 ? navTabIds.length - 1 : navFocusIndex - 1;
      scrollNavIntoView();
      break;
    case "d":
      event.preventDefault();
      if (navFocusIndex >= 0 && navTabIds.length > 0) {
        if (selectMode) {
          const tid = navTabIds[navFocusIndex];
          if (tid !== undefined) {
            toggleTabSelection(tid);
            if (viewMode === "board") rerenderBoardOrWorkspace();
          }
        } else {
          void navDeleteCurrent();
        }
      }
      break;
    case "m":
      event.preventDefault();
      if (navFocusIndex >= 0 && navTabIds.length > 0) {
        if (selectMode) {
          const tid = navTabIds[navFocusIndex];
          if (tid !== undefined) void navDeferCurrent().catch(() => {});
        } else {
          navMoveCurrent();
        }
      }
      break;
    case "escape":
      if (selectMode) {
        event.preventDefault();
        setSelectMode(false);
      }
      break;
    case "enter":
      event.preventDefault();
      if (navFocusIndex >= 0 && navTabIds.length > 0 && !selectMode) {
        const tid = navTabIds[navFocusIndex];
        if (tid !== undefined) void activateTab(tid);
      }
      break;
  }
});
newGroupToggle.addEventListener("click", () => {
  newGroupToggle.classList.add("hidden");
  newGroupForm.classList.remove("hidden");
  newGroupTitle.focus();
});
newGroupCancel.addEventListener("click", () => {
  newGroupForm.classList.add("hidden");
  newGroupToggle.classList.remove("hidden");
  newGroupTitle.value = "";
});
newGroupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    try {
      await send({ type: "create-board-group", title: newGroupTitle.value, color: newGroupColor.value });
      newGroupTitle.value = "";
      newGroupForm.classList.add("hidden");
      newGroupToggle.classList.remove("hidden");
      showStatus(i18n.t("customGroupCreated"));
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
      loginMessage.textContent = i18n.t("loginExpired");
      return;
    }
    await load();
  } catch {
    // background re-validation is best-effort
  }
}

async function init(): Promise<void> {
  await i18n.initFromStorage();
  i18n.applyI18n();
  await load();
  if (currentState?.user) void revalidateBoardSession();
}

let boardRefreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleBoardRefresh(): void {
  if (scopeMode === "workspace") return;
  if (boardRefreshTimer) clearTimeout(boardRefreshTimer);
  boardRefreshTimer = setTimeout(() => { boardRefreshTimer = null; void load().catch((error) => showStatus(error instanceof Error ? error.message : String(error), true)); }, 300);
}

chrome.tabs.onCreated.addListener(() => scheduleBoardRefresh());
chrome.tabs.onRemoved.addListener(() => scheduleBoardRefresh());
chrome.tabs.onUpdated.addListener(() => scheduleBoardRefresh());
chrome.tabs.onAttached.addListener(() => scheduleBoardRefresh());
chrome.tabs.onDetached.addListener(() => scheduleBoardRefresh());

initWorkspaceBoard({
  getGroups: () => currentState?.groups ?? [],
  reload: load,
  isSelectMode: () => selectMode,
  isTimelineView: () => viewMode === "timeline",
  setSelectMode,
  setViewMode,
});
initDeferredBoard({
  reload: load,
  isWorkspaceScope: () => scopeMode === "workspace",
  shortcutTimes: () => currentState?.settings?.deferredShortcutTimes ?? ["09:00", "14:00", "18:00"],
});
wireWorkspaceBoard();

void init().catch((error) => showStatus(error instanceof Error ? error.message : String(error), true));
