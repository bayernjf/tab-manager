import { i18n } from "./i18n.js";
import { getSiteKey } from "./shared.js";
import { $, faviconFor, makeButton } from "./board-dom.js";

type ClosedTab = NonNullable<chrome.sessions.Session["tab"]> & { sessionId?: string };

const recentlyClosedDialog = $<HTMLDialogElement>("#recently-closed-dialog");
const recentlyClosedList = $("#recently-closed-list");
const recentlyClosedSearch = $<HTMLInputElement>("#recently-closed-search");

let recentlyClosedItems: { tab: ClosedTab; time: number }[] = [];

export async function openRecentlyClosed(): Promise<void> {
  recentlyClosedSearch.value = "";
  recentlyClosedList.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: i18n.t("loading") }));
  recentlyClosedDialog.showModal();
  try {
    const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 25 });
    recentlyClosedItems = [];
    for (const session of sessions) {
      if (session.tab) {
        recentlyClosedItems.push({ tab: session.tab as ClosedTab, time: (session.lastModified ?? 0) * 1000 });
      } else if (session.window?.tabs?.length) {
        for (const tab of session.window.tabs.slice(0, 3)) {
          recentlyClosedItems.push({ tab: tab as ClosedTab, time: (session.lastModified ?? 0) * 1000 });
        }
      }
    }
    renderRecentlyClosedList("");
  } catch (error) {
    recentlyClosedList.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: error instanceof Error ? error.message : String(error) }));
  }
}

export function renderRecentlyClosedList(query: string): void {
  const q = query.trim().toLowerCase();
  const items = q ? recentlyClosedItems.filter((item) => {
    const t = item.tab;
    return (t.title && t.title.toLowerCase().includes(q)) || (t.url && t.url.toLowerCase().includes(q));
  }) : recentlyClosedItems;
  if (!items.length) {
    recentlyClosedList.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: recentlyClosedItems.length ? i18n.t("noMatchingTabs") : i18n.t("recentlyClosedEmpty") }));
    return;
  }
  const fallback = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
  recentlyClosedList.replaceChildren(...items.map((item) => {
    const row = document.createElement("div");
    row.className = "recently-closed-row";
    const t = item.tab;
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
}

export function closeRecentlyClosedDialog(): void {
  recentlyClosedDialog.close();
}
