import { i18n } from "./i18n.js";
import {
  boardTabMatchesQuery,
  formatDeferredDateTime,
  getSiteKey,
  isDeferredTabDue,
  matchesTimelineFilter,
  type BoardSegmentCard,
  type BoardTab,
  type DeferredTab,
  type GroupColor,
  type TimelineFilterRange,
} from "./shared.js";
import { faviconFor, send } from "./board-dom.js";

interface TimelineTabItem {
  tab: BoardTab;
  groupTitle: string;
  groupColor: GroupColor;
  createdAt?: number;
  dueAt?: string;
  isDeferred?: boolean;
  deferredId?: string;
}

export interface TimelineRenderContext {
  cards: BoardSegmentCard[];
  query: string;
  windowId: string;
  sortBy: string;
  filter: TimelineFilterRange;
  grid: HTMLElement;
  groupColor: (color: GroupColor) => string;
  activate: (tabId: number) => Promise<void>;
}

export async function renderTimelineView(ctx: TimelineRenderContext): Promise<void> {
  const { cards, query, windowId, filter, grid } = ctx;
  const sortBy = ctx.sortBy as "created" | "due";
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
    return matchesTimelineFilter(refDate, filter, now);
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
    grid.className = "board-timeline";
    grid.replaceChildren(Object.assign(document.createElement("p"), { className: "empty board-empty", textContent: i18n.t("noMatchingTabs") }));
    return;
  }
  grid.className = "board-timeline";
  grid.replaceChildren(...filtered.map((item) => {
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
    group.style.background = ctx.groupColor(item.groupColor) + "33";
    group.style.color = ctx.groupColor(item.groupColor);
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
      row.addEventListener("click", () => void ctx.activate(item.tab.id!));
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
