/**
 * Deferred reminders: the per-tab defer menu, the reminder list with
 * open/delete actions, the scheduled-countdown helper, and the inline board
 * statistics that read the same reminder store. board.ts owns the page shell,
 * so cross-subsystem hooks arrive through initDeferredBoard.
 */

import { i18n } from "./i18n.js";
import {
  deferredRemindersHidden,
  formatDeferredDateTime,
  getSiteKey,
  isDeferredTabDue,
  nextDeferredOccurrence,
  type BoardSegmentCard,
  type DeferredTab,
} from "./shared.js";
import { $, makeButton, send, showStatus } from "./board-dom.js";

export interface DeferredBoardDeps {
  reload: () => Promise<void>;
  isWorkspaceScope: () => boolean;
  shortcutTimes: () => readonly string[];
}

let deps: DeferredBoardDeps;

export function initDeferredBoard(next: DeferredBoardDeps): void {
  deps = next;
}

const deferredReminders = $("#deferred-reminders"), deferredList = $("#deferred-list");
const boardStatsInline = $("#board-stats-inline");

async function deferTab(tabId: number, dueAt: string): Promise<void> { try { await send({ type: "defer-board-tab", tabId, dueAt: new Date(dueAt).toISOString() }); showStatus(i18n.t("addedToLater")); await deps.reload(); } catch (error) { showStatus(error instanceof Error ? error.message : String(error), true); } }

export { deferTab };

export function openDeferMenu(tab: BoardSegmentCard["tabs"][number], toggleButton: HTMLButtonElement): void {
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
  const times = deps.shortcutTimes();
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
  positionDeferMenu(menu, toggleButton);
  onOutside = (event: MouseEvent) => { if (!menu.contains(event.target as Node) && !toggleButton.contains(event.target as Node)) closeMenu(); };
  onScroll = () => positionDeferMenu(menu, toggleButton);
  onResize = () => positionDeferMenu(menu, toggleButton);
  setTimeout(() => {
    if (onOutside) document.addEventListener("mousedown", onOutside, true);
    if (onScroll) document.addEventListener("scroll", onScroll, true);
    if (onResize) window.addEventListener("resize", onResize);
  }, 0);
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

export async function renderDeferredTabs(): Promise<void> {
  const tabs = (await send<{ tabs: DeferredTab[] }>({ type: "get-deferred-tabs" })).tabs
    .sort((first, second) => Date.parse(first.dueAt) - Date.parse(second.dueAt));
  deferredReminders.classList.toggle("hidden", deferredRemindersHidden({ workspaceMode: deps.isWorkspaceScope(), deferredCount: tabs.length }));
  deferredList.replaceChildren(...tabs.map(renderDeferredRow));
}

export async function renderBoardStatistics(): Promise<void> {
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
