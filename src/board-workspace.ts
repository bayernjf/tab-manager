/**
 * Saved-workspace scope: the workspace manager dialog, device bar, save /
 * preview / restore / delete / add / update / remove / move flows, workspace
 * import and export, and the read-only workspace board. board.ts still owns the
 * page shell, so the few cross-subsystem hooks arrive through
 * initWorkspaceBoard instead of importing board.ts back (no cycles).
 */

import { i18n } from "./i18n.js";
import {
  boardTabMatchesQuery,
  formatDeferredDateTime,
  getSiteKey,
  manualBoardGridRow,
  placeBoardCards,
  validateWorkspaceTitle,
  type BoardSegmentCard,
  type WorkspacePortableData,
  type WorkspaceSnapshot,
  type WorkspaceTab,
} from "./shared.js";
import { $, boardToast, clearDropTarget, dragData, faviconFor, getOpenTabUrls, groupColor, laneCount, makeButton, send, showStatus } from "./board-dom.js";
import { openWorkspaceHistoryDialog, wireWorkspaceHistoryDialog } from "./board-history.js";

export interface WorkspaceBoardDeps {
  getGroups: () => BoardSegmentCard[];
  reload: () => Promise<void>;
  isSelectMode: () => boolean;
  isTimelineView: () => boolean;
  setSelectMode: (on: boolean) => void;
  setViewMode: (mode: "board" | "timeline") => void;
}

let deps: WorkspaceBoardDeps;

export function initWorkspaceBoard(next: WorkspaceBoardDeps): void {
  deps = next;
}

const openWorkspaces = $<HTMLButtonElement>("#open-workspaces"), workspaceDialog = $<HTMLDialogElement>("#workspace-dialog"), workspaceName = $<HTMLInputElement>("#workspace-name"), workspaceNameError = $<HTMLElement>("#workspace-name-error"), workspaceSelectAll = $<HTMLInputElement>("#workspace-select-all"), workspaceTabs = $("#workspace-tabs"), saveWorkspace = $<HTMLButtonElement>("#save-workspace"), workspaceDeviceName = $<HTMLInputElement>("#workspace-device-name"), workspaceList = $("#workspace-list"), closeWorkspaceDialog = $<HTMLButtonElement>("#close-workspace-dialog"), workspaceRestoreDialog = $<HTMLDialogElement>("#workspace-restore-dialog"), workspaceRestoreSummary = $("#workspace-restore-summary"), workspaceRestoreList = $("#workspace-restore-list"), confirmWorkspaceRestore = $<HTMLButtonElement>("#confirm-workspace-restore"), cancelWorkspaceRestore = $<HTMLButtonElement>("#cancel-workspace-restore");
const lastTabConfirmDialog = $<HTMLDialogElement>("#last-tab-confirm-dialog");
const cancelLastTabConfirm = $<HTMLButtonElement>("#cancel-last-tab-confirm");
const confirmLastTabConfirm = $<HTMLButtonElement>("#confirm-last-tab-confirm");
const scopeNav = $("#scope-nav");
const workspaceHeader = $("#workspace-header");
const boardContent = $("#board-content");
const boardGrid = $<HTMLElement>("#board-grid");
const boardSearch = $<HTMLInputElement>("#board-search");
const windowFilter = $<HTMLSelectElement>("#window-filter");
const newGroupForm = $<HTMLFormElement>("#new-group-form");
const reviewDuplicates = $<HTMLButtonElement>("#review-duplicates");
const boardStatsInline = $("#board-stats-inline");
const toggleSelectModeBtn = $<HTMLButtonElement>("#toggle-select-mode");
const viewToggleBoard = $<HTMLButtonElement>("#view-toggle-board");
const viewToggleTimeline = $<HTMLButtonElement>("#view-toggle-timeline");
const recentlyClosedBtn = $<HTMLButtonElement>("#recently-closed-btn");
const deferredReminders = $("#deferred-reminders");
const exportWorkspacesBtn = $<HTMLButtonElement>("#export-workspaces");
const importWorkspacesInput = $<HTMLInputElement>("#import-workspaces-input");
const workspaceImportPreviewDialog = $<HTMLDialogElement>("#workspace-import-preview-dialog");
const workspaceImportPreviewSummary = $("#workspace-import-preview-summary");
const workspaceImportPreviewList = $("#workspace-import-preview-list");
const closeWorkspaceImportPreview = $<HTMLButtonElement>("#close-workspace-import-preview");
const cancelWorkspaceImportPreview = $<HTMLButtonElement>("#cancel-workspace-import-preview");
const confirmWorkspaceImportPreview = $<HTMLButtonElement>("#confirm-workspace-import-preview");

interface WorkspaceImportPreview {
  workspaceCount: number;
  totalTabs: number;
}

let workspaces: WorkspaceSnapshot[] = [], restoreWorkspaceId: string | null = null, restoreWorkspaceTabs: WorkspaceTab[] | null = null;
let currentDevice: { id: string; name: string } | null = null;
let deviceNameOriginal = "";
type ScopeMode = "current" | "workspace";
export let scopeMode: ScopeMode = "current";
let loadedWorkspace: { id: string; title: string; createdAt: string; deviceName?: string } | null = null;
let workspaceCards: BoardSegmentCard[] = [];
const WORKSPACE_DIALOG_VIEWPORT_MARGIN = 16;
const WORKSPACE_DIALOG_MOBILE_MAX_WIDTH = 640;

export async function refreshWorkspacesCache(): Promise<void> { const result = await send<{ workspaces: WorkspaceSnapshot[]; device: { id: string; name: string } }>({ type: "get-workspaces" }); workspaces = result.workspaces; currentDevice = result.device; }
async function loadWorkspaces(): Promise<void> { await refreshWorkspacesCache(); if (!currentDevice) return; workspaceDeviceName.value = currentDevice.name; deviceNameOriginal = currentDevice.name; renderWorkspaces(); }

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
  const tabs = deps.getGroups().flatMap((group) => group.tabs).filter((tab): tab is typeof tab & { url: string } => Boolean(tab.url)) ?? [];
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
export function syncWorkspaceDialogResizeAnchor(): void {
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
function showWorkspaceRestorePreview(tabs: readonly WorkspaceTab[], unavailableCount = 0, alreadyOpenUrls?: Set<string>): void {
  const alreadyOpen = alreadyOpenUrls ? tabs.filter((tab) => alreadyOpenUrls.has(tab.url)) : [];
  const newCount = tabs.length - alreadyOpen.length;
  if (alreadyOpen.length > 0 && newCount > 0) {
    workspaceRestoreSummary.textContent = i18n.t("willOpenTabsSkipAlready", [String(newCount), String(alreadyOpen.length)]);
  } else if (unavailableCount) {
    workspaceRestoreSummary.textContent = i18n.t("willOpenTabsSkip", [String(tabs.length), String(unavailableCount)]);
  } else {
    workspaceRestoreSummary.textContent = i18n.t("willOpenTabs", [String(tabs.length)]);
  }
  const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
  workspaceRestoreList.replaceChildren(...tabs.map((tab) => {
    const isOpen = alreadyOpenUrls?.has(tab.url) ?? false;
    const row = document.createElement("div");
    row.className = "tab-row workspace-restore-tab";
    if (isOpen) row.classList.add("already-open");
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
async function previewWorkspaceRestore(id: string): Promise<void> {
  const [result, openUrls] = await Promise.all([
    send<{ preview: { tabs: WorkspaceTab[]; unavailableCount: number } }>({ type: "get-workspace-restore-preview", id }),
    getOpenTabUrls(),
  ]);
  restoreWorkspaceId = id; restoreWorkspaceTabs = null;
  showWorkspaceRestorePreview(result.preview.tabs, result.preview.unavailableCount, openUrls);
}
async function previewWorkspaceCardRestore(card: BoardSegmentCard): Promise<void> {
  const tabs = card.tabs.flatMap((tab) => tab.url ? [{ title: tab.title, url: tab.url }] : []);
  if (!tabs.length) { showStatus(i18n.t("groupHasNoRestorableTabs"), true); return; }
  restoreWorkspaceId = null;
  restoreWorkspaceTabs = tabs;
  const openUrls = await getOpenTabUrls();
  showWorkspaceRestorePreview(tabs, 0, openUrls);
}
async function restoreWorkspace(): Promise<void> {
  const tab = await chrome.tabs.getCurrent();
  const openUrls = await getOpenTabUrls();
  const result = restoreWorkspaceId
    ? await send<{ created: number }>({ type: "restore-workspace", id: restoreWorkspaceId, windowId: tab?.windowId, confirmed: true, skipUrls: [...openUrls] })
    : restoreWorkspaceTabs
      ? await send<{ created: number }>({ type: "restore-workspace-tabs", tabs: restoreWorkspaceTabs, windowId: tab?.windowId, confirmed: true, skipUrls: [...openUrls] })
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
    const result = await send<{ ok: boolean; synced: boolean; failedUploads: number; importedCount: number; totalCount: number }>({ type: "import-workspaces-json", confirmed: true });
    workspaceImportPreviewDialog.close();
    if (!result.synced && result.failedUploads > 0) {
      showStatus(i18n.t("importCompletedSyncFailed", [String(result.failedUploads)]), true);
    } else {
      showStatus(i18n.t("importCompleted"));
    }
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

export function renderScopeNav(): void {
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

export function renderWorkspaceBoard(): void {
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
  restore.addEventListener("click", () => void previewWorkspaceCardRestore(card));
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
        await deps.reload();
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
  await deps.reload();
}

function setWorkspaceMode(on: boolean): void {
  boardContent.classList.toggle("workspace-mode", on);
  newGroupForm.parentElement!.classList.toggle("hidden", on);
  windowFilter.classList.toggle("hidden", on);
  reviewDuplicates.classList.toggle("hidden", on);
  boardStatsInline.classList.toggle("hidden", on);
  toggleSelectModeBtn.classList.toggle("hidden", on || deps.isSelectMode());
  viewToggleBoard.classList.toggle("hidden", on);
  viewToggleTimeline.classList.toggle("hidden", on);
  recentlyClosedBtn.classList.toggle("hidden", on);
  if (on && deps.isSelectMode()) deps.setSelectMode(false);
  if (on && deps.isTimelineView()) deps.setViewMode("board");
  // 可见性只由 deferredRemindersHidden 判定：切回“当前”时保持隐藏，等 renderDeferredTabs 拿到数据再决定，
  // 避免空列表先显示再隐藏的闪烁。
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

export async function openSaveToWorkspaceMenu(tab: BoardSegmentCard["tabs"][number], toggleButton: HTMLButtonElement): Promise<void> {
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

export function getWorkspaceCards(): BoardSegmentCard[] {
  return workspaceCards;
}

export async function refreshWorkspaceView(): Promise<boolean> {
  if (scopeMode !== "workspace" || !loadedWorkspace) return false;
  await loadWorkspaceBoard(loadedWorkspace.id);
  return true;
}

export function wireWorkspaceBoard(): void {
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
  exportWorkspacesBtn.addEventListener("click", () => void exportWorkspaces().catch((error) => showStatus(String(error), true)));
  importWorkspacesInput.addEventListener("change", (event) => void handleImportFileSelect(event));
  closeWorkspaceImportPreview.addEventListener("click", cancelWorkspaceImport);
  cancelWorkspaceImportPreview.addEventListener("click", cancelWorkspaceImport);
  confirmWorkspaceImportPreview.addEventListener("click", () => void confirmWorkspaceImport());
  wireWorkspaceHistoryDialog();
}
