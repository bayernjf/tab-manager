# Tab Garden 项目级代码审计与功能梳理报告

> 审计日期：2026-09-30
> 审计分支：`feature/20260719`
> 代码基线：约 12,300 行（`src/` 9,600 + `tests/` 3,069），TypeScript strict + 原生 HTML/CSS
> 验证基线：`npm run typecheck` ✅ 0 错误 / `npm test` ✅ 205/205 通过 / 构建 ✅
> 审计方式：全量通读 `src/` 全部 TS/HTML/CSS、`supabase/migrations/001–013`、`tests/`、`e2e/`、`scripts/`，并交叉验证 `manifest.json`、`AGENTS.md`、`handoff.md`

---

## 目录

1. [审计结论摘要](#1-审计结论摘要)
2. [项目架构全景](#2-项目架构全景)
3. [产品功能点全梳理](#3-产品功能点全梳理)
4. [代码审计发现](#4-代码审计发现)
5. [合规性与亮点确认](#5-合规性与亮点确认)
6. [修复优先级路线图](#6-修复优先级路线图)
7. [附录](#7-附录)

---

## 1. 审计结论摘要

### 1.1 总体评价

| 维度 | 评级 | 说明 |
|---|---|---|
| 安全与隐私 | 🟢 良好 | 零 `innerHTML`、无 `tabGroups`、无 `<all_urls>`、RLS 全覆盖、service_role 不可能进入产物、运行时 ID 未上云 |
| 权限最小化 | 🟢 良好 | 仅 `tabs/storage/notifications/alarms/sessions` + `https://*.supabase.co/*`，无 content_scripts、无 WAR |
| 静态类型与测试 | 🟢 良好 | strict 全通过，205 条 Node 测试 + 14 条 E2E，校验函数体系完整 |
| 数据一致性 | 🔴 有风险 | 云端列表直接覆盖本地、TS/DB 字段长度不一致、storage 无配额保护 |
| 并发与竞态 | 🟠 待改进 | 无写入串行化、无 in-flight 刷新锁、`load()` 无并发令牌 |
| 前端状态管理 | 🟠 待改进 | 工作区模式 `tab.id` 与真实 tabId 串台、resize/键盘未按视图分派 |
| 技术债 | 🟠 待清理 | 4 个 RPC 死代码、废弃表与列、13 处契约测试、i18n 缺失键 |

### 1.2 发现统计

| 严重度 | 数量 | 定义 |
|---|---|---|
| **P0（高）** | 5 | 可导致用户数据丢失、账号被误登出、核心链路失效 |
| **P1（中）** | 24 | 明确的功能错误、静默失败、性能或一致性问题 |
| **P2（低）** | 22 | 技术债、可访问性、i18n、死代码、CSS 细节 |

**最需要优先处理的 5 项：**

1. **P0-1** 云端工作区列表直接覆盖本地 → 离线期间创建的工作区被静默删除
2. **P0-2** 并发刷新 token 无锁 → 有效会话被误判失效并强制登出
3. **P0-3** popup 保存设置基于 `DEFAULT_SETTINGS` 展开 → 静默重置云端同步开关等设置
4. **P0-4** 工作区标题 TS 允许 160 字符、数据库只允许 80 → 81–160 字工作区无法上云
5. **P0-5** 通知去重集合被 `onClosed` 清除 → 划掉通知后每分钟重复弹窗

---

## 2. 项目架构全景

### 2.1 分层结构

```text
┌─────────────────────────────────────────────────────┐
│  前台（不持有 token / 不直连数据库）                    │
│  popup.ts (244)   options.ts (116)   board.ts (2233) │
│  popup.html       options.html       board.html      │
│         └── chrome.runtime.sendMessage ──┐           │
└──────────────────────────────────────────┼───────────┘
                                           ▼
┌─────────────────────────────────────────────────────┐
│  background.ts (1448) — MV3 service worker          │
│  · 61 个消息 RPC 分支（chrome.runtime.onMessage）     │
│  · chrome.alarms 到期轮询 / chrome.notifications     │
│  · chrome.commands 快捷键 / chrome.tabs.onCreated    │
└───────────┬──────────────────────┬──────────────────┘
            ▼                      ▼
┌────────────────────┐  ┌──────────────────────────┐
│ storage.ts (257)   │  │ auth.ts (149) sync.ts(330)│
│ chrome.storage.    │  │ Supabase Auth REST        │
│ local · 16 个键     │  │ PostgREST · 6 张表        │
└────────────────────┘  └────────────┬──────────────┘
            ▲                        ▼
            │            ┌──────────────────────────┐
            └────────────│ shared.ts (1415)          │
                         │ 49 类型 / 常量 / 纯函数    │
                         │ 30+ validate* 校验器       │
                         └──────────────────────────┘
```

### 2.2 模块职责

| 文件 | 行数 | 职责 |
|---|---|---|
| `src/shared.ts` | 1415 | 类型、常量、`DEFAULT_SETTINGS`、域名标准化、看板构建、工作区/提醒纯函数、30+ 校验器、snake_case↔camelCase 转换 |
| `src/background.ts` | 1448 | 消息路由（61 分支）、分组协调、alarms、通知、快捷键、工作区 RPC、导入导出、云同步调度 |
| `src/board.ts` | 2233 | 新标签页看板：双视图、批量操作、键盘导航、拖拽、工作区编辑、弹窗、搜索过滤 |
| `src/storage.ts` | 257 | `chrome.storage.local` 16 个键的读写，含 `clearUserData()` |
| `src/sync.ts` | 330 | PostgREST 请求封装，6 张表的 fetch/replace/upsert |
| `src/auth.ts` | 149 | Supabase Auth REST：注册/登录/刷新/退出/恢复会话 |
| `src/i18n.ts` | 145 | 语言检测、`data-i18n` 批量替换、占位符替换 |
| `src/board-dom.ts` | 80 | `$()` / `send()` / toast / 按钮工厂 / favicon |
| `src/board-history.ts` | 153 | 工作区版本历史弹窗 |
| `src/popup.ts` | 244 | 登录注册、当前窗口标签管理、快捷设置 |
| `src/options.ts` | 116 | 设置表单、同步状态、导入导出入口 |

### 2.3 数据流要点

- **前台永不直连 Supabase**：全部经 `background.ts` 转发，错误以 `{ error: string }` 返回。
- **本地优先、云端兜底**：设置变更先 `saveSettings()` 再 `pushSettings()`；云端失败保留本地并返回可重试状态。
- **冲突策略**：`resolveCloudCollection()`（`shared.ts:1093`）远端非空则远端优先，远端空则用本地初始化——与 `AGENTS.md` 约定一致。
- **运行时 ID 隔离**：`tabId` / `windowId` / `boardAssignments` 只存本地；工作区快照仅 `{title, url}`，由 `validateWorkspaceTab()`（`shared.ts:406`）用 `new URL()` 重建天然剔除。

---

## 3. 产品功能点全梳理

> 状态图例：✅ 正常 ｜ ⚠️ 有缺陷（见第 4 章编号）｜ 🔇 死代码（实现存在但链路不通）

### 3.1 认证与账号（`auth.ts` / `popup.ts`）

| # | 功能点 | 状态 | 实现位置 |
|---|---|---|---|
| 1.1 | 邮箱注册 | ✅ | `auth.ts:79-87` → `background.ts:777` |
| 1.2 | 邮件确认双分支（开启需确认 / 关闭直接建会话） | ✅ | `auth.ts:83-86`，`popup.ts:87-96` |
| 1.3 | 密码登录 | ✅ | `auth.ts:89-96` |
| 1.4 | 记住设备（7 天） | ✅ | `auth.ts:72-77` `rememberUntil` |
| 1.5 | 会话恢复 | ✅ | `auth.ts:98-110` `getCurrentUser()` |
| 1.6 | access token 自动刷新（提前 60s） | ⚠️ P0-2 | `auth.ts:119-132` |
| 1.7 | 退出登录 | ✅ | `auth.ts:142-149` → `background.ts:782` |
| 1.8 | 账号切换本地数据清理（7 个用户键） | ⚠️ P1-14 | `storage.ts:241-249` `clearUserData()` |
| 1.9 | 跨账号数据隔离（`optionsUserId` 比对） | ✅ | `storage.ts:77-92` `prepareOptionsForUser` |

### 3.2 标签看板 — 分组（`board.ts` / `shared.ts`）

| # | 功能点 | 状态 | 实现位置 |
|---|---|---|---|
| 2.1 | 自动分组（按标准化 hostname，`www` 归一） | ✅ | `shared.ts:709-760` `buildVirtualBoardGroups` |
| 2.2 | 自动分组阈值 `minimumTabs`（2–20） | ✅ | `shared.ts:746`，DB `001:30-31` |
| 2.3 | 自定义分组：创建 / 删除 / 排序 | ✅ | `background.ts:1139/1150/1123` |
| 2.4 | 自定义分组重命名、改色 | ✅ | `background.ts:1142` `boardGroupColor()` |
| 2.5 | 分组折叠 + 持久化 | ⚠️ P1-22 | `board.ts:115-141`，键 `board_collapsed_groups` |
| 2.6 | 折叠状态按窗口维度记忆（`Record<windowId, string[]>`） | ✅ | `board.ts:110-134` |
| 2.7 | 拖拽标签到目标分组 | ✅ | `board.ts:1884` `moveTab` + `move-board-tab` |
| 2.8 | 拖拽调整分组顺序（手动布局持久化） | ✅ | `board.ts:1965` `moveGroup` + `save-board-layout` |
| 2.9 | 自动填充 / 手动布局切换 | ✅ | `shared.ts:878` `validateBoardLayout` |
| 2.10 | 分组规则（域名/关键词 → 分组） | ⚠️ P1-12 | `options.ts` + `create/update/delete-group-rule` |
| 2.11 | 忽略站点 | ✅ | `create/delete-ignored-site` |
| 2.12 | 固定标签页与浏览器内部页排除 | ✅ | `background.ts:384` `!tab.pinned && getSiteKey()` |

### 3.3 标签看板 — 视图与交互

| # | 功能点 | 状态 | 实现位置 |
|---|---|---|---|
| 3.1 | 看板视图（分组卡片网格，1/2/3 列响应式） | ✅ | `board.ts:1337` `renderBoard` |
| 3.2 | 时间线视图（按创建/提醒时间排序） | ✅ | `board.ts:290` `renderTimeline` |
| 3.3 | 时间线快捷过滤（全部/今天/3天/1周） | ⚠️ P1-26 | `shared.ts:473` `matchesTimelineFilter` |
| 3.4 | 顶部搜索（标题/URL 实时过滤） | ✅ | `board.ts:1327` `filteredCards` |
| 3.5 | 窗口过滤下拉 | ✅ | `board.ts:1317` `renderWindowFilter` |
| 3.6 | 标签操作：激活 / 关闭 / 稍后 / 存工作区 / 移动 | ✅ | `board.ts:1899/1905/1041/1043` |
| 3.7 | 批量选择模式（checkbox 多选） | ✅ | `board.ts:143` `setSelectMode` |
| 3.8 | 批量关闭 / 批量稍后 / 批量移动分组 | ⚠️ P1-28 | `board.ts:198/213/253` |
| 3.9 | 键盘导航 `j/k/d/m/Enter/Esc` | ⚠️ P0-6/P1-24 | `board.ts:2111-2168` |
| 3.10 | 重复标签去重（按 URL 分组，每组保留 1） | ✅ | `board.ts:1373-1417` + `shared.ts:382` |
| 3.11 | 最近关闭标签（`chrome.sessions` 直读，25 条） | ✅ | `board.ts:393-414` |
| 3.12 | 最近关闭全文搜索 | ✅ | `board.ts:416-425` |
| 3.13 | 最近关闭存储链路（`recentlyClosedTabs` + 4 个 RPC） | 🔇 P1-18 | `background.ts:623-649/1319-1352`（永不触发） |
| 3.14 | 看板统计（标签数/重复/稍后/到期） | ⚠️ P1-29 | `background.ts:979-985` |
| 3.15 | 主题切换（亮/暗） | ✅ | `board.ts:1855/2023` |
| 3.16 | 新建分组表单 | ✅ | `board.ts:2179-2191` |
| 3.17 | 返回当前 / 从工作区加载 范围切换 | ✅ | `board.ts:1432-1550` |

### 3.4 工作区

| # | 功能点 | 状态 | 实现位置 |
|---|---|---|---|
| 4.1 | 保存当前窗口为工作区 | ⚠️ P0-1 | `background.ts:822-842` |
| 4.2 | 快速保存（Alt/⌘+S，自动编号去重） | ✅ | `background.ts:693-733` |
| 4.3 | 工作区列表（含设备名、标签数、相对时间） | ✅ | `board.ts:511-557` |
| 4.4 | 加载工作区到看板（按域名自动分组） | ✅ | `board.ts:1550-1594` + `shared.ts:630` |
| 4.5 | 工作区标签编辑（改标题/URL） | ✅ | `board.ts:1688-1718` + `update-workspace-tab` |
| 4.6 | 工作区标签删除 / 新增 / 拖拽排序 | ⚠️ P1-25 | `board.ts:1719/1774/1784` |
| 4.7 | 恢复工作区到窗口（智能对比已打开标签） | ⚠️ P1-27 | `background.ts:852-865` + `shared.ts:454` |
| 4.8 | 恢复预览（显示「✔ 已打开」标记） | ✅ | `board.ts:769` + `shared.ts:454` |
| 4.9 | 工作区版本历史（10 版上限） | ✅ | `board-history.ts` + `shared.ts:1352` |
| 4.10 | 版本恢复 / 保存新版本 / 备注 | ✅ | `board-history.ts:97/127` |
| 4.11 | 工作区 JSON 导出 | ✅ | `background.ts:1387` + `shared.ts:1373` |
| 4.12 | 工作区 JSON 导入（预览 → 确认两步） | ⚠️ P0-x/P1-20 | `background.ts:1393-1443` |
| 4.13 | 工作区重命名 / 设备命名 | ✅ | `board.ts:798` `renameDevice` |
| 4.14 | 工作区对话框拖拽移动 / 缩放 | ⚠️ P1-10 | `board.ts:612/654` |
| 4.15 | 工作区全选 | ✅ | `board.ts:550` `syncWorkspaceSelectAll` |
| 4.16 | 跨设备同步（`workspace_snapshots` 表） | ⚠️ P0-4 | `sync.ts:194-232` |

### 3.5 稍后提醒（Deferred Tabs）

| # | 功能点 | 状态 | 实现位置 |
|---|---|---|---|
| 5.1 | 单标签稍后提醒（自定义到期时间） | ✅ | `background.ts:986-991` |
| 5.2 | 快捷稍后（Alt/⌘+D，当前标签推迟并关闭） | ⚠️ P1-19 | `background.ts:671-691` |
| 5.3 | 批量稍后提醒 | ✅ | `background.ts:992-1023` |
| 5.4 | 提醒列表（打开 / 改期 / 删除） | ✅ | `board.ts:1167-1206` |
| 5.5 | 到期系统通知（`chrome.notifications`） | ⚠️ P0-5 | `background.ts:523-550` |
| 5.6 | 通知点击打开标签并移除提醒 | ✅ | `background.ts:558-579` |
| 5.7 | 到期检查闹钟（1 分钟轮询） | ✅ | `background.ts:587-591` |
| 5.8 | 精确到期的独立闹钟 `deferred-due:<id>` | ✅ | `background.ts:496-503` |
| 5.9 | 快捷提醒时间配置（最多 5 个） | ✅ | `options.ts:9/97`，DB `012:14` |

### 3.6 选项页（`options.html/ts`）

| # | 功能点 | 状态 | 实现位置 |
|---|---|---|---|
| 6.1 | 外观：主题、语言 | ✅ | `options.ts:71` `settingsPayload` |
| 6.2 | 偏好：自动分组、阈值、默认分组颜色 | ✅ | 同上 |
| 6.3 | 新标签页自动打开看板 `openBoardOnNewTab` | ✅ | `background.ts:607-621`，DB `007` |
| 6.4 | 分组规则管理（增删改） | ⚠️ P1-12 | `background.ts:1193-1229` |
| 6.5 | 忽略站点管理（增删改） | ✅ | `background.ts:1230-1252` |
| 6.6 | 快捷提醒时间编辑 | ✅ | `options.ts:97` |
| 6.7 | 同步开关（设置 / 规则 / 忽略列表分开） | ✅ | `options.html` 三个 switch |
| 6.8 | 手动同步 + 同步状态展示 | ⚠️ P1-13 | `background.ts:1176-1181` |
| 6.9 | 设置 JSON 导入导出（两步确认） | ✅ | `background.ts:1175/1253` |
| 6.10 | 快捷键说明卡片 | ✅ | `options.html` + `shared.ts:1288` |
| 6.11 | 侧边栏面板导航（hash 跳转） | ✅ | `options.ts` + `e2e/02-options` |

### 3.7 Popup（`popup.html/ts`）

| # | 功能点 | 状态 | 实现位置 |
|---|---|---|---|
| 7.1 | 登录 / 注册 / 登出 | ✅ | `popup.ts:72-107` |
| 7.2 | 当前窗口标签列表（favicon + 标题） | ✅ | `popup.ts:120-140` |
| 7.3 | 标签复选框多选 | ✅ | `popup.ts:208-210` |
| 7.4 | 批量关闭 / 稍后 / 移动到分组 | ✅ | `popup.ts` 批量区 |
| 7.5 | 自动分组开关 + 阈值快捷设置 | ⚠️ P0-3 | `popup.ts:191-198` |
| 7.6 | 主题切换 | ⚠️ P0-3 | 同上 |
| 7.7 | 打开看板按钮 | ✅ | `open-tab-board` |

### 3.8 快捷键（`manifest.json:21-34`）

| # | 命令 | 默认键 | 状态 | 实现位置 |
|---|---|---|---|---|
| 8.1 | `open-tab-board` | Alt/⌘+B | ✅ | `background.ts:653-669` |
| 8.2 | `defer-active-tab` | Alt/⌘+D | ⚠️ P1-19 | `background.ts:671-691` |
| 8.3 | `save-workspace` | Alt/⌘+S | ✅ | `background.ts:693-733` |

### 3.9 后台与数据

| # | 功能点 | 状态 | 实现位置 |
|---|---|---|---|
| 9.1 | 云同步：用户设置 | ✅ | `sync.ts:79-111` |
| 9.2 | 云同步：分组规则 / 忽略站点 | ⚠️ P1-21 | `sync.ts:127-158`（DELETE+POST 非原子） |
| 9.3 | 云同步：看板自定义分组 / 布局元数据 | ✅ | `sync.ts:162-192` |
| 9.4 | 云同步：工作区快照 | ⚠️ P0-1/P0-4 | `sync.ts:194-232` |
| 9.5 | 设备标识 `deviceId` / `deviceName` | ✅ | `storage.ts:94-113` |
| 9.6 | 新标签页重定向到看板 | ✅ | `background.ts:607-621` |
| 9.7 | Toast 提示 | ✅ | `background.ts:509-521` |
| 9.8 | 国际化（中/英，337 键 ×2） | ⚠️ P2 | `i18n.ts` + `_locales/` |

**功能点合计：约 80 项**，其中 ✅ 正常 62 项、⚠️ 有缺陷 15 项、🔇 死代码 1 项（含 4 个 RPC）。

---

## 4. 代码审计发现

### 4.1 P0 — 高优先级（5 项）

#### P0-1　云端工作区列表直接覆盖本地，可造成数据丢失

- **位置**：`src/background.ts:457-466`
```ts
async function loadAllWorkspaces(userId, cloudSyncEnabled) {
  if (cloudSyncEnabled) {
    const cloud = await fetchWorkspaces(userId).catch(() => null);
    if (cloud) {
      await saveWorkspaceSnapshots(cloud).catch(() => {});   // ← 以云端为准整表覆盖
      return cloud;
```
- **影响**：所有写路径（`save-workspace:827`、`add-tab-to-workspace:910`、`update/remove/move-workspace-tab`、`import-workspaces-json:1416`）都以 `existing = cloud` 为基数回写。若用户在**离线 / 云端失败 / 未登录期间**创建了工作区，下一次云端拉取成功后这些只存在于本地的条目会被**静默删除**。
- **建议**：改为「云端 ∪ 本地」按 `id` 合并（冲突以 `updatedAt` 较新者为准），不要整表覆盖。

#### P0-2　并发刷新 token 无锁，导致有效会话被误判失效并强制登出

- **位置**：`src/auth.ts:112-135`
```ts
if (session.expires_at <= Math.floor(Date.now()/1000) + 60) {
  const data = await request("/token?grant_type=refresh_token", ...);   // ← 无 in-flight 复用
  ...
} catch (error) {
  if (isExplicitAuthenticationFailure(error)) { await saveSession(null); return null; }  // ← 清会话
```
- **影响**：并发源包括 `background.ts:343` 的 `Promise.all([...])` 与 `sync.ts:241` 的 `Promise.all([fetchBoardCustomGroups, fetchBoardLayouts])`。Supabase 默认开启 refresh token 轮换，第二个并发 refresh 会收到 400 → 落入 `isExplicitAuthenticationFailure` → **清空有效会话，用户被强制登出**。
- **建议**：模块级 `let refreshPromise: Promise<Session|null> | null`，所有调用复用同一个 in-flight Promise。

#### P0-3　popup 保存设置会静默重置其余全部设置

- **位置**：`src/popup.ts:191-198`
```ts
const settings = { ...DEFAULT_SETTINGS, autoGroupEnabled: autoToggle.checked,
                   minimumTabs: Number(minimumTabs.value), theme };
await send({ type: "update-settings", settings });
```
- **影响**：`DEFAULT_SETTINGS`（`shared.ts:297-309`）展开后只覆盖 3 个字段，`cloudSyncEnabled` / `syncRulesEnabled` / `syncIgnoreListEnabled` / `defaultGroupColor` / `deferredShortcutTimes` / `language` **全部被重置为默认值**；`background.ts:1284` 还会把 `lastSuccessfulSyncAt` 置 null 并推送到云端。用户在 popup 切换主题或分组开关，就可能**关掉已开启的云端同步**并丢失语言与提醒时间。
- **建议**：改为基于当前 `state.settings` 展开（先 `get-popup-state` 拉取），只覆盖本次变更字段。

#### P0-4　工作区标题长度 TS(160) 与 DB(80) 不一致，长标题无法上云

- **位置**：`src/shared.ts:436,444` vs `supabase/migrations/011:27-28`
```ts
const title = rawTitle.length > 160 ? rawTitle.slice(0, 160) : rawTitle;   // shared.ts:436
```
```sql
title text not null check (char_length(trim(title)) between 1 and 80),     -- 011:28
```
- **影响**：标题 81–160 字符时，本地保存成功，但 `upsertWorkspace` 触发 `23514` → `sync.ts:49` 抛「同步失败 (400)」，**该工作区永远无法同步到云端**，且失败被 `.catch(() => {})` 吞掉（`background.ts:725`）。
- **建议**：二选一——将 `shared.ts` 的 160 统一改为 80（推荐，无需迁移），或新增迁移放宽 DB 到 160。同类问题见 P1-12（`minimumTabs` 2–100 vs DB 2–20）。

#### P0-5　通知去重集合被 `onClosed` 清除，划掉通知后每分钟重复弹窗

- **位置**：`src/background.ts:581-585`
```ts
chrome.notifications.onClosed.addListener((notificationId) => {
  const deferredId = notificationId.slice(NOTIFICATION_DEFERRED_PREFIX.length);
  notifiedDeferredIds.delete(deferredId);      // ← 关闭通知即移除去重
});
```
- **影响**：用户只是把通知划掉（未点击打开），1 分钟轮询（`background.ts:526` 的 `!notifiedDeferredIds.has(tab.id)`）会**再次弹出同一条通知**，循环往复直到打开或删除提醒。
- **附带问题**：`notifiedDeferredIds`（`background.ts:490`）是模块级内存变量，MV3 service worker 空闲约 30s 被回收后清空 → 所有已到期提醒**重复弹通知**。
- **建议**：把「已通知」状态持久化到 `chrome.storage.local`（或在 `DeferredTab` 上增加 `lastNotifiedAt` 时间戳），移除 `onClosed` 中的删除逻辑。

---

### 4.2 P1 — 中优先级（24 项）

#### 数据一致性与同步

| 编号 | 发现 | 位置 | 影响 |
|---|---|---|---|
| P1-1 | 云端列表覆盖本地（详见 P0-1，此处不重复计分） | `background.ts:457` | 数据丢失 |
| P1-12 | **分组规则标题上限不一致**：本地 `parseGroupRules` 允许 ≤100（`shared.ts:1185`），云端 `groupRuleFromSyncRow` 只允许 ≤40（`shared.ts:337`）。41–100 字符的本地规则推送后，下次拉取被**整条静默丢弃** | `shared.ts:337 / 1185` | 规则静默丢失 |
| P1-13 | **`syncSettings` 不受 `cloudSyncEnabled` 约束**：`restoreUserOptions`（`background.ts:329`）无条件用云端设置覆盖本地；`sync-now`（`background.ts:1176-1180`）先 `restoreUserOptions` 再 `synchronizeOptionsFromCloud`，**一次手动同步触发两轮网络同步** | `background.ts:329 / 1176` | 关闭同步仍被覆盖 |
| P1-14 | **`clearUserData()` 遗漏 6 个键**：只清 7 个（`storage.ts:241-249`），未清 `settings` / `groupRules` / `ignoredSites` / `boardCustomGroups` / `boardLayouts` / `optionsUserId`。`auth-sign-out`（`background.ts:783`）只调 `clearUserData()` → 退出后前用户的分组规则等残留；且 `settings` 被重置为 `DEFAULT_SETTINGS` 会**连主题/语言一起清空** | `storage.ts:241-249` | 跨账号数据残留 |
| P1-15 | **`replace*` 系列非原子**：先 DELETE 全量再 INSERT（`sync.ts:127-134 / 151-158 / 173-174 / 189-190`）。DELETE 成功、POST 失败时云端被清空，窗口期数据不可读 | `sync.ts:127+` | 云端数据瞬时空 |
| P1-16 | **`pushSettings` 手写 body 重复字段列表**（`sync.ts:76-95` 与 `shared.ts:60-74` 的 `settingsSyncRow` 逐字重复 11 个字段），新增设置字段极易只改一处 → 静默漏同步 | `sync.ts:76-95` | 字段漏同步 |
| P1-17 | **云端/本地写失败仍报成功**：`background.ts:725-727` 云端失败静默后仍 toast「已保存」；导入工作区 `const synced = useCloud;`（`background.ts:1442`）直接把开关当结果返回 | `background.ts:725 / 1442` | 用户误判已同步 |
| P1-21 | 见 P1-15 | | |

> 注：上表编号沿用第 3 章功能点关联编号，缺失编号为合并项。

#### 存储层

| 编号 | 发现 | 位置 | 影响 |
|---|---|---|---|
| P1-18 | **最近关闭存储链路是死代码**：`tabs.onRemoved` 中 `chrome.tabs.get(tabId)`（`background.ts:632`）在标签已移除后必然返回 null → `appendRecentlyClosedTab` 永不执行；且 `removeInfo.sessionId` 在 `onRemoved` 上不存在。结果：`recentlyClosedTabs` 永远为空，4 个 RPC（`get/restore/remove/clear-recently-closed`，`background.ts:1319-1352`）**从未被任何前台调用**（看板直连 `chrome.sessions.getRecentlyClosed`，`board.ts:398`） | `background.ts:623-649` | 约 100 行死代码 |
| P1-18b | **storage 全部 `set` 无 try/catch**：`workspaceHistories` 理论峰值 = 200 tabs × 4KB URL × 10 版 ≈ **8MB**，逼近 `storage.local` 10MB 配额（manifest 无 `unlimitedStorage`）。配额溢出会冒泡成一条普通错误消息 | `storage.ts` 全文 | 写入失败无降级 |
| P1-18c | **`boardAssignments` 只增不减**：`moveVirtualBoardAssignment`（`shared.ts:698-707`）只 put 不 delete，标签关闭后 `windowId:tabId` 条目永久残留 | `shared.ts:698` | 存储缓慢膨胀 |
| P1-18d | **load-modify-save 全部非原子且无串行化**：`appendRecentlyClosedTab` / `recordTabCreatedAt` / `saveWorkspaceHistory` / `getOrCreateDeviceId` / `prepareOptionsForUser` 均为「读全键 → 改 → 写全键」。会话恢复 100 个标签时条目互相覆盖；`getOrCreateDeviceId` 首启竞态可能生成两个 deviceId | `storage.ts:138-234` | 更新丢失 |

#### 后台逻辑

| 编号 | 发现 | 位置 | 影响 |
|---|---|---|---|
| P1-19 | **`void` 化的闹钟创建失败后仍关闭标签**：`background.ts:685-687` / `1018-1020` 先 `void scheduleDeferredDueAlarm(...)` 再 `chrome.tabs.remove` → 闹钟未建成则**标签消失且永不到期提醒**。快捷键失败还被 `catch { /* Ignore */ }`（`666-668`）静默吞掉，用户无任何反馈 | `background.ts:685 / 666` | 标签丢失 + 无反馈 |
| P1-20 | **工作区导入未按 UI 承诺重命名**：`background.ts:1420` 按标题全等 `findIndex`，命中后是**合并 tabs**（`1432`）而非 UI 承诺的「自动重命名」（`messages.json:329`）。合并后 tabs 数可超 `validateWorkspaceSnapshot` 的 200 上限 → 该工作区在云端**静默消失**。另 `pendingWorkspaceImport` 存在模块内存（`1406`），SW 休眠后确认必失败 | `background.ts:1416-1443` | 导入语义错误 + 数据丢失 |
| P1-27 | **恢复工作区无逐条容错与回滚**：`background.ts:863 / 876 / 1384` 循环 `chrome.tabs.create`，任一失败即抛错中断，已创建的标签不回滚 | `background.ts:863` | 部分恢复 |
| P1-28 | **关闭操作不过滤 pinned / 非网页**：`close-board-tab`（`background.ts:1051`）与 `batch-close-tabs`（`1059`）直接 `chrome.tabs.remove`，而 `batch-defer-tabs`（`1005`）走 `boardTab()` 过滤。同一看板内「关闭」比「推迟」更宽松，可关掉固定标签页 | `background.ts:1051` | 误关固定标签 |
| P1-29 | **统计字段错误**：`dueDeferredCount: deferredTabCount`（`background.ts:984`），从未计算真正「已到期」的数量 | `background.ts:984` | 统计不准 |
| P1-30 | **11 个消息分支无鉴权**：`open-tab-board` / `export-options-data` / `save-options-settings` / `update-settings` / `create|update|delete-group-rule` / `create|delete-ignored-site` / `create|delete-custom-group` 不调 `requireBoardUser`，与看板侧一律鉴权的策略不一致。`create-custom-group`（`1290`）校验最弱：未 `Array.isArray(tabIds)`、`color` 未走 `boardGroupColor()` | `background.ts:1193-1317` | 策略不一致 |
| P1-31 | **幂等性缺失**：`reschedule-deferred-tab`（`1037`）、`delete-deferred-tab`（`1038`）不校验 id 是否存在，对不存在的 id 也返回 `{ok:true}` | `background.ts:1037` | 静默无效 |
| P1-32 | **`getStoredUser` 与 `getLocalUser` 语义不一致**：前者忽略 `rememberUntil`（`auth.ts:67`），7 天记住期过期后 UI 仍显示已登录，但任何看板写操作抛「请先登录」 | `auth.ts:67 vs 72` | 状态矛盾 |
| P1-33 | **离线时误报「登录已过期」**：网络失败时 `getValidSession` 返回已过期 session（`auth.ts:131`），`getAccessToken` 返回 null → sync 抛「登录已过期」，实际是网络问题 | `auth.ts:131-140` | 误导用户 |
| P1-34 | **登出不清闹钟**：`auth-sign-out`（`background.ts:782`）只清数据 + 登出，已建的 `deferred-due:*` 闹钟继续触发 | `background.ts:782` | 残留行为 |

#### 前端（board.ts）

| 编号 | 发现 | 位置 | 影响 |
|---|---|---|---|
| **P1-6** | **工作区模式下 `tab.id` 是扁平数组下标，与真实 tabId 串台**：`shared.ts:637` 给工作区标签赋 `id = 数组下标`，而 `board.ts:2111` 的键盘处理未判断 `scopeMode`。工作区视图按 `d` → `navDeleteCurrent` → `closeTab(id)` → 后台 `chrome.tabs.remove(message.tabId)`（仅校验 `>0`）→ **关掉真实浏览器里 id 相同的标签**；`Enter` 同理会激活错误标签 | `shared.ts:637` + `board.ts:2111` | **误关/误激活真实标签** |
| P1-7 | **时间线焦点索引与 DOM 行不同源**：`navTabIds` 来自 `getVisibleTabIds()`（不排序、不应用 `timelineFilterValue`），而 `scrollNavIntoView`（`board.ts:474-480`）按 DOM 行下标取 → 高亮行与实际目标不符，`d`/`Enter` 操作错对象 | `board.ts:474` | 操作错对象 |
| P1-8 | **`load()` 无并发令牌**：多个 `load()`（定时刷新 300ms、刷新按钮、各写操作后）并行时，先发起者可能后 resolve → `currentState` 被旧快照覆盖，UI 显示已关闭/已移动的标签 | `board.ts:1860-1882` | 渲染陈旧数据 |
| P1-9 | **`send()` 未处理 `chrome.runtime.lastError` 且无超时兜底**（`board-dom.ts:13-17`）。若 SW 在回包前被回收，promise 永不 settle；`send()` 返回 undefined 时调用方会崩（如 `board.ts:1203`） | `board-dom.ts:13` | 永久挂起 |
| P1-10 | **工作区对话框重复绑定 `mousedown`**：`openWorkspaceDialog`（`board.ts:691`）每次调用都执行 `makeWorkspaceDialogDraggable/Resizable`，对**常驻 DOM 节点**追加监听器 → 打开 N 次累积 N 个处理器 | `board.ts:691 / 639 / 680` | 监听器泄漏 |
| P1-11 | **resize 处理器忽略 `scopeMode` / `viewMode`**：`board.ts:2193-2196` 无条件 `renderBoard(currentState)` → 工作区模式或时间线下缩放窗口会用真实标签看板覆盖当前 DOM；且无防抖 | `board.ts:2193` | 视图错乱 |
| P1-22 | **折叠状态持久化有静默失效**：`saveCollapsedGroups`（`board.ts:127`）在 `currentWindowId == null` 时不写入；`loadCollapsedGroups`（`115`）在 windowId 缺失时不清空旧值；删除分组后死键从不清理 | `board.ts:115-134` | 折叠状态丢失 |
| P1-23 | **折叠分组内的标签仍参与 j/k 循环**：`getVisibleTabIds()`（`board.ts:171`）不过滤 `collapsedGroups`，DOM 行被 `display:none` 后焦点「消失」 | `board.ts:171` | 键盘焦点丢失 |
| P1-24 | **弹窗打开时键盘仍生效**：`board.ts:2111-2113` 只排除 input/select/textarea，未排除 `contenteditable` 与打开的 `<dialog>` → 在重复标签/最近关闭/版本历史弹窗内按 `d`/`m` 会触发关闭标签等**破坏性操作** | `board.ts:2111` | 破坏性误操作 |
| P1-25 | **工作区跨分组拖拽实际不换组**：`moveWorkspaceTab`（`shared.ts:646-653`）只在扁平数组内 splice，而卡片按域名自动派生 → 拖到另一张卡后刷新，标签仍回到原域名组，视觉上「拖了等于没拖」 | `shared.ts:646` | 交互无效 |
| P1-26 | **`matchesTimelineFilter`「今天」是滚动 24 小时**而非自然日（`shared.ts:476`）；未来时间戳一律通过；未知 `range` 落到 `return true`（`479`）全放行 | `shared.ts:473-480` | 过滤语义错误 |
| P1-35 | **批量选择残留脏 id**：`closeTab()`（`board.ts:1905`）不清 `selectedTabIds`；`syncBatchActionBar`（`160`）用 `selectedTabIds.size` 而非可见集合计数 → 过滤后「全选」复选框状态与计数自相矛盾 | `board.ts:160 / 1905` | 状态不一致 |
| P1-36 | **删除「当前已加载」的工作区后不退出工作区视图**：`deleteWorkspace`（`board.ts:797`）只刷新对话框列表，`scopeMode`/`loadedWorkspace` 仍指向已删除的工作区 | `board.ts:797` | 停留在无效视图 |
| P1-37 | **`m` 键在工作区模式可打开批量选择**，Esc 退出后 `setSelectMode(false)`（`board.ts:147`）会把 `setWorkspaceMode` 已隐藏的按钮重新显示 | `board.ts:2143 / 147` | 出现无效按钮 |
| P1-38 | **`renderWorkspaceBoard` 复用陈旧 `heightUnits`**（`board.ts:1568`）：搜索过滤后仍按未过滤的 tab 数占位 → 大片空白 | `board.ts:1568` | 布局空白 |
| P1-39 | **`boardSearch` 的 `input` 与 `resize` 均无防抖**（`board.ts:2072 / 2193`），每次输入/缩放触发全量重建；百级标签下每次渲染创建上千个元素与监听器（`renderTab` 每行约 8–10 个监听器），无事件委托 | `board.ts:899 / 1230` | 性能 |

#### 校验器

| 编号 | 发现 | 位置 | 影响 |
|---|---|---|---|
| P1-40 | **`loadState` / `loadWorkspaceSnapshots` / `loadDeferredTabs` 零校验**：`storage.ts:28` 的 `{ ...DEFAULT_SETTINGS, ...(data.settings as ...) }` 在 settings 为字符串/数组时会展开成 `{0:'a',...}` 污染对象；`minimumTabs` 可为 `NaN` 直接进入 `buildVirtualBoardGroups`。对比 `loadRecentlyClosedTabs`（`130`）有逐条校验，形成反差 | `storage.ts:25-70` | 脏数据进入运行时 |
| P1-41 | **`appendWorkspaceVersion` 不校验入参**（`shared.ts:1352`），而 `validateWorkspaceVersion`（`1337`）会校验 → 非法快照可写入历史 | `shared.ts:1352` | 脏数据落盘 |
| P1-42 | **`sessionId` 无长度上限**（`shared.ts:1327`，对比 `favIconUrl ≤ 4000`）；`validateWorkspaceTab` 的 `title` 无上限（仅返回时 `slice(0,160)`）→ 1MB 标题也「校验通过」 | `shared.ts:406 / 1327` | 配额风险 |
| P1-43 | **`settingsFromSyncRow` 严格度失衡**：`minimumTabs` / `theme` / `language` / `deferredShortcutTimes` 任一异常即**整份云端设置作废**返回 null，而其他字段走默认值。未来新增一个 `theme:"system"` 就会让用户设置整体无法加载 | `shared.ts:311-334` | 设置整体不可用 |
| P1-44 | **`isValidDomain` 要求 `domain.includes(".")`**（`shared.ts:1111`）→ `localhost`、单标签内网主机名、IDN 域名全部被拒；裸输入 `a.com:8080` 因含 `:` 被拒 | `shared.ts:910-928` | 误拒合法站点 |
| P1-45 | **`hasOnlyKeys` 要求键全部存在**（`shared.ts:1123-1126`），调用方少传 `enabled` 即整条拒绝，无默认值兜底 | `shared.ts:1079 / 1102` | 误拒 |

---

### 4.3 P2 — 低优先级与技术债（22 项）

#### 死代码与遗留

| 发现 | 位置 |
|---|---|
| 4 个 `*-recently-closed` RPC + `appendRecentlyClosedTab` 等 storage 函数从未被调用（详见 P1-18） | `background.ts:1319-1352`、`storage.ts:126-154` |
| **废弃表 `public.device_tab_snapshots` 仍在线**，RLS/策略/grant 齐全，`groups jsonb` 可存标签标题/URL。功能已移除仍保留可写表 = 不必要的数据留存面 | `migrations/010` |
| **废弃列** `user_settings.deferred_shortcut_minutes`（008）、`sync_tab_snapshots_enabled`（009）仍随 upsert 写入默认值 | `migrations/008 / 009` |
| `shortestLane`（`shared.ts:1144-1152`）定义后全仓无引用 | `shared.ts:1144` |
| 未使用的 import：`automaticBoardKey`、`appendWorkspaceTab`、`loadAllWorkspaceHistories`、`saveWorkspaceHistory`、`deleteWorkspaceHistory` | `background.ts:3/31/82/83/85` |
| 未使用的局部变量 `const user = await requireBoardUser();` | `background.ts:1355 / 1373` |
| CSS 死规则 `.memory-bar` / `.memory-size`（已移除功能的残留） | `board.css:436` |
| `synchronizeOptionsMutation`（`background.ts:323`）是空壳转发；`update-settings` 与 `save-options-settings` 两份近乎重复的实现 | `background.ts:323 / 1183 / 1280` |
| `replaceBoardLayouts` 固定写 `manual_order: null`（`sync.ts:187`），`manualOrder` 字段事实上已死 | `sync.ts:187` |

#### 国际化与可访问性

| 发现 | 位置 |
|---|---|
| **3 个缺失 i18n key** → 界面直接显示原始 key：`workspace`（`board.ts:1827`）、`invalidWindow`（`board-history.ts:102`）、`confirmRestoreVersionPrompt`（`board-history.ts:106`）。因 `i18n.t()` 缺键时返回 key 本身（`i18n.ts:64/68`），**所有 `i18n.t(x) \|\| "中文兜底"` 的兜底永不生效**（`board.ts:221`、`board-history.ts:27/62/129/130/142`） | 多处 |
| **硬编码中文**：`board.ts:261`（已移动/跳过）、`1826-1827`（全角冒号与「（设备名）」）、`434-437`（时间单位 s/m/h）；`board-history.ts:108`；`background.ts` 45 处（如 `1400`/`1404`/`1412`）；`sync.ts` 20 处；`shared.ts` 4 处（`373`/`496`/`751`/`1099`）；`storage.ts:102`（`LEGACY_DEVICE_NAMES` 中文常量参与业务比对）；HTML 中 `popup.html:21/22/37/45`、`options.html:6/11/28`、`board.html` 71 处 | 多处 |
| `#board-grid` 与 `#workspace-header` 带 `aria-live="polite"`（`board.html:79-80`）→ 每次全量渲染把整块看板朗读一遍，对屏幕阅读器是灾难性噪音 | `board.html:79` |
| 折叠按钮无 `aria-expanded`，且 JS 换字形 `▼/▶` 与 CSS `rotate(-90deg)`（`board.css:416`）双重表达冲突 | `board.ts:1276` |
| 时间线筛选按钮缺 `aria-pressed`（对比视图切换按钮有），不一致 | `board.ts:2100` |
| 单个标签的复选框复用 `selectAllTabs` 文案（`board.ts:913`）→ 播报「全选 标签名」 | `board.ts:913` |
| 键盘导航不移动真实焦点（无 roving tabindex / `aria-activedescendant`），屏幕阅读器无感知 | `board.ts:465` |
| `#recently-closed-search:focus { outline: none }`（`board.css:428`）完全移除焦点环且无替代指示 | `board.css:428` |
| `detectLanguage`（`i18n.ts:81-88`）只认 `zh*`，无 `zh_TW` 分支；`initFromStorage` 失败不重试（`135-144`） | `i18n.ts` |

#### CSS

| 发现 | 位置 |
|---|---|
| `.board-grid` 列数由 JS 内联样式控制（`board.ts:1354/1580`），**内联优先级高于媒体查询** → `board.css:388/435` 的两段媒体查询实质失效 | `board.css:388 / 435` |
| `board.css:388` 与 `435` 是两段**完全重复**的 `@media (max-width:980px)` 规则 | `board.css` |
| `.board-actions`（`board.css:215`）**无 `flex-wrap`**，640px 以下 8 个按钮单行排列横向溢出（同断点 `.batch-action-bar` 已加 wrap，不一致） | `board.css:215` |
| `.group-card.collapsed { height: auto }`（`board.css:418`）不释放 JS 内联的 `gridRow`，折叠后仍占满行位 | `board.css:418` |
| `.group-card[data-height="2"] .tab-row:nth-child(6)`（`board.css:292`）是魔法下标，依赖 `segmentTabs()` 每卡 10 条与行高假设 | `board.css:292` |
| `.hidden { display:none !important }`（`board.css:241`）与原生 `hidden` 属性两套机制并存 | `board.css:241` |

#### 测试

| 发现 | 位置 |
|---|---|
| **13 处「契约测试」**只 `readFile` 读 `dist/*` 产物做正则匹配（如 `tests/shared.test.js:147-151` 断言 `<input id="new-tab-board" type="checkbox" aria-describedby="...">`），属性顺序或引号风格一变就误报，且完全不验证运行时行为 | `tests/shared.test.js:121/148/156/163/187/206/242/438/632/762/984/1233/2513` |
| **关键校验函数零覆盖**：`createGroupRuleFromInput`、`validateGroupRule`、`createIgnoredSiteFromInput`、`validateIgnoredSite`、`previewWorkspacePortableImport`、`validateWorkspacePortableData`、`toWorkspacePortableData`、`workspaceRestorePreview`、`validateWorkspaceVersion/History` | `tests/shared.test.js` |
| `appendWorkspaceVersion` 截断只测了 1→2（`2830-2839`），**未测第 11 版截断与 `MAX_WORKSPACE_HISTORY_VERSIONS` 边界** | `tests/shared.test.js:2830` |
| `matchesTimelineFilter` 5 例只覆盖滚动 24h，未测自然日语义、未来时间戳、非法 range | `tests/shared.test.js:2454-2493` |
| 弱断言：`assert.equal(typeof shared.formatDeferredDateTime, "function")`（`502`） | `tests/shared.test.js:500` |
| `clearUserData` 测试（`2370-2411`）把键遗漏固化成了「正确行为」 | `tests/shared.test.js:2370` |

#### 数据库

| 发现 | 位置 |
|---|---|
| 遗留表 `device_tab_snapshots`（见上文）建议新起迁移 drop 或至少 revoke | `010` |
| 迁移 `003` 与 `004` **功能重复**（都 add `theme`），004 为 nullable，执行顺序颠倒会与 003 的 NOT NULL 意图冲突 | `003 / 004` |
| 冗余索引 `user_settings_theme_idx(user_id, theme)`（`003`，user_id 已是 PK）、`group_rules_domains_idx` GIN（`001:70`，同步从不按 domains 过滤） | `001 / 003` |
| `workspace_snapshots` 缺 `(user_id, device_id)` 索引，`renameDeviceWorkspaces`（`sync.ts:227`）无索引支撑 | `011:35` |
| `group_rules.sort_order` 无 `>= 0` check，而 `ignored_sites`（`002:43`）、`board_custom_groups`（`005:20`）都有 | `001:59` |
| `user_settings.language` 在 DB 层无任何 check 约束，仅靠 TS `isLanguage` | `003:20` |
| 迁移 `013` 注释写「修复 009 遗漏」，实际修复的是 **011**（`workspace_snapshots`） | `013:15` |

#### 配置注入

| 发现 | 位置 |
|---|---|
| `inject-env.mjs` **不校验注入的 key 是否为 anon**：若开发者误把 service_role 填入 `SUPABASE_ANON_KEY`，脚本照常注入（唯一防线是「变量名不同」这一约定）。建议解析 JWT payload 校验 `role == "anon"` | `inject-env.mjs:32-41` |
| 替换后无断言：`String.replace` 未匹配会静默 no-op，dist 携带占位符发布，直到运行时才报错 | `inject-env.mjs:38-41` |
| URL 正则不支持自定义域名/自托管（`inject-env.mjs:35`），与 `manifest.json:8` 的 `https://*.supabase.co/*` 范围不完全一致 | `inject-env.mjs:35` |

#### 其他

| 发现 | 位置 |
|---|---|
| `optionsState` 恒返回 `sync: {state:"syncing"}`（`background.ts:248`），登录状态下永远显示「同步中」 | `background.ts:248` |
| `delete-board-group` 用 `!message.confirmed`（truthy）而非 `!== true`，与其它分支不一致 | `background.ts:1152` |
| 未知消息返回 `{ok:false}` 而非 `{error}`，调用方难以区分 | `background.ts:1445` |
| `sendToast` 通知 id 用 `Date.now()`（`background.ts:509`），同毫秒两次 toast 会撞 id | `background.ts:509` |
| `open-tab-board` 跨窗口抢焦点：`chrome.tabs.query({url: boardUrl})`（`background.ts:658`）查所有窗口，若看板在另一窗口会把用户切走 | `background.ts:658` |
| popup 表单几乎无客户端校验（仅比对两次密码，无邮箱格式/密码强度） | `popup.ts:72-102` |
| 登录成功后未清空密码字段（注册需确认分支清了） | `popup.ts:83-85` |
| `icon.src = tab.favIconUrl` 未校验协议（`board.ts:932/1174`、`popup.ts:130`），与 `faviconFor()` 的白名单不一致；`chrome.tabs.create({url: tab.url})`（`board.ts:1652`）对导入 JSON 的 url 未做 scheme 白名单 | 多处 |
| 跨窗自动分组会合并（`naturalBySite` 按 siteKey 跨所有窗口聚合，`shared.ts:718`），而 `boardWindowLabel` 的窗口序号取自 `chrome.windows.getAll` 数组下标，顺序不稳定 | `shared.ts:718 / 371` |
| 手动拖入 `auto:xxx` 的标签不受 `minimumTabs` 阈值约束（`shared.ts:741` 已有 assignment 直接 put） | `shared.ts:741` |
| `normalizeHostname` 只剥一级 `www.`（`shared.ts:351`）→ `www.www.a.com` → `www.a.com` | `shared.ts:351` |
| `getSiteKey` 不调 `isValidDomain`（`shared.ts:1223`），IPv6/单标签 host 能生成 siteKey 但 `automaticBoardKey` 又会拒绝 → 这类标签永远进未分组 | `shared.ts:1223` |
| `formatShortcutKeys` 的 Mac 字形分支不判断 platform（`shared.ts:1271-1277`）；`Option→Alt`、`Control→Ctrl` 未映射 | `shared.ts:1264` |
| `siteTitle("127.0.0.1")` → 标题 `127`，无意义展示名 | `shared.ts:1233` |
| `boardWindowLabel` fallback `窗口 ${windowIndex}` 为中文硬编码 | `shared.ts:371` |
| refresh token 明文存 `storage.local`（非 `storage.session`）；`signOut()` 用可能过期的 token 调 `/logout`，401 时服务端未吊销 refresh token | `auth.ts:57 / 142` |
| `sessions` 权限可读取跨设备最近关闭会话（含全部历史 URL），若该面板非核心建议改为可选权限 | `manifest.json:7` |

---

## 5. 合规性与亮点确认

以下为**通过项**，体现项目已有的工程水准，建议保持：

### 5.1 安全

| 项 | 结论 | 证据 |
|---|---|---|
| XSS 防护 | ✅ 全仓 **0 处** `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `eval` / `new Function` | 全量正则扫描 `src/` 命中 0 |
| 用户数据渲染 | ✅ 全部走 `textContent` / `title` / `dataset` / `value` | `board.ts:936/1284/1508`、`board-history.ts:76` |
| Token 不泄露日志 | ✅ 全仓 `console.*` 仅 3 处，均输出本地化文案/Error 对象，无 token | `background.ts:519/547/729` |
| Token 不进前台 | ✅ popup/options/board 均不持有 token，只经 `sendMessage` 通信 | `AGENTS.md:100` 落实 |
| service_role 不进产物 | ✅ `inject-env.mjs` 只读取 `SUPABASE_URL` / `SUPABASE_ANON_KEY`，从不读 service_role | `inject-env.mjs:32-35` |
| 占位符机制 | ✅ `supabase-config.ts:3-4` 保留 `YOUR_PROJECT` / `YOUR_SUPABASE_ANON_KEY`，运行时 `assertSupabaseConfigured()` 兜底 | `supabase-config.ts:6-10` |

### 5.2 权限最小化

| 项 | 结论 | 证据 |
|---|---|---|
| 无 `tabGroups` 权限 | ✅ 符合 `AGENTS.md:137` 硬性禁令，全仓无 `chrome.tabs.group` / `chrome.tabGroups` 调用 | `manifest.json:7` |
| 无 `<all_urls>` | ✅ host_permissions 精确收窄到 `https://*.supabase.co/*` | `manifest.json:8` |
| 无 content_scripts | ✅ 不注入任何网页，零页面侧攻击面 | `manifest.json` 全文 |
| 无 web_accessible_resources | ✅ 无资源暴露给网页 | `manifest.json` 全文 |
| CSP | ✅ 未声明 → MV3 默认最严格策略 | — |
| 浏览器标签保持未分组 | ✅ 分组为纯虚拟计算，只写本地 `boardAssignments` | `shared.ts:709` |

### 5.3 数据库与 RLS

| 项 | 结论 | 证据 |
|---|---|---|
| RLS 全覆盖 | ✅ 7 张用户表全部 `enable row level security` | `001:89`、`002:57`、`005:51`、`010:47`、`011:46` |
| 策略严格 | ✅ 20+ 条策略全部 `(select auth.uid()) = user_id`，SELECT/INSERT/UPDATE/DELETE 四类齐全，UPDATE 同时有 `using` + `with check` | `001:110-158` 等 |
| anon 回收 | ✅ 全部 `revoke all ... from anon` | `001:160`、`002:69`、`005:72`、`010:83`、`011:82` |
| 可重复执行 | ✅ 建表/建索引/加列带 `if not exists`，policy/trigger 先 `drop if exists`，约束用 `pg_constraint` 查重 | `002:25-36`、`006:24-52` |
| 防 search_path 劫持 | ✅ 触发器函数 `security invoker` + `set search_path = ''` | `001:16-17` |

### 5.4 隐私边界

| 项 | 结论 | 证据 |
|---|---|---|
| 运行时 ID 不上云 | ✅ `WorkspaceTab` 只有 `{title, url}`，经 `new URL()` 重建天然剔除 | `shared.ts:80-83 / 406-421` |
| `boardAssignments` 不上云 | ✅ `BoardSyncData` 只含 `boardCustomGroups` / `boardLayouts` | `sync.ts:234-237` |
| 会话数据不上云 | ✅ `RecentlyClosedTab.sessionId` 仅存本地 | `background.ts:635` |
| 冲突策略符合约定 | ✅ `resolveCloudCollection` 远端优先 / 远端空则本地初始化，与 `AGENTS.md:125` 一致 | `shared.ts:1093-1096` |
| 云端失败保留本地 | ✅ 设置变更先本地后云端 | `background.ts:1285→1287` |

### 5.5 工程质量

| 项 | 结论 |
|---|---|
| TypeScript strict | ✅ `tsc --noEmit` 0 错误 |
| 单元测试 | ✅ 205 条全通过（`npm test` 先构建再跑，约 800ms） |
| E2E | ✅ Playwright 14 条（10 passed / 4 skipped），headed 模式 + 持久化上下文加载 MV3 |
| 校验体系 | ✅ 30+ 个 `validate*` 函数，云端/导入数据一律白名单键校验（`isPlainObject` + `hasOnlyKeys`），失败返回 `null` 整条丢弃 |
| 转换集中 | ✅ snake_case ↔ camelCase 全部集中在 `shared.ts` 的 `*FromSyncRow` / `*SyncRow` |
| 邮件确认双分支 | ✅ `auth.ts:83-86` 正确处理开启/关闭两种情况 |
| 账号切换隔离 | ✅ `prepareOptionsForUser` 按 `optionsUserId` 比对清洗，导入确认有跨账号防护 `canConfirmOptionsImport` |

---

## 6. 修复优先级路线图

### 第一期：数据安全与核心链路（建议立即）

| 序 | 任务 | 对应发现 | 涉及文件 |
|---|---|---|---|
| 1 | `loadAllWorkspaces` 改为「云端 ∪ 本地」合并，禁止整表覆盖 | P0-1 | `background.ts:457-466` |
| 2 | `getValidSession` 增加 in-flight Promise 复用锁 | P0-2 | `auth.ts:112-135` |
| 3 | popup 保存设置改为基于当前 settings 展开 | P0-3 | `popup.ts:191-198` |
| 4 | 统一工作区标题上限（TS 160 → 80） | P0-4 | `shared.ts:436/444` |
| 5 | 通知去重改为持久化 `lastNotifiedAt`，移除 `onClosed` 删除逻辑 | P0-5 | `background.ts:581-585` |
| 6 | 键盘导航增加 `scopeMode === "current"` 与「无 dialog 打开」守卫 | P1-6 / P1-24 | `board.ts:2111` |

### 第二期：一致性与可靠性

| 序 | 任务 | 对应发现 |
|---|---|---|
| 7 | 统一规则/自定义分组标题上限（100 → 40）；统一 `minimumTabs`（100 → 20） | P1-12 / D-2 |
| 8 | `clearUserData` 补齐 6 个键，并保留 `theme`/`language` | P1-14 |
| 9 | `syncSettings` 受 `cloudSyncEnabled` 门控；`sync-now` 去掉重复一轮同步、补 try/catch | P1-13 |
| 10 | 所有 `storage.set` 加 try/catch 与配额降级；`workspaceHistories` 加条数/体积上限；`boardAssignments` 加 GC | P1-18b/c |
| 11 | storage 写入串行化（模块级写队列）或改为增量键 | P1-18d |
| 12 | `load()` 加单调递增 token；`send()` 加 `lastError` 检查与超时 `Promise.race` | P1-8 / P1-9 |
| 13 | 移除或修复「最近关闭」存储链路（建议删除 4 个 RPC + storage 函数，统一走 sessions API） | P1-18 |
| 14 | 闹钟创建改为 `await` 后再关标签；快捷键失败给 toast 反馈 | P1-19 |
| 15 | 工作区导入落实「冲突自动重命名」，合并后按 200 上限截断；`pendingImport` 落盘 | P1-20 |
| 16 | `loadState` / `loadWorkspaceSnapshots` / `loadDeferredTabs` 加类型守卫与逐条校验 | P1-40 / P1-41 |

### 第三期：体验、性能与技术债

| 序 | 任务 | 对应发现 |
|---|---|---|
| 17 | resize 处理按 `scopeMode`/`viewMode` 分派并加防抖；搜索 input 加防抖 | P1-11 / P1-39 |
| 18 | 工作区对话框拖拽/缩放监听移到模块初始化，只绑定一次 | P1-10 |
| 19 | `selectedTabIds` 按可见集合裁剪；计数改用可见集合大小 | P1-35 |
| 20 | `matchesTimelineFilter` 改自然日语义，未知 range 返回 false | P1-26 |
| 21 | 关闭操作过滤 pinned / 非网页；恢复工作区加逐条容错 | P1-27 / P1-28 |
| 22 | 补齐 3 个 i18n key（`workspace`/`invalidWindow`/`confirmRestoreVersionPrompt`），清理 `\|\| "中文兜底"` 死分支与硬编码中文 | P2 |
| 23 | 新起迁移 drop 或 revoke `device_tab_snapshots`；清理遗留列 `008`/`009`；修正 `013` 注释 | P2 |
| 24 | `inject-env.mjs` 增加 anon JWT role 校验 + 替换后断言 | P2 |
| 25 | 补齐关键校验函数的真行为测试；将 13 处契约测试降级或改造 | P2 |
| 26 | 无障碍：`aria-live` 收窄到局部、折叠按钮加 `aria-expanded`、筛选按钮加 `aria-pressed`、键盘导航加 roving tabindex | P2 |
| 27 | CSS：移除被内联样式覆盖的媒体查询与重复块、`.board-actions` 加 `flex-wrap`、清理死规则 | P2 |
| 28 | 删除死代码 `shortestLane`、未使用 import、`synchronizeOptionsMutation` 空壳 | P2 |

---

## 7. 附录

### 7.1 存储键清单（16 个）

| 键 | 内容 | 用户级 | 同步到云端 |
|---|---|---|---|
| `settings` | 偏好设置 | ✅ | ✅ `user_settings` |
| `groupRules` | 分组规则 | ✅ | ✅ `group_rules` |
| `ignoredSites` | 忽略站点 | ✅ | ✅ `ignored_sites` |
| `boardCustomGroups` | 自定义分组元数据 | ✅ | ✅ `board_custom_groups` |
| `boardLayouts` | 看板布局元数据 | ✅ | ✅ `board_layouts` |
| `boardAssignments` | 虚拟分组归属（运行时） | ✅ | ❌ 禁止 |
| `optionsUserId` | 换账号检测 | ✅ | ❌ |
| `workspaceSnapshots` | 工作区快照 | ✅ | ✅ `workspace_snapshots` |
| `workspaceHistories` | 工作区版本历史 | ✅ | ❌ |
| `deferredTabs` | 稍后提醒 | ✅ | ❌ |
| `recentlyClosedTabs` | 最近关闭（链路已死） | ✅ | ❌ |
| `tabCreatedAt` | 标签创建时间 | ✅ | ❌ |
| `board_collapsed_groups` | 折叠状态（`Record<windowId, string[]>`） | ✅ | ❌ |
| `deviceId` / `deviceName` | 设备标识 | ❌ 设备级 | ❌ |
| `supabaseSession` | 认证会话 | ✅ | ❌ |

> `clearUserData()`（`storage.ts:241-249`）目前只清理前 7 个中的 7 个用户键，**遗漏 `settings`/`groupRules`/`ignoredSites`/`boardCustomGroups`/`boardLayouts`/`optionsUserId`**（见 P1-14）。

### 7.2 消息 RPC 统计（61 个分支）

按鉴权方式分组：

- **看板写操作（一律 `requireBoardUser`）**：31 个 — 工作区 10、稍后提醒 6、标签操作 6、分组 5、批量 3、统计 1
- **设置与规则（无鉴权，本地优先）**：11 个 — 见 P1-30
- **认证**：5 个 — `auth-state` / `restore-session` / `auth-sign-in` / `auth-sign-up` / `auth-sign-out`
- **其他**：14 个 — `open-tab-board`、`get-board-state`、`get-popup-state`、`get-options-state`、`sync-now`、`export-options-data`、`import-options-data` 等

### 7.3 数据库表清单

| 表 | 迁移 | 状态 | RLS |
|---|---|---|---|
| `user_settings` | 001–004, 007–009, 012 | 使用中 | ✅ |
| `group_rules` | 001, 002 | 使用中 | ✅ |
| `ignored_sites` | 002 | 使用中 | ✅ |
| `board_custom_groups` | 005 | 使用中 | ✅ |
| `board_layouts` | 005, 006 | 使用中 | ✅ |
| `workspace_snapshots` | 011, 013 | 使用中 | ✅ |
| `device_tab_snapshots` | 010 | ⚠️ **已废弃，建议清理** | ✅（仍可读写） |

### 7.4 审计方法说明

- 全量通读 `src/` 下全部 10 个 TS 文件、3 个 HTML、3 个 CSS（约 9,600 行）
- 全量阅读 `supabase/migrations/001–013`
- 交叉验证 `manifest.json`、`AGENTS.md`、`handoff.md`、`scripts/inject-env.mjs`
- 抽样验证 `tests/shared.test.js`（3,069 行 / 205 用例）与 `e2e/`（4 个文件）
- 对全部 P0 级发现均**亲自复核源码行号与上下文**，未仅依赖二次转述
- 验证基线：`npm run typecheck` ✅ / `npm test` ✅ 205/205

---

_End of audit report._
