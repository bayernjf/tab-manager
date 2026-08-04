import { i18n } from "./i18n.js";
import { boardCardsForDevice, boardTabMatchesQuery, formatDeferredDateTime, getSiteKey, heightUnitsForTabCount, isBoardKey, manualBoardGridRow, moveManualBoardCard, nextDeferredOccurrence, placeBoardCards, isDeferredTabDue, matchesTimelineFilter, segmentTabs, validateWorkspaceTitle, DEFAULT_SETTINGS, type BoardKey, type BoardLayout, type BoardSegmentCard, type BoardTab, type DeferredTab, type DuplicateBoardTabGroup, type GroupColor, type Settings, type Theme, type TimelineFilterRange, type WorkspaceSnapshot, type WorkspaceTab, type WorkspaceHistory, type WorkspaceVersion, type WorkspacePortableData } from "./shared.js";

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
const openWorkspaces = $<HTMLButtonElement>("#open-workspaces"), workspaceDialog = $<HTMLDialogElement>("#workspace-dialog"), workspaceName = $<HTMLInputElement>("#workspace-name"), workspaceNameError = $<HTMLElement>("#workspace-name-error"), workspaceSelectAll = $<HTMLInputElement>("#workspace-select-all"), workspaceTabs = $("#workspace-tabs"), saveWorkspace = $<HTMLButtonElement>("#save-workspace"), workspaceDeviceName = $<HTMLInputElement>("#workspace-device-name"), workspaceList = $("#workspace-list"), closeWorkspaceDialog = $<HTMLButtonElement>("#close-workspace-dialog"), workspaceRestoreDialog = $<HTMLDialogElement>("#workspace-restore-dialog"), workspaceRestoreSummary = $("#workspace-restore-summary"), workspaceRestoreList = $("#workspace-restore-list"), confirmWorkspaceRestore = $<HTMLButtonElement>("#confirm-workspace-restore"), cancelWorkspaceRestore = $<HTMLButtonElement>("#cancel-workspace-restore");
const lastTabConfirmDialog = $<HTMLDialogElement>("#last-tab-confirm-dialog");
const cancelLastTabConfirm = $<HTMLButtonElement>("#cancel-last-tab-confirm");
const confirmLastTabConfirm = $<HTMLButtonElement>("#confirm-last-tab-confirm");
const deferredReminders = $("#deferred-reminders"), deferredList = $("#deferred-list");
const boardStatsInline = $("#board-stats-inline");
const scopeNav = $("#scope-nav");
const workspaceHeader = $("#workspace-header");
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
const recentlyClosedDialog = $<HTMLDialogElement>("#recently-closed-dialog");
const recentlyClosedList = $("#recently-closed-list");
const recentlyClosedSearch = $<HTMLInputElement>("#recently-closed-search");
const closeRecentlyClosed = $<HTMLButtonElement>("#close-recently-closed");
const cancelRecentlyClosed = $<HTMLButtonElement>("#cancel-recently-closed");
const batchMoveDialog = $<HTMLDialogElement>("#batch-move-dialog");
const batchMoveList = $("#batch-move-list");
const closeBatchMove = $<HTMLButtonElement>("#close-batch-move");
const cancelBatchMove = $<HTMLButtonElement>("#cancel-batch-move");
const exportWorkspacesBtn = $<HTMLButtonElement>("#export-workspaces");
const importWorkspacesInput = $<HTMLInputElement>("#import-workspaces-input");
const workspaceImportPreviewDialog = $<HTMLDialogElement>("#workspace-import-preview-dialog");
const workspaceImportPreviewSummary = $("#workspace-import-preview-summary");
const workspaceImportPreviewList = $("#workspace-import-preview-list");
const closeWorkspaceImportPreview = $<HTMLButtonElement>("#close-workspace-import-preview");
const cancelWorkspaceImportPreview = $<HTMLButtonElement>("#cancel-workspace-import-preview");
const confirmWorkspaceImportPreview = $<HTMLButtonElement>("#confirm-workspace-import-preview");
const workspaceHistoryDialog = $<HTMLDialogElement>("#workspace-history-dialog");
const workspaceHistoryTitle = $("#workspace-history-title");
const workspaceHistoryList = $("#workspace-history-list");
const closeWorkspaceHistory = $<HTMLButtonElement>("#close-workspace-history");
const saveWorkspaceVersionBtn = $<HTMLButtonElement>("#save-workspace-version");

interface WorkspaceImportPreview {
  workspaceCount: number;
  totalTabs: number;
}

let currentState: BoardState | null = null;
let duplicateGroups: DuplicateBoardTabGroup[] = [];
let workspaces: WorkspaceSnapshot[] = [], restoreWorkspaceId: string | null = null, restoreWorkspaceTabs: WorkspaceTab[] | null = null;
let currentDevice: { id: string; name: string } | null = null;
let deviceNameOriginal = "";
type ScopeMode = "current" | "workspace";
let scopeMode: ScopeMode = "current";
let loadedWorkspace: { id: string; title: string; createdAt: string; deviceName?: string } | null = null;
let workspaceCards: BoardSegmentCard[] = [];
const WORKSPACE_DIALOG_VIEWPORT_MARGIN = 16;
const WORKSPACE_DIALOG_MOBILE_MAX_WIDTH = 640;
let selectMode = false;
const selectedTabIds = new Set<number>();
type ViewMode = "board" | "timeline";
let viewMode: ViewMode = "board";
const collapsedGroups = new Set<string>();
let currentWindowId: number | undefined;
let timelineFilterValue: TimelineFilterRange = "all";
let recentlyClosedItems: { tab: NonNullable<chrome.sessions.Session["tab"]> & { sessionId?: string }; time: number }[] = [];
let navFocusIndex = -1;
let navTabIds: number[] = [];
const COLLAPSED_STORAGE_KEY = "board_collapsed_groups";
let historyWorkspaceId: string | null = null;
let historyWorkspaceTitle: string = "";
let currentHistory: WorkspaceHistory | null = null;

async function send<T>(message: unknown): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as T & BoardResponse;
  if (response?.error) throw new Error(response.error);
  return response;
}

function showStatus(message: string, error = false): void {
  boardToast(message, error);
}

function boardToast(message: string, error = false, anchor?: HTMLElement): HTMLParagraphElement {
  const toast = document.createElement("p");
  toast.className = `board-toast ${error ? "error" : "success"}`;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = message;
  document.body.append(toast);
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    const margin = 6;
    toast.style.maxWidth = `${Math.min(280, window.innerWidth - margin * 2)}px`;
    const toastWidth = toast.offsetWidth;
    const isCardHeading = anchor.classList.contains("card-title") || anchor.closest(".card-title") !== null;
    let left: number;
    if (isCardHeading) {
      left = Math.max(margin, Math.min(rect.left + rect.width / 2 - toastWidth / 2, window.innerWidth - toastWidth - margin));
    } else {
      left = Math.max(margin, Math.min(rect.right - toastWidth, window.innerWidth - toastWidth - margin));
    }
    const top = Math.max(margin, rect.top - toast.offsetHeight - 4);
    toast.style.top = `${top}px`;
    toast.style.left = `${left}px`;
  } else {
    toast.style.top = "20px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
  }
  window.setTimeout(() => { toast.remove(); }, 2200);
  return toast;
}

async function refreshWorkspacesCache(): Promise<void> { const result = await send<{ workspaces: WorkspaceSnapshot[]; device: { id: string; name: string } }>({ type: "get-workspaces" }); workspaces = result.workspaces; currentDevice = result.device; }
async function loadWorkspaces(): Promise<void> { await refreshWorkspacesCache(); if (!currentDevice) return; workspaceDeviceName.value = currentDevice.name; deviceNameOriginal = currentDevice.name; renderWorkspaces(); }

async function loadCollapsedGroups(): Promise<void> {
  try {
    const data = await chrome.storage.local.get(COLLAPSED_STORAGE_KEY);
    const stored = data[COLLAPSED_STORAGE_KEY] as string[] | undefined;
    if (Array.isArray(stored)) {
      collapsedGroups.clear();
      stored.forEach((key) => collapsedGroups.add(key));
    }
  } catch {}
}

async function saveCollapsedGroups(): Promise<void> {
  try {
    await chrome.storage.local.set({ [COLLAPSED_STORAGE_KEY]: [...collapsedGroups] });
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
  const cards = scopeMode === "workspace" ? workspaceCards : (currentState?.groups ?? []);
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

interface TimelineTabItem {
  tab: BoardTab;
  groupTitle: string;
  groupColor: GroupColor;
  createdAt?: number;
  dueAt?: string;
  isDeferred?: boolean;
  deferredId?: string;
}

async function renderTimeline(): Promise<void> {
  const cards = scopeMode === "workspace" ? workspaceCards : (currentState?.groups ?? []);
  const query = boardSearch.value;
  const windowId = windowFilter.value;
  const sortBy = timelineSort.value as "created" | "due";
  const items: TimelineTabItem[] = [];
  for (const card of cards) {
    for (const tab of card.tabs) {
      if (!boardTabMatchesQuery(tab, query)) continue;
      if (windowId && String(tab.windowId) !== windowId) continue;
      items.push({
        tab,
        groupTitle: card.title,
        groupColor: card.color,
        createdAt: tab.createdAt,
        dueAt: undefined,
      });
    }
  }
  if (sortBy === "due") {
    try {
      const deferred = (await send<{ tabs: DeferredTab[] }>({ type: "get-deferred-tabs" })).tabs;
      for (const dt of deferred) {
        const matchUrl = dt.url && (!query || dt.title.toLowerCase().includes(query.toLowerCase()) || dt.url.toLowerCase().includes(query.toLowerCase()));
        if (query && !matchUrl) continue;
        items.push({
          tab: { id: -1, title: dt.title, url: dt.url, favIconUrl: dt.favIconUrl } as BoardTab,
          groupTitle: i18n.t("deferredReminders"),
          groupColor: "blue" as GroupColor,
          createdAt: Date.parse(dt.createdAt),
          dueAt: dt.dueAt,
          isDeferred: true,
          deferredId: dt.id,
        });
      }
    } catch {
      // If the deferred tabs request fails (e.g. not logged in), keep the
      // current tabs visible in the timeline and skip the reminder rows.
    }
  }
  const now = Date.now();
  const filtered = items.filter((item) => {
    const refDate = sortBy === "due" && item.dueAt ? Date.parse(item.dueAt) : item.createdAt ?? 0;
    return matchesTimelineFilter(refDate, timelineFilterValue, now);
  });
  filtered.sort((a, b) => {
    if (sortBy === "due") {
      const ad = a.dueAt ? Date.parse(a.dueAt) : Number.MAX_SAFE_INTEGER;
      const bd = b.dueAt ? Date.parse(b.dueAt) : Number.MAX_SAFE_INTEGER;
      return ad - bd;
    }
    const ac = a.createdAt ?? 0;
    const bc = b.createdAt ?? 0;
    return bc - ac;
  });
  const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
  if (!filtered.length) {
    boardGrid.className = "board-timeline";
    boardGrid.replaceChildren(Object.assign(document.createElement("p"), { className: "empty board-empty", textContent: i18n.t("noMatchingTabs") }));
    return;
  }
  boardGrid.className = "board-timeline";
  boardGrid.replaceChildren(...filtered.map((item) => {
    const row = document.createElement("div");
    row.className = "timeline-row";
    const time = document.createElement("span");
    time.className = "timeline-time";
    if (sortBy === "due") {
      time.textContent = item.dueAt ? formatDeferredDateTime(item.dueAt) : i18n.t("noDueReminder");
    } else {
      time.textContent = item.createdAt ? new Date(item.createdAt).toLocaleString() : i18n.t("unknownCreatedAt");
    }
    const group = document.createElement("span");
    group.className = "timeline-group";
    group.style.background = groupColor(item.groupColor) + "33";
    group.style.color = groupColor(item.groupColor);
    group.textContent = item.groupTitle;
    const icon = document.createElement("img");
    icon.className = "timeline-icon";
    icon.alt = "";
    icon.src = item.tab.favIconUrl || faviconFor(item.tab.url) || fallback;
    icon.addEventListener("error", () => { if (icon.src !== fallback) icon.src = fallback; });
    icon.classList.toggle("github-tab-icon", getSiteKey(item.tab.url) === "github.com");
    const title = document.createElement("span");
    title.className = "timeline-title";
    title.textContent = item.tab.title;
    title.title = item.tab.url || item.tab.title;
    row.append(time, group, icon, title);
    if (typeof item.tab.id === "number" && item.tab.id >= 0) {
      row.addEventListener("click", () => void activateTab(item.tab.id!));
      row.style.cursor = "pointer";
    }
    if (sortBy === "due" && item.dueAt) {
      const due = document.createElement("span");
      const isDue = isDeferredTabDue({ dueAt: item.dueAt } as DeferredTab);
      due.className = `timeline-due ${isDue ? "due" : "scheduled"}`;
      due.textContent = isDue ? i18n.t("due") : i18n.t("reminder");
      row.append(due);
    }
    return row;
  }));
}

async function openRecentlyClosed(): Promise<void> {
  recentlyClosedList.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: i18n.t("loading") }));
  recentlyClosedDialog.showModal();
  try {
    const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 25 });
    type ClosedTab = NonNullable<chrome.sessions.Session["tab"]> & { sessionId?: string };
    const items: { tab: ClosedTab; time: number }[] = [];
    for (const session of sessions) {
      if (session.tab) {
        items.push({ tab: session.tab as ClosedTab, time: (session.lastModified ?? 0) * 1000 });
      } else if (session.window?.tabs?.length) {
        for (const tab of session.window.tabs.slice(0, 3)) {
          items.push({ tab: tab as ClosedTab, time: (session.lastModified ?? 0) * 1000 });
        }
      }
    }
    if (!items.length) {
      recentlyClosedList.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: i18n.t("recentlyClosedEmpty") }));
      return;
    }
    const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
    recentlyClosedList.replaceChildren(...items.map((item) => {
      const row = document.createElement("div");
      row.className = "recently-closed-row";
      const t = item.tab as ClosedTab;
      const time = document.createElement("span");
      time.className = "recently-closed-time";
      const diff = Date.now() - item.time;
      if (diff < 60000) time.textContent = `${Math.floor(diff / 1000)}s`;
      else if (diff < 3600000) time.textContent = `${Math.floor(diff / 60000)}m`;
      else if (diff < 86400000) time.textContent = `${Math.floor(diff / 3600000)}h`;
      else time.textContent = new Date(item.time).toLocaleDateString();
      const icon = document.createElement("img");
      icon.className = "recently-closed-icon";
      icon.alt = "";
      icon.src = t.favIconUrl || (t.url ? faviconFor(t.url) : "") || fallback;
      icon.addEventListener("error", () => { if (icon.src !== fallback) icon.src = fallback; });
      icon.classList.toggle("github-tab-icon", t.url ? getSiteKey(t.url) === "github.com" : false);
      const title = document.createElement("span");
      title.className = "recently-closed-title";
      title.textContent = t.title || t.url || i18n.t("unnamedTab");
      title.title = t.url || t.title || "";
      const restore = makeButton(i18n.t("restoreTab"), "recently-closed-restore", i18n.t("restoreTab"));
      restore.addEventListener("click", () => {
        if (t.sessionId) void chrome.sessions.restore(t.sessionId);
        else if (t.url) void chrome.tabs.create({ url: t.url });
        recentlyClosedDialog.close();
      });
      row.append(time, icon, title, restore);
      return row;
    }));
  } catch (error) {
    recentlyClosedList.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: error instanceof Error ? error.message : String(error) }));
  }
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
function renderWorkspaces(): void {
  workspaceList.replaceChildren(...workspaces.map((workspace) => {
    const row = document.createElement("div");
    row.className = "workspace-row";
    const name = document.createElement("div");
    name.className = "workspace-row-title";
    name.textContent = `${workspace.title} · ${workspace.tabs.length} ${i18n.t("tabs")}`;
    const meta = document.createElement("div");
    meta.className = "workspace-row-meta";
    const deviceInfo = document.createElement("div");
    deviceInfo.className = "workspace-device";
    const isCurrent = !workspace.deviceName || workspace.deviceName === currentDevice?.name;
    if (isCurrent) {
      const badge = document.createElement("span");
      badge.className = "workspace-device-badge";
      badge.textContent = i18n.t("currentDevice");
      deviceInfo.append(badge);
    }
    const deviceName = document.createElement("span");
    deviceName.className = "workspace-device-name";
    deviceName.textContent = isCurrent ? (currentDevice?.name ?? workspace.deviceName ?? i18n.t("thisDevice")) : (workspace.deviceName ?? i18n.t("otherDevice"));
    deviceInfo.append(deviceName);
    const actions = document.createElement("div");
    actions.className = "deferred-actions";
    const history = makeButton(i18n.t("workspaceHistory"), "deferred-action deferred-history", `${i18n.t("workspaceHistory")} ${workspace.title}`);
    history.addEventListener("click", () => void openWorkspaceHistoryDialog(workspace.id, workspace.title));
    const restore = makeButton(i18n.t("restore"), "deferred-action deferred-open", `${i18n.t("restore")} ${workspace.title}`);
    restore.addEventListener("click", () => void previewWorkspaceRestore(workspace.id));
    const remove = makeButton(i18n.t("delete"), "deferred-action deferred-delete", `${i18n.t("delete")} ${workspace.title}`);
    remove.addEventListener("click", () => void deleteWorkspace(workspace.id));
    actions.append(history, restore, remove);
    meta.append(deviceInfo, actions);
    row.append(name, meta);
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
  const tabs = currentState?.groups.flatMap((group) => group.tabs).filter((tab): tab is typeof tab & { url: string } => Boolean(tab.url)) ?? [];
  const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
  workspaceTabs.replaceChildren(...tabs.map((tab, index) => {
    const label = document.createElement("label");
    label.className = "workspace-tab-row";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = true;
    input.value = String(tab.id);
    input.dataset.title = tab.title;
    input.dataset.url = tab.url;
    input.dataset.index = String(index);
    const indexSpan = document.createElement("span");
    indexSpan.className = "workspace-tab-index";
    indexSpan.textContent = String(index + 1);
    const icon = document.createElement("img");
    icon.className = "tab-icon";
    icon.alt = "";
    icon.src = tab.favIconUrl || faviconFor(tab.url) || fallback;
    icon.addEventListener("error", () => { if (icon.src !== fallback) icon.src = fallback; });
    icon.classList.toggle("github-tab-icon", getSiteKey(tab.url) === "github.com");
    const title = document.createElement("span");
    title.className = "workspace-tab-title";
    title.textContent = tab.title;
    label.append(input, indexSpan, icon, title);
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
function makeWorkspaceDialogDraggable(): void {
  const header = workspaceDialog.querySelector(".workspace-dialog-header") as HTMLElement | null;
  if (!header) return;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  const onMouseMove = (event: MouseEvent) => {
    if (!isDragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const rect = workspaceDialog.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - WORKSPACE_DIALOG_VIEWPORT_MARGIN;
    const maxTop = window.innerHeight - rect.height - WORKSPACE_DIALOG_VIEWPORT_MARGIN;
    const left = Math.min(Math.max(WORKSPACE_DIALOG_VIEWPORT_MARGIN, startLeft + dx), Math.max(WORKSPACE_DIALOG_VIEWPORT_MARGIN, maxLeft));
    const top = Math.min(Math.max(WORKSPACE_DIALOG_VIEWPORT_MARGIN, startTop + dy), Math.max(WORKSPACE_DIALOG_VIEWPORT_MARGIN, maxTop));
    workspaceDialog.style.setProperty("--workspace-dialog-left", `${Math.round(left)}px`);
    workspaceDialog.style.setProperty("--workspace-dialog-top", `${Math.round(top)}px`);
    workspaceDialog.classList.add("workspace-dialog-resize-anchored");
  };
  const onMouseUp = () => {
    isDragging = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "";
  };
  header.addEventListener("mousedown", (event) => {
    if (window.innerWidth <= WORKSPACE_DIALOG_MOBILE_MAX_WIDTH) return;
    if (event.target instanceof HTMLElement && event.target.closest("button")) return;
    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    const rect = workspaceDialog.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    event.preventDefault();
  });
}
function makeWorkspaceDialogResizable(): void {
  const resizer = workspaceDialog.querySelector(".workspace-dialog-resizer") as HTMLElement | null;
  const leftPanel = workspaceDialog.querySelector(".workspace-dialog-left") as HTMLElement | null;
  const rightPanel = workspaceDialog.querySelector(".workspace-dialog-right") as HTMLElement | null;
  if (!resizer || !leftPanel || !rightPanel) return;
  let isResizing = false;
  let startX = 0;
  let startLeftWidth = 0;
  const onMouseMove = (event: MouseEvent) => {
    if (!isResizing) return;
    const dx = event.clientX - startX;
    const dialogRect = workspaceDialog.getBoundingClientRect();
    const minLeftWidth = 220;
    const minRightWidth = 200;
    const resizerWidth = 6;
    const maxLeftWidth = dialogRect.width - minRightWidth - resizerWidth;
    const newLeftWidth = Math.min(Math.max(minLeftWidth, startLeftWidth + dx), maxLeftWidth);
    leftPanel.style.width = `${newLeftWidth}px`;
    leftPanel.style.flex = "none";
  };
  const onMouseUp = () => {
    isResizing = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "";
  };
  resizer.addEventListener("mousedown", (event) => {
    if (window.innerWidth <= WORKSPACE_DIALOG_MOBILE_MAX_WIDTH) return;
    isResizing = true;
    startX = event.clientX;
    startLeftWidth = leftPanel.getBoundingClientRect().width;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    event.preventDefault();
  });
}
async function openWorkspaceDialog(): Promise<void> { renderWorkspaceTabs(); workspaceDialog.showModal(); syncWorkspaceDialogResizeAnchor(); makeWorkspaceDialogDraggable(); makeWorkspaceDialogResizable(); workspaceName.focus(); await loadWorkspaces(); }
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
    showWorkspaceNameError(i18n.t("workspaceNameEmpty"));
    return;
  }
  if (title.status === "duplicate") {
    showWorkspaceNameError(i18n.t("workspaceNameDuplicate"));
    return;
  }
  if (title.status !== "valid") { showWorkspaceNameError(i18n.t("workspaceNameTooLong")); return; }
  const tabs = Array.from(workspaceTabs.querySelectorAll<HTMLInputElement>("input:checked")).map((input) => ({ title: input.dataset.title ?? i18n.t("unnamedTab"), url: input.dataset.url ?? "", index: Number(input.dataset.index ?? 0) }));
  if (tabs.length === 0) { showWorkspaceError(i18n.t("selectAtLeastOneTab")); return; }
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
  showStatus(i18n.t("workspaceSaved"));
}
function showWorkspaceRestorePreview(tabs: readonly WorkspaceTab[], unavailableCount = 0): void {
  workspaceRestoreSummary.textContent = unavailableCount ? i18n.t("willOpenTabsSkip", [String(tabs.length), String(unavailableCount)]) : i18n.t("willOpenTabs", [String(tabs.length)]);
  const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
  workspaceRestoreList.replaceChildren(...tabs.map((tab) => {
    const row = document.createElement("div");
    row.className = "tab-row workspace-restore-tab";
    row.title = tab.url;
    const content = document.createElement("div");
    content.className = "tab-open";
    const icon = document.createElement("img");
    icon.className = "tab-icon";
    icon.alt = "";
    icon.src = faviconFor(tab.url) || fallback;
    icon.addEventListener("error", () => { if (icon.src !== fallback) icon.src = fallback; });
    icon.classList.toggle("github-tab-icon", getSiteKey(tab.url) === "github.com");
    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title;
    content.append(icon, title);
    row.append(content);
    return row;
  }));
  workspaceRestoreDialog.showModal();
}
async function previewWorkspaceRestore(id: string): Promise<void> { const result = await send<{ preview: { tabs: WorkspaceTab[]; unavailableCount: number } }>({ type: "get-workspace-restore-preview", id }); restoreWorkspaceId = id; restoreWorkspaceTabs = null; showWorkspaceRestorePreview(result.preview.tabs, result.preview.unavailableCount); }
function previewWorkspaceCardRestore(card: BoardSegmentCard): void {
  const tabs = card.tabs.flatMap((tab) => tab.url ? [{ title: tab.title, url: tab.url }] : []);
  if (!tabs.length) { showStatus(i18n.t("groupHasNoRestorableTabs"), true); return; }
  restoreWorkspaceId = null;
  restoreWorkspaceTabs = tabs;
  showWorkspaceRestorePreview(tabs);
}
async function restoreWorkspace(): Promise<void> {
  const tab = await chrome.tabs.getCurrent();
  const result = restoreWorkspaceId
    ? await send<{ created: number }>({ type: "restore-workspace", id: restoreWorkspaceId, windowId: tab?.windowId, confirmed: true })
    : restoreWorkspaceTabs
      ? await send<{ created: number }>({ type: "restore-workspace-tabs", tabs: restoreWorkspaceTabs, windowId: tab?.windowId, confirmed: true })
      : null;
  if (!result) return;
  workspaceRestoreDialog.close();
  showStatus(i18n.t("openedTabs", [String(result.created)]));
}
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

async function exportWorkspaces(): Promise<void> {
  try {
    exportWorkspacesBtn.disabled = true;
    const result = await send<{ data: WorkspacePortableData }>({ type: "export-workspaces-json" });
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.download = `tab-garden-workspaces-${timestamp}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showStatus(i18n.t("dataExported"));
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    exportWorkspacesBtn.disabled = false;
  }
}

async function handleImportFileSelect(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const result = await send<{ ok: boolean; preview: WorkspaceImportPreview }>({ type: "import-workspaces-json", data: text, confirmed: false });
    const preview = result.preview;
    workspaceImportPreviewSummary.textContent = i18n.t("importPreviewSummary", [String(preview.workspaceCount), String(preview.totalTabs)]);
    workspaceImportPreviewList.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: i18n.t("importPreviewHint") }));
    confirmWorkspaceImportPreview.disabled = false;
    workspaceImportPreviewDialog.showModal();
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    input.value = "";
  }
}

async function confirmWorkspaceImport(): Promise<void> {
  try {
    confirmWorkspaceImportPreview.disabled = true;
    const result = await send<{ ok: boolean; importedCount: number; totalCount: number }>({ type: "import-workspaces-json", confirmed: true });
    workspaceImportPreviewDialog.close();
    showStatus(i18n.t("importCompleted"));
    await loadWorkspaces();
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    confirmWorkspaceImportPreview.disabled = false;
  }
}

function cancelWorkspaceImport(): void {
  workspaceImportPreviewDialog.close();
  void send({ type: "import-workspaces-json", cancelled: true }).catch(() => {});
}

async function openWorkspaceHistoryDialog(workspaceId: string, workspaceTitle: string): Promise<void> {
  historyWorkspaceId = workspaceId;
  historyWorkspaceTitle = workspaceTitle;
  workspaceHistoryTitle.textContent = i18n.t("workspaceHistoryTitle", [workspaceTitle]);
  saveWorkspaceVersionBtn.textContent = i18n.t("saveAsVersion") || "保存为一版";
  workspaceHistoryList.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: i18n.t("loading") }));
  workspaceHistoryDialog.showModal();
  try {
    const result = await send<{ history: WorkspaceHistory | null; maxVersions: number }>({ type: "get-workspace-history", id: workspaceId });
    currentHistory = result.history ?? { workspaceId, versions: [] };
    renderWorkspaceHistory(currentHistory, result.maxVersions);
  } catch (error) {
    workspaceHistoryList.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: error instanceof Error ? error.message : String(error) }));
  }
}

function renderWorkspaceHistory(history: WorkspaceHistory, maxVersions: number): void {
  const versions = history.versions.slice().sort((a, b) => b.version - a.version);
  if (versions.length === 0) {
    workspaceHistoryList.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: i18n.t("noHistory") }));
    return;
  }
  const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
  workspaceHistoryList.replaceChildren(...versions.map((version) => {
    const row = document.createElement("div");
    row.className = "workspace-history-row";
    const header = document.createElement("div");
    header.className = "workspace-history-row-header";
    const versionBadge = document.createElement("span");
    versionBadge.className = "workspace-history-version";
    versionBadge.textContent = `#${version.version}`;
    const savedAt = document.createElement("span");
    savedAt.className = "workspace-history-savedat";
    savedAt.textContent = i18n.t("savedAtTime", [formatDeferredDateTime(version.savedAt)]);
    const tabsCount = document.createElement("span");
    tabsCount.className = "workspace-history-tabcount";
    tabsCount.textContent = `${version.snapshot.tabs.length} ${i18n.t("tabs")}`;
    header.append(versionBadge, savedAt, tabsCount);
    const note = document.createElement("div");
    note.className = "workspace-history-note";
    note.textContent = version.note || i18n.t("noVersionNote") || "（无备注）";
    const preview = document.createElement("div");
    preview.className = "workspace-history-preview";
    const previewTabs = version.snapshot.tabs.slice(0, 3);
    previewTabs.forEach((tab) => {
      const tabEl = document.createElement("div");
      tabEl.className = "workspace-history-tab";
      const icon = document.createElement("img");
      icon.className = "tab-icon";
      icon.alt = "";
      icon.src = faviconFor(tab.url) || fallback;
      icon.addEventListener("error", () => { if (icon.src !== fallback) icon.src = fallback; });
      const title = document.createElement("span");
      title.className = "workspace-history-tab-title";
      title.textContent = tab.title;
      title.title = tab.url || tab.title;
      tabEl.append(icon, title);
      preview.append(tabEl);
    });
    if (version.snapshot.tabs.length > 3) {
      const more = document.createElement("span");
      more.className = "workspace-history-more";
      more.textContent = `+${version.snapshot.tabs.length - 3}`;
      preview.append(more);
    }
    const actions = document.createElement("div");
    actions.className = "deferred-actions workspace-history-actions";
    const restoreBtn = makeButton(i18n.t("restoreVersion"), "deferred-action deferred-open", i18n.t("restoreVersion"));
    restoreBtn.addEventListener("click", () => void confirmRestoreVersion(version));
    actions.append(restoreBtn);
    row.append(header, note, preview, actions);
    return row;
  }));
}

async function confirmRestoreVersion(version: WorkspaceVersion): Promise<void> {
  if (!historyWorkspaceId) return;
  const tab = await chrome.tabs.getCurrent();
  const windowId = tab?.windowId;
  if (!windowId) {
    showStatus(i18n.t("invalidWindow"), true);
    return;
  }
  const tabCount = version.snapshot.tabs.length;
  const message = i18n.t("confirmRestoreVersionPrompt")
    ? i18n.t("confirmRestoreVersionPrompt", [String(version.version), String(tabCount)])
    : `确认恢复版本 #${version.version}？将打开 ${tabCount} 个标签。`;
  if (!window.confirm(message)) return;
  try {
    const result = await send<{ ok: boolean; created: number }>({
      type: "restore-workspace-history-version",
      id: historyWorkspaceId,
      version: version.version,
      windowId,
      confirmed: true,
    });
    workspaceHistoryDialog.close();
    showStatus(i18n.t("openedTabs", [String(result.created)]));
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
}

async function saveWorkspaceVersion(): Promise<void> {
  if (!historyWorkspaceId) return;
  const defaultNote = i18n.t("versionNoteDefault") || "手动保存";
  const promptText = i18n.t("versionNotePrompt") || "输入备注（可选）：";
  const noteInput = window.prompt(promptText, defaultNote);
  if (noteInput === null) return;
  try {
    saveWorkspaceVersionBtn.disabled = true;
    const note = noteInput.trim() || undefined;
    const result = await send<{ ok: boolean; history: WorkspaceHistory }>({
      type: "save-workspace-history-version",
      id: historyWorkspaceId,
      note,
    });
    currentHistory = result.history;
    renderWorkspaceHistory(result.history, 50);
    showStatus(i18n.t("versionSaved") || "已保存版本");
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    saveWorkspaceVersionBtn.disabled = false;
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
    const existing = document.querySelector(".defer-menu") as (HTMLDivElement & { closeRef?: () => void }) | null;
    if (existing) { existing.closeRef?.(); return; }
    const menu = document.createElement("div") as HTMLDivElement & { closeRef?: () => void };
    menu.className = "defer-menu";
    let onOutside: ((event: MouseEvent) => void) | null = null;
    let onScroll: ((event: Event) => void) | null = null;
    let onResize: (() => void) | null = null;
    const closeMenu = () => {
      menu.remove();
      if (onOutside) document.removeEventListener("mousedown", onOutside, true);
      if (onScroll) document.removeEventListener("scroll", onScroll, true);
      if (onResize) window.removeEventListener("resize", onResize);
    };
    menu.closeRef = closeMenu;
    const times = currentState?.settings?.deferredShortcutTimes ?? ["09:00", "14:00", "18:00"];
    for (const time of times) {
      const option = makeButton(`${i18n.t("countdown")} ${time}`, "defer-option", `${i18n.t("countdownTo")} ${time}`);
      option.addEventListener("click", () => { closeMenu(); void deferTab(tab.id, nextDeferredOccurrence(time).toISOString()); });
      menu.append(option);
    }
    const addOption = makeButton(i18n.t("addShortcut"), "defer-option defer-option-add", i18n.t("addShortcut"));
    addOption.addEventListener("click", () => {
      closeMenu();
      void chrome.tabs.create({ url: chrome.runtime.getURL("options.html#shortcut-times") });
    });
    menu.append(addOption);
    document.body.append(menu);
    positionDeferMenu(menu, defer);
    onOutside = (event: MouseEvent) => { if (!menu.contains(event.target as Node) && !defer.contains(event.target as Node)) closeMenu(); };
    onScroll = () => positionDeferMenu(menu, defer);
    onResize = () => positionDeferMenu(menu, defer);
    setTimeout(() => {
      if (onOutside) document.addEventListener("mousedown", onOutside, true);
      if (onScroll) document.addEventListener("scroll", onScroll, true);
      if (onResize) window.addEventListener("resize", onResize);
    }, 0);
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

async function deferTab(tabId: number, dueAt: string): Promise<void> { try { await send({ type: "defer-board-tab", tabId, dueAt: new Date(dueAt).toISOString() }); showStatus(i18n.t("addedToLater")); await load(); } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); } }

async function openSaveToWorkspaceMenu(tab: BoardSegmentCard["tabs"][number], toggleButton: HTMLButtonElement): Promise<void> {
  const existing = document.querySelector(".workspace-save-menu") as (HTMLDivElement & { closeRef?: () => void }) | null;
  if (existing) { existing.closeRef?.(); return; }
  const menu = document.createElement("div") as HTMLDivElement & { closeRef?: () => void };
  menu.className = "workspace-save-menu";
  const saveToast = document.createElement("p");
  saveToast.className = "workspace-save-toast";
  saveToast.setAttribute("role", "status");
  saveToast.setAttribute("aria-live", "polite");
  saveToast.hidden = true;
  const description = document.createElement("p");
  description.className = "workspace-save-desc";
  description.textContent = i18n.t("selectWorkspace");
  const loading = document.createElement("p");
  loading.className = "empty";
  loading.textContent = i18n.t("loading");
  menu.append(description, loading);
  document.body.append(menu, saveToast);
  positionWorkspaceSaveMenu(menu, toggleButton, saveToast);
  let onOutside: ((event: MouseEvent) => void) | null = null;
  let onScroll: ((event: Event) => void) | null = null;
  let onResize: (() => void) | null = null;
  const closeMenu = () => {
    menu.remove();
    saveToast.remove();
    if (onOutside) document.removeEventListener("mousedown", onOutside, true);
    if (onScroll) document.removeEventListener("scroll", onScroll, true);
    if (onResize) window.removeEventListener("resize", onResize);
  };
  const showSaveToast = (message: string, error = false) => {
    saveToast.textContent = message;
    saveToast.className = error ? "workspace-save-toast error" : "workspace-save-toast success";
    saveToast.hidden = false;
    positionWorkspaceSaveMenu(menu, toggleButton, saveToast);
  };
  const renderOptions = () => {
    const options = workspaces.map((workspace) => {
      const option = makeButton("", "workspace-save-option", `${i18n.t("saveToWorkspace")}${workspace.title}`);
      appendWorkspaceListItemDetails(option, workspace);
      option.addEventListener("click", async () => {
        option.disabled = true;
        try {
          await send({ type: "add-tab-to-workspace", id: workspace.id, tab: { title: tab.title, url: tab.url ?? "" } });
          workspaces = workspaces.map((item) => item.id === workspace.id ? { ...item, tabs: [...item.tabs, { title: tab.title, url: tab.url ?? "" }] } : item);
          showSaveToast(i18n.t("workspaceSavedTo", [workspace.title]));
          renderOptions();
          positionWorkspaceSaveMenu(menu, toggleButton, saveToast);
        } catch (error) {
          option.disabled = false;
          showSaveToast(error instanceof Error ? error.message : String(error), true);
        }
      });
      return option;
    });
    menu.replaceChildren(description, ...options);
  };
  menu.closeRef = closeMenu;
  menu.addEventListener("wheel", (event: WheelEvent) => {
    const max = menu.scrollHeight - menu.clientHeight;
    if (max <= 0) { event.preventDefault(); return; }
    if ((event.deltaY < 0 && menu.scrollTop <= 0) || (event.deltaY > 0 && menu.scrollTop >= max)) event.preventDefault();
  }, { passive: false });
  onOutside = (event) => { if (!menu.contains(event.target as Node) && !toggleButton.contains(event.target as Node)) closeMenu(); };
  onScroll = (event) => { if (event.target instanceof Node && menu.contains(event.target)) return; closeMenu(); };
  onResize = () => closeMenu();
  setTimeout(() => {
    if (onOutside) document.addEventListener("mousedown", onOutside, true);
    if (onScroll) document.addEventListener("scroll", onScroll, true);
    if (onResize) window.addEventListener("resize", onResize);
  }, 0);
  try {
    if (!workspaces.length) {
      const result = await send<{ workspaces: WorkspaceSnapshot[] }>({ type: "get-workspaces" });
      workspaces = result.workspaces;
    }
    if (!workspaces.length) {
      const result = await send<{ workspace: WorkspaceSnapshot }>({ type: "save-workspace", title: i18n.t("default"), tabs: [{ title: tab.title, url: tab.url ?? "" }] });
      workspaces = [result.workspace];
      showSaveToast(i18n.t("saveToDefault"));
    }
    renderOptions();
    positionWorkspaceSaveMenu(menu, toggleButton, saveToast);
  } catch (error) {
    menu.replaceChildren(description);
    showSaveToast(error instanceof Error ? error.message : String(error), true);
    positionWorkspaceSaveMenu(menu, toggleButton, saveToast);
  }
}

function positionWorkspaceSaveMenu(menu: HTMLElement, toggleButton: HTMLElement, toast?: HTMLElement): void {
  const rect = toggleButton.getBoundingClientRect();
  const margin = 4;
  const toastGap = 6;
  if (toast && !toast.hidden) toast.style.width = `${menu.offsetWidth}px`;
  const toastOffset = toast && !toast.hidden ? toast.offsetHeight + toastGap : 0;
  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const top = menu.offsetHeight <= spaceBelow || spaceBelow >= spaceAbove
    ? rect.bottom + margin
    : rect.top - menu.offsetHeight - margin;
  const menuTop = Math.max(margin + toastOffset, Math.min(top, window.innerHeight - menu.offsetHeight - margin));
  const menuLeft = Math.max(margin, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - margin));
  menu.style.top = `${menuTop}px`;
  menu.style.left = `${menuLeft}px`;
  if (toast && !toast.hidden) {
    toast.style.top = `${menuTop - toast.offsetHeight - toastGap}px`;
    toast.style.left = `${menuLeft}px`;
  }
}

function positionDeferMenu(menu: HTMLElement, toggleButton: HTMLElement): void {
  const rect = toggleButton.getBoundingClientRect();
  const margin = 4;
  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const top = menu.offsetHeight <= spaceBelow || spaceBelow >= spaceAbove
    ? rect.bottom + margin
    : rect.top - menu.offsetHeight - margin;
  const menuTop = Math.max(margin, Math.min(top, window.innerHeight - menu.offsetHeight - margin));
  const menuLeft = Math.max(margin, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - margin));
  menu.style.top = `${menuTop}px`;
  menu.style.left = `${menuLeft}px`;
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
  reminderStatus.textContent = due ? `${i18n.t("due")} · ${formatDeferredDateTime(tab.dueAt)}` : `${formatDeferredDateTime(tab.dueAt)} ${i18n.t("reminder")}`;

  const actions = document.createElement("div");
  actions.className = "deferred-actions";
  const open = makeButton(i18n.t("open"), "deferred-action deferred-open", `${i18n.t("open")} ${tab.title}`);
  open.addEventListener("click", async () => {
    const current = await chrome.tabs.getCurrent();
    await send({ type: "open-deferred-tab", id: tab.id, windowId: current?.windowId });
    await Promise.all([renderDeferredTabs(), renderBoardStatistics()]);
  });
  const remove = makeButton(i18n.t("delete"), "deferred-action deferred-delete", `${i18n.t("delete")} ${tab.title}`);
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

async function renderBoardStatistics(): Promise<void> {
  const stats = await send<{ eligibleTabCount: number; duplicateTabCount: number; deferredTabCount?: number; dueDeferredCount?: number }>({ type: "get-board-statistics" });
  const deferredTabCount = stats.deferredTabCount ?? stats.dueDeferredCount ?? 0;
  boardStatsInline.replaceChildren(
    ...[
      [i18n.t("webTabs"), stats.eligibleTabCount],
      [i18n.t("duplicatePages"), stats.duplicateTabCount],
      [i18n.t("dueReminders"), deferredTabCount],
    ].map(([label, value]) => {
      const item = document.createElement("span");
      item.className = "stat-item";
      const number = document.createElement("strong");
      number.textContent = String(value);
      const text = document.createElement("span");
      text.textContent = String(label);
      item.append(number, text);
      return item;
    }),
  );
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

function renderScopeNav(): void {
  scopeNav.replaceChildren();
  const scopes = document.createElement("div");
  scopes.className = "scope-nav-scopes";
  const currentBtn = makeScopeButton("current", i18n.t("current"));
  currentBtn.addEventListener("click", () => void returnToCurrent());
  const workspaceBtn = makeScopeButton("workspace", i18n.t("loadFromWorkspace"));
  workspaceBtn.addEventListener("click", () => toggleWorkspacePopover(workspaceBtn));
  scopes.append(currentBtn, workspaceBtn);
  scopeNav.append(scopes);
}

function makeScopeButton(kind: ScopeMode, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "scope-nav-scope";
  button.textContent = label;
  button.setAttribute("aria-pressed", String(scopeMode === kind));
  return button;
}

function toggleWorkspacePopover(anchorButton: HTMLButtonElement): void {
  const existing = document.querySelector(".workspace-popover") as (HTMLDivElement & { closeRef?: () => void }) | null;
  if (existing) { existing.closeRef?.(); return; }
  const popover = document.createElement("div") as HTMLDivElement & { closeRef?: () => void };
  popover.className = "workspace-popover";
  const header = document.createElement("p");
  header.className = "workspace-popover-header";
  header.textContent = i18n.t("selectWorkspace");
  const list = document.createElement("div");
  list.className = "workspace-popover-list";
  const loading = document.createElement("p");
  loading.className = "workspace-popover-empty";
  loading.textContent = i18n.t("loading");
  list.append(loading);
  popover.append(header, list);
  document.body.append(popover);
  positionWorkspacePopover(popover, anchorButton);
  let onOutside: ((event: MouseEvent) => void) | null = null;
  let onScroll: ((event: Event) => void) | null = null;
  let onResize: (() => void) | null = null;
  const close = () => {
    popover.remove();
    if (onOutside) document.removeEventListener("mousedown", onOutside, true);
    if (onScroll) document.removeEventListener("scroll", onScroll, true);
    if (onResize) window.removeEventListener("resize", onResize);
  };
  popover.closeRef = close;
  list.addEventListener("wheel", (event: WheelEvent) => {
    const max = list.scrollHeight - list.clientHeight;
    if (max <= 0) { event.preventDefault(); return; }
    if ((event.deltaY < 0 && list.scrollTop <= 0) || (event.deltaY > 0 && list.scrollTop >= max)) event.preventDefault();
  }, { passive: false });
  onOutside = (event) => { if (!popover.contains(event.target as Node) && !anchorButton.contains(event.target as Node)) close(); };
  onScroll = (event) => { if (event.target instanceof Node && popover.contains(event.target)) return; close(); };
  onResize = () => close();
  setTimeout(() => {
    if (onOutside) document.addEventListener("mousedown", onOutside, true);
    if (onScroll) document.addEventListener("scroll", onScroll, true);
    if (onResize) window.addEventListener("resize", onResize);
  }, 0);
  void (async () => {
    try {
      if (!workspaces.length) await loadWorkspaces();
      renderWorkspacePopoverList(list, popover);
      positionWorkspacePopover(popover, anchorButton);
    } catch (error) {
      close();
      showStatus(error instanceof Error ? error.message : String(error), true);
    }
  })();
}

function appendWorkspaceListItemDetails(item: HTMLElement, workspace: WorkspaceSnapshot): void {
  const title = document.createElement("span");
  title.className = "workspace-popover-item-title";
  title.textContent = workspace.title;
  const count = document.createElement("span");
  count.className = "workspace-popover-item-count";
  count.textContent = `${workspace.tabs.length} ${i18n.t("tabs")}`;
  const device = document.createElement("span");
  device.className = "workspace-popover-item-device";
  device.textContent = workspace.deviceName ?? i18n.t("thisDevice");
  item.append(title, count, device);
}

function renderWorkspacePopoverList(list: HTMLElement, popover: HTMLElement & { closeRef?: () => void }): void {
  list.replaceChildren();
  if (!workspaces.length) {
    const empty = document.createElement("p");
    empty.className = "workspace-popover-empty";
    empty.textContent = i18n.t("noWorkspaces");
    list.append(empty);
    return;
  }
  for (const workspace of workspaces) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "workspace-popover-item";
    item.classList.toggle("selected", loadedWorkspace?.id === workspace.id);
    item.setAttribute("aria-label", `${i18n.t("loadFromWorkspace")} ${workspace.title}`);
    appendWorkspaceListItemDetails(item, workspace);
    item.addEventListener("click", () => { popover.closeRef?.(); void loadWorkspaceBoard(workspace.id); });
    list.append(item);
  }
}

function positionWorkspacePopover(popover: HTMLElement, anchorButton: HTMLElement): void {
  const rect = anchorButton.getBoundingClientRect();
  const margin = 4;
  const preferredLeft = rect.right + margin;
  const left = preferredLeft + popover.offsetWidth <= window.innerWidth - margin
    ? preferredLeft
    : Math.max(margin, window.innerWidth - popover.offsetWidth - margin);
  popover.style.left = `${left}px`;
  popover.style.top = `${Math.max(margin, Math.min(rect.top, window.innerHeight - popover.offsetHeight - margin))}px`;
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
    empty.textContent = query ? i18n.t("noMatchingTabs") : i18n.t("workspaceHasNoTabs");
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
    segment.textContent = i18n.t("segment", [String(card.segmentIndex + 1), String(card.segmentCount)]);
    heading.append(segment);
  }
  const actions = document.createElement("div");
  actions.className = "deferred-actions";
  const restore = makeButton(i18n.t("restore"), "deferred-action deferred-open", `${i18n.t("restore")} ${card.title} ${i18n.t("tabs")}`);
  restore.addEventListener("click", () => previewWorkspaceCardRestore(card));
  actions.append(restore);
  heading.append(actions);
  const tabs = document.createElement("div");
  tabs.className = "tabs";
  if (card.tabs.length) tabs.append(...card.tabs.map((tab) => renderWorkspaceTab(tab)));
  else {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = i18n.t("noTabsYet");
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
  open.setAttribute("aria-label", `${i18n.t("openTab")}${tab.title}`);
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
  const edit = makeButton("✎", "tab-edit", `${i18n.t("edit")}${i18n.t("tab")}: ${tab.title}`);
  edit.addEventListener("click", (event) => { event.stopPropagation(); beginEditWorkspaceTab(row, flatIndex, tab); });
  const close = makeButton("×", "tab-close", `${i18n.t("delete")}${i18n.t("tab")}: ${tab.title}`);
  close.addEventListener("click", (event) => {
    event.stopPropagation();
    const card = row.closest(".group-card") as HTMLElement | null;
    const heading = card?.querySelector(".card-title") as HTMLElement | null;
    void deleteWorkspaceTab(flatIndex, heading ?? close);
  });
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
  titleInput.placeholder = i18n.t("title");
  const urlInput = document.createElement("input");
  urlInput.type = "url";
  urlInput.className = "workspace-edit-input";
  urlInput.value = tab.url ?? "";
  urlInput.placeholder = i18n.t("url");
  const save = makeButton(i18n.t("save"), "button workspace-edit-save", i18n.t("save"));
  save.addEventListener("click", (event) => { event.stopPropagation(); void saveWorkspaceTabEdit(flatIndex, titleInput.value, urlInput.value); });
  const cancel = makeButton(i18n.t("cancel"), "button secondary workspace-edit-cancel", i18n.t("cancel"));
  cancel.addEventListener("click", (event) => { event.stopPropagation(); renderWorkspaceBoard(); });
  row.append(titleInput, urlInput, save, cancel);
  titleInput.focus();
}

async function saveWorkspaceTabEdit(flatIndex: number, title: string, url: string): Promise<void> {
  if (!loadedWorkspace) return;
  try {
    await send({ type: "update-workspace-tab", id: loadedWorkspace.id, index: flatIndex, title, url });
    showStatus(i18n.t("tabUpdated"));
    await loadWorkspaceBoard(loadedWorkspace.id);
  } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); }
}

async function deleteWorkspaceTab(flatIndex: number, anchor?: HTMLElement): Promise<void> {
  if (!loadedWorkspace) return;
  const workspaceId = loadedWorkspace.id;
  const totalTabs = workspaceCards.reduce((sum, card) => sum + card.tabs.length, 0);
  const isLastTab = workspaceCards.length === 1 && totalTabs === 1;

  if (isLastTab) {
    confirmLastTabConfirm.disabled = false;
    cancelLastTabConfirm.disabled = false;
    lastTabConfirmDialog.showModal();
    const cleanup = () => {
      confirmLastTabConfirm.removeEventListener("click", handleConfirm);
      cancelLastTabConfirm.removeEventListener("click", handleCancel);
      confirmLastTabConfirm.disabled = false;
      cancelLastTabConfirm.disabled = false;
    };
    const handleConfirm = async () => {
      confirmLastTabConfirm.disabled = true;
      cancelLastTabConfirm.disabled = true;
      try {
        await send({ type: "delete-workspace", id: workspaceId });
        boardToast(i18n.t("workspaceDeleted"), false, anchor);
        loadedWorkspace = null;
        workspaceCards = [];
        scopeMode = "current";
        setWorkspaceMode(false);
        renderScopeNav();
        workspaceHeader.replaceChildren();
        lastTabConfirmDialog.close();
        cleanup();
        await load();
        await loadWorkspaces();
      } catch (error) {
        lastTabConfirmDialog.close();
        cleanup();
        boardToast(error instanceof Error ? error.message : String(error), true, anchor);
      }
    };
    const handleCancel = () => {
      cleanup();
      lastTabConfirmDialog.close();
    };
    confirmLastTabConfirm.addEventListener("click", handleConfirm);
    cancelLastTabConfirm.addEventListener("click", handleCancel);
    return;
  }

  try {
    await send({ type: "remove-workspace-tab", id: workspaceId, index: flatIndex });
    boardToast(i18n.t("tabRemovedFromWorkspace"), false, anchor);
    await loadWorkspaceBoard(workspaceId);
    await loadWorkspaces();
  } catch (error) { boardToast(error instanceof Error ? error.message : String(error), true, anchor); }
}

async function addWorkspaceTab(url: string, title: string): Promise<void> {
  if (!loadedWorkspace) return;
  try {
    await send({ type: "add-tab-to-workspace", id: loadedWorkspace.id, tab: { title, url } });
    showStatus(i18n.t("tabAddedToWorkspace"));
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
  newGroupForm.parentElement!.classList.toggle("hidden", on);
  windowFilter.classList.toggle("hidden", on);
  reviewDuplicates.classList.toggle("hidden", on);
  boardStatsInline.classList.toggle("hidden", on);
  toggleSelectModeBtn.classList.toggle("hidden", on || selectMode);
  viewToggleBoard.classList.toggle("hidden", on);
  viewToggleTimeline.classList.toggle("hidden", on);
  recentlyClosedBtn.classList.toggle("hidden", on);
  if (on && selectMode) setSelectMode(false);
  if (on && viewMode === "timeline") setViewMode("board");
  // 仅在工作区模式隐藏；切回“当前”时不主动显示，由 renderDeferredTabs 按数据决定，避免空列表先弹出再隐藏的闪烁。
  if (on) deferredReminders.classList.add("hidden");
  workspaceHeader.classList.toggle("hidden", !on);
}

function renderWorkspaceHeader(): void {
  workspaceHeader.replaceChildren();
  if (!loadedWorkspace) return;
  const info = document.createElement("span");
  info.className = "workspace-header-info";
  const tabCount = workspaceCards.reduce((sum, card) => sum + card.tabs.length, 0);
  const deviceSuffix = loadedWorkspace.deviceName ? `（${loadedWorkspace.deviceName}）` : "";
  info.textContent = `${i18n.t("workspace")}：${loadedWorkspace.title}${deviceSuffix} · ${tabCount} ${i18n.t("tabs")} · ${i18n.t("savedAt")} ${formatDeferredDateTime(loadedWorkspace.createdAt)}`;
  const addForm = document.createElement("form");
  addForm.className = "workspace-add-form";
  const urlInput = document.createElement("input");
  urlInput.type = "url";
  urlInput.className = "workspace-add-url";
  urlInput.placeholder = i18n.t("newTabUrl");
  urlInput.required = true;
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.className = "workspace-add-title";
  titleInput.placeholder = i18n.t("titleOptional");
  const addBtn = makeButton(i18n.t("add"), "button", `${i18n.t("add")}${i18n.t("workspace")}`);
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
  const back = makeButton(i18n.t("returnToCurrent"), "button secondary", i18n.t("returnToCurrentBoard"));
  back.addEventListener("click", () => void returnToCurrent());
  workspaceHeader.append(info, addForm, back);
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  boardThemeToggle.setAttribute("aria-pressed", String(theme === "dark"));
}

async function load(): Promise<void> {
  const boardTab = await chrome.tabs.getCurrent();
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
    await load();
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
  const current = { ...DEFAULT_SETTINGS };
  if (currentState?.settings) {
    Object.assign(current, currentState.settings);
  }
  current.theme = theme;
  await send({ type: "update-settings", settings: current });
  applyTheme(theme);
  if (currentState) currentState.settings = current;
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
exportWorkspacesBtn.addEventListener("click", () => void exportWorkspaces().catch((error) => showStatus(String(error), true)));
importWorkspacesInput.addEventListener("change", (event) => void handleImportFileSelect(event));
closeWorkspaceImportPreview.addEventListener("click", cancelWorkspaceImport);
cancelWorkspaceImportPreview.addEventListener("click", cancelWorkspaceImport);
confirmWorkspaceImportPreview.addEventListener("click", () => void confirmWorkspaceImport());
closeWorkspaceHistory.addEventListener("click", () => workspaceHistoryDialog.close());
saveWorkspaceVersionBtn.addEventListener("click", () => void saveWorkspaceVersion());
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
recentlyClosedSearch.addEventListener("input", () => renderRecentlyClosedList(recentlyClosedSearch.value));
closeRecentlyClosed.addEventListener("click", () => recentlyClosedDialog.close());
cancelRecentlyClosed.addEventListener("click", () => recentlyClosedDialog.close());
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
