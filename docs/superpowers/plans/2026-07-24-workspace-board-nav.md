# 重构：看板导航改为「当前 / 从工作区加载」+ 工作区可编辑回写

> **Status:** ✅ 已实现（v0.1.11）

日期：2026-07-24
分支：feature/20260719

## 目标

把「新建分组」下方的导航从**设备/浏览器跨设备导航**重构为：

- `[当前]`（默认）：看板显示本浏览器实时标签（现有行为）。
- `[从工作区加载]`：列出全部工作区；点击某个工作区，看板按域名自动分组加载其标签，可**删除 / 改标题·网址 / 新增 / 拖拽排序**，每次改动**回写到原工作区数据**（本地 `chrome.storage.local` + 云端 `workspace_snapshots`）。

## 关键决策（已与用户确认）

1. **移除**设备/浏览器跨设备导航 + `device_tab_snapshots` 云同步的全部 TS 代码与测试。已应用的数据库迁移 `007/008` 按规则**保留不动**，`device_tab_snapshots` 表留空闲置（不新增 drop 迁移，避免动线上表）。
2. 工作区可编辑范围：删除 + 编辑标题/网址 + 新增标签 + 拖拽排序。
3. 工作区标签按域名自动分组展示（按 `getSiteKey`）。

## 现状依据

- 工作区已云同步：`WorkspaceSnapshot { id, title, createdAt, tabs: {title,url}[], deviceId?, deviceName? }`；`sync.ts` 已有 `fetchWorkspaces/upsertWorkspace/deleteWorkspaceRow`；background 已有 `get-workspaces/save-workspace/restore-workspace/delete-workspace/set-device-name/add-tab-to-workspace` handler。
- 看板围绕**实时标签（带 tabId）**构建：`renderTab` 用 `tab.id` 做激活/关闭/推迟/拖拽。工作区标签无 tabId，需独立渲染路径。
- `buildBoardCards(groups)` / `segmentTabs` / `placeBoardCards` / `boardCardsForDevice` / `manualBoardGridRow` 可复用做卡片布局。
- 项目 TDD：纯函数放 `shared.ts` 并在 `tests/shared.test.js` 补测试；测试从 `../dist/*` 导入，`npm test` 先构建再跑。

---

## 任务分解（TDD，每个纯函数先写失败测试）

### 任务 1 — shared.ts：删除设备系统 + 新增工作区纯函数

**删除**：`DeviceTabSnapshotTab/Group/Snapshot/SyncRow`、`DeviceNavBrowser/Device/Tree` 类型；`buildDeviceTabSnapshot`、`validateDeviceTabSnapshot`（及私有 `validateDeviceTabSnapshotTab/Group`）、`deviceTabSnapshotToSyncRow`、`deviceTabSnapshotFromSyncRow`、`groupSnapshotsByDevice`。
**保留**：`BrowserKind`、`detectBrowserKind`、`isBrowserKind`、`BROWSER_KINDS`（`storage.ts` 的 `defaultDeviceName` 仍用其生成设备名后缀）。
**移除设置字段**：`Settings.syncTabSnapshotsEnabled`、`DEFAULT_SETTINGS.syncTabSnapshotsEnabled`、`settingsFromSyncRow` / `validateOptionsSettings`（allowedKeys + 字段）/ `SettingsSyncRow.sync_tab_snapshots_enabled` 中的相关项。

**新增纯函数**（均加测试）：
- `groupWorkspaceTabsByDomain(tabs: readonly WorkspaceTab[]): BoardLogicalGroup[]` — 按 `getSiteKey(url)` 分组；非 http(s) 归 `ungrouped`；每组 `kind:"automatic"`、`boardKey: auto:<site> | "ungrouped"`、`title` 为域名或「未分组」、`color` 按站点索引取固定调色板（确定性）、`rank` 按标签数降序再按域名；`tabs` 为对应 `BoardTab`（`id:0, windowId:0`，带 url/title，favIconUrl 留空）。空数组返回 `[]`。
- `moveWorkspaceTab(tabs, fromIndex, toIndex): WorkspaceTab[] | null` — 越界/相同返回 null，否则返回重排后新数组（不改原数组）。
- `updateWorkspaceTab(tabs, index, title, url): WorkspaceTab[] | null` — 越界或 `workspaceTab({title,url})` 校验失败返回 null，否则替换该index。
- `removeWorkspaceTab(tabs, index): WorkspaceTab[] | null` — 越界返回 null，否则返回删除后新数组。
- `appendWorkspaceTab(tabs, tab): WorkspaceTab[] | null` — `workspaceTab` 校验失败返回 null，否则追加。

### 任务 2 — sync.ts：删除设备函数 + 设置同步去字段

- 删除 `fetchDeviceTabSnapshots`、`upsertDeviceTabSnapshot` 及设备类型 import。
- `settingsSyncRow` / `pushSettings`（body `sync_tab_snapshots_enabled`）/ `syncSettings`（select 列表）移除 `sync_tab_snapshots_enabled`。

### 任务 3 — background.ts：删设备 handler + 增工作区看板 handler

**删除**：`currentBrowserKind`、`pushDeviceTabSnapshot`、`scheduleDeviceTabSnapshotPush`、`snapshotPushTimer`、`ensureCurrentBrowser`、`getDeviceNav`、`getDeviceBoard`；消息分支 `get-device-nav`、`get-device-board`；`onUpdated/onRemoved/onMoved/onAttached/onDetached` 五个仅触发快照推送的监听整段删除；`onCreated` 监听**保留** `openBoardOnNewTab` 逻辑，仅删掉其中 `scheduleDeviceTabSnapshotPush()` 调用；`set-device-name` 删 `pushDeviceTabSnapshot(...)` 调用（保留 `renameDeviceWorkspaces`）；`sync-now` 删 `pushDeviceTabSnapshot(...)` 调用；清理设备相关 import。

**新增 handler**（均 `requireBoardUser` + 校验 id/index，复用 `loadAllWorkspaces`/`upsertWorkspace`/`saveWorkspaceSnapshots`）：
- `get-workspace-board {id}` → `{ workspace:{id,title,createdAt,deviceName}, cards: buildBoardCards(groupWorkspaceTabsByDomain(ws.tabs)) }`。
- `update-workspace-tab {id,index,title,url}` → `updateWorkspaceTab` 后 upsert+save，`{ok:true}`。
- `remove-workspace-tab {id,index}` → `removeWorkspaceTab` 后 upsert+save，`{ok:true}`。
- `move-workspace-tab {id,fromIndex,toIndex}` → `moveWorkspaceTab` 后 upsert+save，`{ok:true}`。
- 新增标签复用已有 `add-tab-to-workspace {id,tab:{title,url}}`（已 append+同步）。

### 任务 4 — board.ts：用 scope 导航替换设备导航 + 工作区可编辑看板

**删除**全部设备导航代码：状态 `currentScope/currentDeviceIdentity/deviceNavTree/navScope/selectedOtherDevice/boardReadOnly`；元素 `deviceNav/remoteHeader`；函数 `renderDeviceNav/makeScopeButton/makeDeviceButton/makeChevron/makeBrowserList/setNavScope/locateScope/syncNavFromScope/loadDeviceNav/selectScope/setReadOnlyMode/loadRemoteBoard/renderReadOnlyTab/renderReadOnlyCard/renderDeviceBrowserButton/browserLabel/relativeTime`；`load()` 中 `if(!currentScope) await loadDeviceNav()`；`refreshScope` 简化为 `refresh()->load()`；清理 import（`DeviceNav*`、`BrowserKind` 若仅设备用）。

**新增**：
- 状态：`scopeMode:"current"|"workspace"`、`loadedWorkspace:{id,title,createdAt,deviceName}|null`、`workspaceCards:BoardSegmentCard[]`；复用已有 `workspaces`。
- `renderScopeNav()`：渲染 `[当前][从工作区加载]` 分段开关；`从工作区加载` 激活时右侧内联列出工作区按钮（标题 + 标签数 + 相对时间/设备名），选中态高亮。
- `selectScopeMode(mode)`、`loadWorkspacesForNav()`（复用 `get-workspaces`）。
- `loadWorkspaceBoard(id)`：发 `get-workspace-board`，存 `loadedWorkspace`+`workspaceCards`，`setWorkspaceMode(true)`，渲染。
- `renderWorkspaceBoard()`：用 `placeBoardCards`+`boardCardsForDevice`+`manualBoardGridRow` 布局；每卡 `renderWorkspaceCard`。
- `renderWorkspaceCard(card,placement)`：标题=域名/未分组，**无**分组工具（rename/color/delete-group）；标签用 `renderWorkspaceTab`。
- `renderWorkspaceTab(tab, flatIndex)`：图标+标题（点击=`chrome.tabs.create` 打开）；✎ 编辑按钮（内联切 title/url 输入 + 保存/取消，保存发 `update-workspace-tab`）；× 删除按钮（发 `remove-workspace-tab`）；`draggable` 拖拽排序（dragData 用 `workspace-tab`+flatIndex，drop 发 `move-workspace-tab`）；**无**推迟/激活/关闭实时标签。
- 顶部「新增标签」入口（url 输入 + 可选标题）→ 发 `add-tab-to-workspace`。
- `setWorkspaceMode(on)`：工作区模式下隐藏 `new-group-form`、`window-filter`、`deferred-reminders`、`board-statistics`、`review-duplicates`；保留 `board-search`（过滤）、`refresh`、`open-workspaces`（管理对话框）。
- `returnToCurrent()`：`scopeMode="current"` + `load()`。
- `#workspace-header`：显示 `工作区：名称 · N 标签 · 更新于…` + `[返回当前]`。
- 每次改动后重载 `loadWorkspaceBoard(id)` 以刷新分组与索引。

### 任务 5 — board.html + board.css

- board.html：`<nav id="device-nav">` → `<nav id="scope-nav">`（含 scopes 容器 + `#scope-nav-workspaces`）；`<div id="remote-header">` → `<div id="workspace-header" class="hidden">`。
- board.css：删除 `.device-nav*`、`.remote-header`、`.readonly-tab`；新增 `.scope-nav*`、`.workspace-nav*`（工作区按钮列表）、`.workspace-header`、`.workspace-tab`（含编辑态输入、删除/编辑按钮）样式，沿用现有配色。

### 任务 6 — options.html + options.ts：移除 tab-snapshots 开关

- options.html：删除 `tab-snapshots-sync` 的 `<label class="switch">` 及其 `<p id="tab-snapshots-sync-description">`。
- options.ts：删除 `tabSnapshotsSync` 引用、`render` 中 `tabSnapshotsSync.checked=…`、`settingsPayload` 中 `syncTabSnapshotsEnabled`。

### 任务 7 — tests/shared.test.js：删设备测试 + 增工作区测试

- 删除：`buildDeviceTabSnapshot`/`groupSnapshotsByDevice`/`validateDeviceTabSnapshot`/设备 sync-row 转换/`syncTabSnapshotsEnabled` 往返/`device_tab_snapshots` 同步/`get-device-nav`/`get-device-board`/看板导航只读/options `tab-snapshots-sync` 开关等测试；更新两处 `deepEqual`（去掉 `syncTabSnapshotsEnabled`/`sync_tab_snapshots_enabled`）。
- 新增：`groupWorkspaceTabsByDomain`（按域名分组/未分组/空/颜色确定性）、`moveWorkspaceTab`/`updateWorkspaceTab`/`removeWorkspaceTab`/`appendWorkspaceTab`；`get-workspace-board`/`update-workspace-tab`/`remove-workspace-tab`/`move-workspace-tab` 消息分支与 `add-tab-to-workspace` 复用断言；`board.html` 含 `id="scope-nav"`、`board.ts` 发 `get-workspace-board`、`board.css` 含 `.scope-nav` 的断言。

### 任务 8 — AGENTS.md：回写数据同步策略

- 改写 114-132 行：移除 `syncTabSnapshotsEnabled`/`device_tab_snapshots` 快照段；声明**工作区**是跨设备机制——标签内容（标题/网址）仅作为用户显式保存的工作区快照同步到 `workspace_snapshots`，从不自动/实时上传；运行时标签 ID（tabId/windowId/boardAssignments）永不上传；保留 RLS/anon key/无 tabGroups 权限等既有禁令。

---

## 验证

- `npm run typecheck` 干净。
- `npm test` 全绿（TDD：先红后绿）。
- 无行尾空格。
- 浏览器预览：看板页依赖扩展运行时，无法真实填充数据；用注入 `#scope-nav` 样例 DOM（分段开关 + 工作区列表 + 工作区卡片含可编辑标签行）的方式校验横向布局与样式，截图环境仍不可见则以 `preview_inspect` 确认。
- **不提交、不 push、不开 PR**（遵循用户规则）。

## 风险与备注

- 跨卡拖拽：工作区分组按域名自动派生，跨域名卡拖拽只会重排扁平数组、标签仍落回原域名卡——属可接受简化（同卡内排序为主）。
- 迁移 007/008 保留，`device_tab_snapshots` 表闲置；如后续要清理需单独经用户确认的新迁移。
- `set-device-name`、`get-workspaces` 等仍依赖 `getOrCreateDeviceId/Name`（工作区需要 deviceId/deviceName 归属），保留。
