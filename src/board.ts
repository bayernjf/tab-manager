import { isBoardKey, placeBoardCards, type BoardKey, type BoardLayout, type BoardSegmentCard, type GroupColor } from "./shared.js";

interface BoardState {
  user: { id: string; email?: string } | null;
  loginRequired: boolean;
  message?: string;
  groups: BoardSegmentCard[];
  layouts?: BoardLayout[];
}

interface BoardResponse { error?: string }

const $ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

const boardGrid = $("#board-grid");
const boardContent = $("#board-content");
const loginRequired = $("#login-required");
const loginMessage = $("#login-message");
const status = $("#board-status");
const autoFill = $<HTMLInputElement>("#auto-fill");
const newGroupForm = $<HTMLFormElement>("#new-group-form");
const newGroupTitle = $<HTMLInputElement>("#new-group-title");
const newGroupColor = $<HTMLSelectElement>("#new-group-color");

let currentState: BoardState | null = null;

async function send<T>(message: unknown): Promise<T> {
  const response = await chrome.runtime.sendMessage(message) as T & BoardResponse;
  if (response?.error) throw new Error(response.error);
  return response;
}

function showStatus(message: string, error = false): void {
  status.textContent = message;
  status.className = error ? "status error" : "status";
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
  row.tabIndex = 0;
  row.title = tab.url || tab.title;
  row.setAttribute("aria-label", `标签：${tab.title}`);
  const icon = document.createElement("img");
  icon.className = "tab-icon";
  icon.alt = "";
  icon.src = tab.favIconUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
  const title = document.createElement("span");
  title.className = "tab-title";
  title.textContent = tab.title;
  row.append(icon, title);
  row.addEventListener("dragstart", (event) => {
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

function renderCard(card: BoardSegmentCard, rank: number, automatic: boolean): HTMLElement {
  const article = document.createElement("article");
  article.className = "group-card";
  article.dataset.height = String(card.heightUnits);
  article.style.setProperty("--group-color", groupColor(card.color));
  const canMoveGroup = card.boardKey !== "ungrouped" && card.segmentIndex === 0;
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

function renderBoard(state: BoardState): void {
  boardGrid.replaceChildren();
  const layouts = state.layouts ?? [];
  const movable = state.groups.filter((card) => card.boardKey !== "ungrouped");
  const automatic = !movable.some((card) => layouts.find((layout) => layout.boardKey === card.boardKey && layout.deviceClass === deviceClass())?.autoFill === false);
  autoFill.checked = automatic;
  autoFill.disabled = movable.length === 0;
  const cards = state.groups.map((card) => {
    const layout = layouts.find((item) => item.boardKey === card.boardKey && item.deviceClass === deviceClass());
    return { ...card, manualLane: layout?.manualLane, manualOrder: layout?.manualOrder };
  });
  const placement = placeBoardCards(cards, laneCount(), automatic);
  const lanes = Array.from({ length: laneCount() }, () => {
    const lane = document.createElement("div");
    lane.className = "board-lane";
    return lane;
  });
  for (const item of [...placement.placements].sort((left, right) => left.lane - right.lane || left.order - right.order)) {
    const card = cards.find((candidate) => candidate.boardKey === item.boardKey && candidate.segmentIndex === item.segmentIndex);
    const lane = lanes[item.lane];
    if (card && lane) lane.append(renderCard(card, card.rank, automatic));
  }
  boardGrid.append(...lanes);
}

async function load(): Promise<void> {
  const state = await send<BoardState>({ type: "get-board-state" });
  currentState = state;
  const needsLogin = state.loginRequired || !state.user;
  loginRequired.classList.toggle("hidden", !needsLogin);
  boardContent.classList.toggle("hidden", needsLogin);
  if (needsLogin) {
    loginMessage.textContent = state.message || "请先登录后使用标签看板。";
    return;
  }
  renderBoard(state);
}

async function moveTab(tabId: number, targetBoardKey: BoardKey, position: "before" | "after" | "append", targetTabId?: number): Promise<void> {
  try {
    await send({ type: "move-board-tab", drop: { tabId, targetBoardKey, position, ...(targetTabId === undefined ? {} : { targetTabId }) } });
    showStatus("标签已移动");
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
  const cards = currentState.groups.filter((card) => card.boardKey !== "ungrouped" && card.segmentIndex === 0).map((card) => {
    const layout = layouts.find((item) => item.boardKey === card.boardKey && item.deviceClass === deviceClass());
    return { ...card, manualLane: layout?.manualLane, manualOrder: layout?.manualOrder };
  });
  const placement = placeBoardCards(cards, laneCount(), false);
  const byKey = new Map(cards.map((card) => [card.boardKey, card]));
  const targetPlacement = placement.placements.find((item) => item.boardKey === targetBoardKey);
  if (!targetPlacement) throw new Error("目标分组已变化，请刷新看板后重试");
  const lanes = Array.from({ length: laneCount() }, (_value, lane) => placement.placements
    .filter((item) => item.lane === lane && item.boardKey !== boardKey)
    .sort((left, right) => left.order - right.order));
  const destination = lanes[targetPlacement.lane];
  if (!destination) throw new Error("目标分组位置无效");
  const targetIndex = destination.findIndex((item) => item.boardKey === targetBoardKey);
  if (targetIndex < 0) throw new Error("目标分组已变化，请刷新看板后重试");
  const moved = placement.placements.find((item) => item.boardKey === boardKey);
  const movedCard = byKey.get(boardKey);
  if (!moved || !movedCard) throw new Error("分组已变化，请刷新看板后重试");
  destination.splice(targetIndex, 0, { ...moved, lane: targetPlacement.lane });
  await Promise.all(lanes.flatMap((lane, laneIndex) => lane.flatMap((item, order) => {
    const card = byKey.get(item.boardKey);
    return card ? [send({ type: "save-board-layout", layout: { boardKey: card.boardKey, deviceClass: deviceClass(), rank: card.rank, autoFill: false, manualLane: laneIndex, manualOrder: order } })] : [];
  })));
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
  const groups = currentState.groups.filter((card) => card.boardKey !== "ungrouped" && card.segmentIndex === 0);
  try {
    await Promise.all(groups.map((card, index) => send({
      type: "save-board-layout",
      layout: enabled
        ? { boardKey: card.boardKey, deviceClass: deviceClass(), rank: card.rank, autoFill: true }
        : { boardKey: card.boardKey, deviceClass: deviceClass(), rank: card.rank, autoFill: false, manualLane: index % laneCount(), manualOrder: Math.floor(index / laneCount()) },
    })));
    showStatus(enabled ? "已启用自动填充" : "已关闭自动填充");
    await load();
  } catch (error) {
    autoFill.checked = !enabled;
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
}

$("#refresh").addEventListener("click", () => void load().catch((error) => showStatus(String(error), true)));
autoFill.addEventListener("change", () => void saveAutoFill(autoFill.checked));
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
