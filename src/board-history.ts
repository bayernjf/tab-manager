/**
 * The workspace version-history dialog. Self-contained: the only state it keeps
 * is which workspace is currently open in it, and board.ts drives it through
 * openWorkspaceHistoryDialog / wireWorkspaceHistoryDialog.
 */

import { i18n } from "./i18n.js";
import { formatDeferredDateTime } from "./shared.js";
import type { WorkspaceHistory, WorkspaceVersion } from "./shared.js";
import { $, faviconFor, getOpenTabUrls, makeButton, send, showStatus } from "./board-dom.js";

const workspaceHistoryDialog = $<HTMLDialogElement>("#workspace-history-dialog");
const workspaceHistoryTitle = $("#workspace-history-title");
const workspaceHistoryList = $("#workspace-history-list");
const closeWorkspaceHistory = $<HTMLButtonElement>("#close-workspace-history");
const saveWorkspaceVersionBtn = $<HTMLButtonElement>("#save-workspace-version");

let historyWorkspaceId: string | null = null;

function emptyMessage(text: string): void {
  workspaceHistoryList.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: text }));
}

export async function openWorkspaceHistoryDialog(workspaceId: string, workspaceTitle: string): Promise<void> {
  historyWorkspaceId = workspaceId;
  workspaceHistoryTitle.textContent = i18n.t("workspaceHistoryTitle", [workspaceTitle]);
  saveWorkspaceVersionBtn.textContent = i18n.t("saveAsVersion") || "保存为一版";
  emptyMessage(i18n.t("loading"));
  workspaceHistoryDialog.showModal();
  try {
    const result = await send<{ history: WorkspaceHistory | null }>({ type: "get-workspace-history", id: workspaceId });
    renderWorkspaceHistory(result.history ?? { workspaceId, versions: [] });
  } catch (error) {
    emptyMessage(error instanceof Error ? error.message : String(error));
  }
}

function renderWorkspaceHistory(history: WorkspaceHistory): void {
  const versions = history.versions.slice().sort((a, b) => b.version - a.version);
  if (versions.length === 0) {
    emptyMessage(i18n.t("noHistory"));
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
    const openUrls = await getOpenTabUrls();
    const result = await send<{ ok: boolean; created: number }>({
      type: "restore-workspace-history-version",
      id: historyWorkspaceId,
      version: version.version,
      windowId,
      confirmed: true,
      skipUrls: [...openUrls],
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
    renderWorkspaceHistory(result.history);
    showStatus(i18n.t("versionSaved") || "已保存版本");
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    saveWorkspaceVersionBtn.disabled = false;
  }
}

export function wireWorkspaceHistoryDialog(): void {
  closeWorkspaceHistory.addEventListener("click", () => workspaceHistoryDialog.close());
  saveWorkspaceVersionBtn.addEventListener("click", () => void saveWorkspaceVersion());
}
