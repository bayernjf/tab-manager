# Tab Garden 项目交接文档

> 最后更新时间：2026-07-31
> 当前分支：`feature/20260719`（已合并至 `dev` PR #26 → `main` PR #27）
> 最新版本：`v0.1.11`
> 验证状态：typecheck ✅ / 127 unit tests ✅ / 10 E2E tests ✅ (4 skipped) / diff-check ✅ / 构建通过 ✅

---

## 1. 项目概述

Tab Garden 是 Chrome / Edge Manifest V3 原生标签管理扩展，使用 TypeScript + HTML/CSS（无框架、无打包器）开发，后台为 ES Module service worker，数据层对接 Supabase Auth + PostgREST。

核心能力：自动/自定义标签分组看板、稍后提醒恢复、工作区快照跨设备同步、用户设置云同步。

**技术栈（不变更）：**
- 语言：TypeScript strict mode
- 运行时：Chrome MV3 service worker + Extension API
- 后端：Supabase Auth REST + PostgREST（无 `@supabase/supabase-js` SDK）
- 包管理：npm（不使用 pnpm/yarn）
- 构建产物：`dist/`（Git 不追踪）
- 数据库迁移：`supabase/migrations/`

**常用命令：**

```bash
npm install          # 安装依赖
npm run typecheck    # TypeScript 类型检查（不生成文件）
npm run build        # 清理 dist、TS 编译、复制静态文件、注入 Supabase 配置
npm test             # 完整构建 + Node.js 单元测试（120 条用例）
git diff --check     # 空白符检查（提交前必跑）
npm run e2e          # Playwright E2E 测试（默认 headed 模式，需先 build）
```

---

## 2. 本轮迭代（11 项功能）已完成清单

本轮一次性按优先级落地 11 项能力，覆盖通知、批量操作、快捷方式、数据备份、视图切换、键盘操作、性能诊断等维度：

| # | 功能 | 状态 | 备注 |
|---|---|---|---|
| 1 | Chrome 系统级到期通知（到期 tab 自动弹系统通知，点击打开标签） | ✅ 已完成 | `chrome.alarms` 1 分钟轮询 + `chrome.notifications`，已通知 tab id 去重 |
| 2 | 重复标签列表弹窗 + 一键去重关闭 | ✅ 已完成 | 按 URL 分组、每组保留 1 条、其他批量关闭；跳过最近活跃 tab |
| 3 | 批量操作：checkbox 多选 + 批量关闭 / 稍后提醒 / 移动分组 | ✅ 已完成 | 顶部固定工具栏；移动弹层选目标分组；可退出选择模式 |
| 4 | 最近关闭标签视图（sessions API） | ✅ 已完成 | 50 条上限；`chrome.tabs.onRemoved` 自动捕获普通网页 tab；优先 sessions.restore，失败回退 URL 重开 |
| 5 | 快捷键命令（Alt+B / Alt+D / Alt+S） | ✅ 已完成 | Alt+B 打开看板；Alt+D 活动 tab 稍后处理并关闭；Alt+S 快速保存当前窗口为工作区（自动编号） |
| 6 | 工作区本地 10 个历史版本 | ✅ 已完成 | 追加写入自动截断；支持列出、保存指定快照、恢复到窗口 |
| 7 | 设置 / 工作区 JSON 导入导出 | ✅ 已完成 | 导入两步走（preview → confirmed 合并）；重名自动加后缀；选项页和工作区分开两组 RPC |
| 8 | 看板 / 时间线双视图（按创建 / 提醒时间排序） | ✅ 已完成 | 共享搜索与窗口过滤；到期标签红色徽章 |
| 9 | 分组折叠按钮 + 持久化 | ✅ 已完成 | 折叠状态 `chrome.storage.local` 保存；三角旋转动画 |
| 10 | 全键盘导航（j/k/d/m/Enter/Esc） | ✅ 已完成 | 看板和时间线通用；j/k 首尾循环移动；输入控件内自动禁用；当前行高亮边框 |
| 11 | 内存占用排序 / 关闭 Top N（processes API） | ❌ 已移除 | Manifest V3 下 `chrome.processes` 不可用，无法获取按标签内存数据，相关 UI / 后台采集逻辑已删除 |

---

## 3. 本轮提交（已 Push 并合并）

feature/20260719 分支共 30+ 个 commit，已全部 push 并通过 PR 合并：

- **PR #26**：`feature/20260719` → `dev`（合并 commit `b8c8a49`）
- **PR #27**：`dev` → `main`（合并 commit `9c439cb`，tag `v0.1.11`）

主要 commit 分类：

| 类别 | 代表 Commit | 说明 |
|---|---|---|
| 权限与构建 | `06c47bd`, `be501a8`, `dde0fb8`, `37a9662` | 新增 permissions、Playwright 依赖、Mac 快捷键修正 |
| 国际化 | `3fae067`, `9ce2bfe`, `8bde78c`, `c8b1d11`, `ca76906` | 批量操作 / 快捷键 / 导入导出 / 时间线等 ~50+ 翻译键 |
| 共享类型 | `9589abb`, `dd90ef5` | 6 个领域类型 + 12+ 纯验证函数 + 快捷键格式化 |
| 存储层 | `f7a65c3`, `cd93495` | 最近关闭 / 工作区历史 / tab 创建时间存储 |
| 后台 RPC | `fe491da`, `25af0a7`, `738e061`, `c80e686` | 通知 / 快捷键 / 批量操作 / 导入合并 / 到期 alarms |
| 看板 UI | `ba7e1a1`, `be424ea`, `4543601`, `b186edc` | 批量选择 / 时间线 / 折叠 / 工作区导入导出 / 版本历史 |
| 选项页 | `dd90ef5`, `1226dc6` | 快捷键展示卡片 / 表单重构 |
| E2E 测试 | `ebb003a` | Playwright 框架 + 看板 / 选项页测试套件 |
| 审计修复 | `e550a95`, `5d46e77`, `c3a2004`, `9366f0b`, `3885c78` | 键盘循环 / 标题截断 / 空值处理 / 移除不可用功能 / 云端失败保护 |

---

## 4. 核心新增机制与文件职责

### 4.1 共享类型与纯函数 —— `src/shared.ts`

| 类型 / 函数 | 用途 |
|---|---|
| `RecentlyClosedTab` / `validateRecentlyClosedTab()` | 最近关闭 tab 记录结构；含 sessionId 便于 sessions.restore 精准恢复 |
| `WorkspaceVersion` / `WorkspaceHistory` / `appendWorkspaceVersion()` | 工作区单版快照 + 集合；10 版上限自动截断 |
| `WorkspacePortableData` / `toWorkspacePortableData()` / `previewWorkspacePortableImport()` | 工作区便携 JSON 格式 + 导出 + 导入预览（支持字符串/对象入参，自动过滤运行时字段） |

### 4.2 存储辅助 —— `src/storage.ts`

| 存储键 | 函数族 | 说明 |
|---|---|---|
| `recentlyClosedTabs` | `loadRecentlyClosedTabs / saveRecentlyClosedTabs / appendRecentlyClosedTab / removeRecentlyClosedTab / clearRecentlyClosedTabs` | 50 条上限，最近关闭 tab 列表 |
| `workspaceHistory` + workspaceId 子键 | `loadWorkspaceHistory / loadAllWorkspaceHistories / saveWorkspaceHistory / saveWorkspaceVersion / deleteWorkspaceHistory / clearAllWorkspaceHistories` | 每个 workspaceId 对应 10 个版本的数组 |

### 4.3 后台消息 RPC（新增 ~15 个）— `src/background.ts`

> 全部走原有 `PopupMessage` 联合类型与 `chrome.runtime.onMessage` 分发：

| 类型 | 用途 | 返回 |
|---|---|---|
| `get-recently-closed` | 获取最近关闭列表 | `RecentlyClosedTab[]` |
| `restore-recently-closed` | 恢复指定记录（优先 sessionId） | 新 tab 基础信息 |
| `remove-recently-closed` | 从列表移除单条 | `{ ok: true }` |
| `clear-recently-closed` | 清空最近关闭列表 | `{ ok: true }` |
| `get-workspace-history` | 取指定 workspace 历史（默认 10 版） | `WorkspaceVersion[]` |
| `save-workspace-history-version` | 显式保存当前快照为一版（可选 note） | `{ version: number }` |
| `restore-workspace-history-version` | 恢复指定版到窗口 | `{ restoredTabs: number }` |
| `export-workspaces-json` | 导出所有工作区为便携 JSON | `{ data: WorkspacePortableData, json: string }` |
| `import-workspaces-json`（两步） | 先 `preview:true` 预览 → 再 `confirmed:true` 合并 | 预览条目 / 导入结果统计 |
| `batch-close-tabs` | 批量关闭 | `{ closed: number, skipped: number }` |
| `batch-defer-tabs` | 批量稍后提醒（按默认时间） | `{ deferred: number }` |
| `batch-move-tabs-to-group` | 批量移动到指定 groupKey | `{ moved: number, notFound: number }` |

### 4.4 看板交互 —— `src/board.ts` 状态

| 状态 | 类型 | 说明 |
|---|---|---|
| `selectMode` | `boolean` | 批量选择模式开关 |
| `selectedTabIds` | `Set<number>` | 当前选中 tabId 集合 |
| `viewMode` | `"board" \| "timeline"` | 看板 / 时间线切换 |
| `collapsedGroups` | `Set<string>` | 已折叠的 `boardKey` 集合（持久化） |
| `navTabIds` / `navFocusIndex` | `number[]` / `number` | 当前可导航列表与焦点索引（键盘操作） |

### 4.5 国际化新增键（示例节选）— `_locales/*/messages.json`

| 类别 | 键（示例） |
|---|---|
| 快捷键命令描述 | `cmdOpenBoard`, `cmdDeferTab`, `cmdSaveWorkspace` |
| 批量操作 | `selectMode`, `exitSelectMode`, `selectAll`, `selectedCount`, `batchClose`, `batchDefer`, `batchMove`, `moveToGroup` |
| 最近关闭 | `recentlyClosed`, `recentlyClosedEmpty`, `restore`, `removeRecentlyClosed`, `clearRecentlyClosed` |
| 时间线 | `viewBoard`, `viewTimeline`, `sortByCreated`, `sortByDue`, `timelineEmpty` |
| 分组折叠 | `collapse`, `expand` |
| 工作区版本 | `workspaceHistory`, `saveVersion`, `restoreVersion`, `versionNote`, `versionAt` |
| 导入导出 | `exportWorkspaces`, `importWorkspaces`, `importPreview`, `importConfirmed`, `importDuplicated`, `importDone` |
| 选项页 | `savePreferences`（修复缺失键） |

> 已移除的键（随「内存占用」功能移除）：`memoryUsage`, `memoryTitle`, `closeTopUsers`, `memoryKB`, `memoryMB`

---

## 5. 验证方式

### 5.1 自动验证（全部通过）

```bash
npm run typecheck      # tsc --noEmit           （0 错误）
npm test               # 构建 + 120 条单元测试   （120/120 通过，约 105ms）
git diff --check       # 空白符检查              （0 警告）
```

### 5.2 手动验证清单（浏览器扩展内建议走一遍）

1. **系统通知**：给活动 tab 设置一个 1 分钟后到期的稍后提醒 → 等待 `chrome.alarms` 轮询后应弹出系统通知；点击应新标签打开 URL，并在看板稍后列表中移除；连续多次不会重复提醒。
2. **重复标签去重**：手动复制一个标签页开 3 份 → 看板「去重」按钮 → 弹窗默认保留最近活跃 → 确认后仅保留 1 份。
3. **批量操作**：点「批量选择」→ 每行出现 checkbox → 全选若干 → 「批量移动」到目标分组（弹窗可选）/ 「批量稍后」/ 「批量关闭」→ 操作正确生效，进度提示 toast 正常。
4. **最近关闭**：关闭任意普通网页 tab → 点看板「最近关闭」按钮 → 列表中出现刚刚关闭的条目 → 点「恢复」优先走 sessions.restore 回到原位置（包括历史滚动）。
5. **快捷键**：任意窗口按 `Alt+S` → 生成一个「快速保存-1」工作区（重名自动编号）；`Alt+D` → 当前 tab 进入稍后列表并关闭；`Alt+B` → 打开或聚焦看板 tab。
6. **工作区版本**：进入某工作区 → 「保存为一版」（备注可选）→ 修改一些标签 → 打开历史版本列表 → 恢复旧版 → tab 恢复到旧快照。
7. **导入导出**：「导出工作区」下载 JSON → 改几个标签 → 「导入工作区」选择文件 → preview 步骤可看差异 → 确认合并（重名自动加 `-1`）。
8. **时间线视图**：切换到「时间线」→ 按创建时间 / 提醒时间排序都工作 → 切回看板状态保持。
9. **分组折叠**：点分组前的三角 → 隐藏 tab 列表 → 刷新看板后折叠状态保持（本地存储）。
10. **键盘导航**：不聚焦输入框时，`j/k` 上下移动焦点（支持首尾循环，末项↓跳到首项、首项↑跳到末项）→ `d` 删除/关闭当前 → `m` 进入移动或稍后 → `Enter` 激活当前标签 → `Esc` 退出选择模式。

### 5.3 权限边界验证

1. **运行时 tabId 不上云**：检查 `workspace_snapshots` / `user_settings` 表结构与写入字段，确认 tabId、windowId、boardAssignments（虚拟看板归属）均未上传。
2. **service_role key 不进源码 / dist**：`scripts/inject-env.mjs` 只注入 `SUPABASE_URL` + `SUPABASE_ANON_KEY`；`.env.local` 未 Git 追踪。
3. **RLS 保留**：所有 `public.*` 表均基于 `auth.uid() = user_id` 做行级策略（迁移 001 已覆盖，本轮未修改数据库）。

### 5.4 E2E 测试（Playwright）

新增 Playwright E2E 测试框架，覆盖扩展启动、看板交互、选项页导航等场景。

**运行方式：**

```bash
npm run e2e                              # 默认 headed 模式（MV3 扩展需要）
E2E_EMAIL=xxx E2E_PASSWORD=xxx npm run e2e  # 带登录态的完整测试
npx playwright show-report               # 查看HTML报告
```

**测试文件与覆盖范围：**

| 文件 | 用例数 | 覆盖范围 |
|---|---|---|
| `e2e/00-boot-and-auth.e2e.js` | 3 | popup 加载无报错、选项页语言/主题下拉框渲染、登录流程（需凭证） |
| `e2e/01-board.e2e.js` | 7 | 顶部工具栏渲染、主题切换、看板/时间线视图切换、批量选择模式、分组折叠、最近关闭弹窗、工作区弹窗、j/k 键盘导航 |
| `e2e/02-options.e2e.js` | 4 | 侧边栏默认面板、主题/语言 select 存在性、hash 跳转隐私面板、外观面板切换 |

**运行结果：** 10 passed / 4 skipped（跳过项为需要登录态或打开标签页的条件测试）

**关键技术点：**

- **headed 模式必需**：Chromium legacy `headless=true` 无法加载 MV3 扩展 service worker，`launchPersistentContext` 不支持 `headless: "new"` 字符串，因此默认 headed（`headless: false`）。
- **持久化上下文**：`e2e/_fixtures.js` 通过 `chromium.launchPersistentContext` + `--load-extension` 加载扩展，轮询 `context.serviceWorkers()` 发现扩展 ID。
- **异步断言**：主题切换通过 `expect.poll` 轮询 `data-theme` 属性，而非固定 `waitForTimeout`，适配 `sendMessage` → storage → 回调的异步链路。
- **登录门禁兼容**：未登录时 `#board-content` 有 `.hidden` 类，内部元素的 `toBeVisible()` 会失败，测试通过 `toHaveClass` + `evaluate(el.click())` 兼容此场景。

---

## 6. 代码审计与修复（2026-07-30）

本轮对 11 项功能进行了深度代码审计，发现并修复了以下问题：

### 6.1 已修复问题

| # | 问题 | 影响 | 修复方式 |
|---|---|---|---|
| 1 | 「内存占用」功能依赖 `chrome.processes` | Manifest V3 下 API 不可用，始终显示空列表 | 移除全部 UI/逻辑/CSS/i18n 相关代码 |
| 2 | 后台 `TabProcessInfo` 采集逻辑 | 同上，service worker 中 `chrome.processes` 为 undefined | 移除 `loadTabProcesses` / `saveTabProcesses` / `upsertTabProcess` / `clearTabProcesses` |
| 3 | j/k 键盘导航不支持首尾循环 | 焦点到末项后无法回到首项 | 改为取模循环：`i >= n ? 0` 和 `i < 0 ? n-1` |
| 4 | 「保存偏好设置」按钮显示原始 key `savePreferences` | 选项页按钮文案异常 | 中英文 locale JSON 新增 `"savePreferences"` 键 |
| 5 | 工作区标题校验：>80 字符直接拒绝 | 用户常有超 80 字符标题场景 | 改为 160 字符自动截断（`slice(0, 160)`） |
| 6 | 5 个 workspace 写操作云端失败导致本地数据丢失 | `upsertWorkspace` 无 `.catch()`，云端异常时后续 `saveWorkspaceSnapshots` 不执行 | 补齐 `.catch(() => {})`，与命令快捷键路径行为一致 |
| 7 | 账号切换时本地用户数据未清理 | 退出/切换账号后 `deferredTabs` / `recentlyClosedTabs` / `workspaceSnapshots` / `workspaceHistories` / `boardAssignments` / `tabCreatedAt` / `board_collapsed_groups` 残留，新用户可见前用户数据 | `storage.ts` 新增 `clearUserData()` 清理 7 个用户级存储键；`prepareOptionsForUser()` 账号变更时调用；`auth-sign-out` 退出时调用；保留设备级 `deviceId` / `deviceName` |

### 6.2 权限与安全审计（需手动验证）

| 项目 | 状态 | 说明 |
|---|---|---|
| 账号切换数据隔离 | ✅ 已修复 | 6.1 #7：`clearUserData()` 清理 7 个用户级存储键，账号切换和退出登录时均调用 |
| 离线/Supabase 故障保护 | ✅ 已修复 | 6.1 中 #6 已补齐 catch；`loadAllWorkspaces` 云端失败降级本地 |
| RLS 数据隔离 | ✅ | 所有表基于 `auth.uid() = user_id`，本轮无数据库变更 |
| service_role key 不进构建 | ✅ | `inject-env.mjs` 仅注入 `SUPABASE_URL` + `SUPABASE_ANON_KEY` |

### 6.3 影响文件

本轮修改涉及 `background.ts` / `board.ts` / `board.css` / `board.html` / `shared.ts` / `storage.ts` / `_locales/*/messages.json` / `tests/shared.test.js` / `handoff.md`。

### 6.4 本轮新增功能（2026-07-31）

| 功能 | 涉及文件 | 说明 |
|---|---|---|
| 工作区恢复智能对比 | `background.ts` / `board.ts` / `board.css` / `shared.ts` / `_locales` | 恢复预览检测已打开标签，显示「✔ 已打开」标记，确认时自动跳过重复 URL |
| 时间线过滤按钮 | `board.ts` / `board.html` / `board.css` / `shared.ts` / `_locales` | 时间线工具栏新增「全部 / 今天 / 3天内 / 1周内」快捷过滤按钮 |
| 最近关闭全文搜索 | `board.ts` / `board.html` / `board.css` / `_locales` | 最近关闭弹窗新增搜索框，支持按 title/url 实时过滤 |
| 折叠状态按窗口记忆 | `board.ts` | `board_collapsed_groups` 存储格式从 `string[]` 改为 `Record<windowId, string[]>` |
| 账号切换数据清理 | `background.ts` / `storage.ts` / `tests/shared.test.js` | `clearUserData()` 清理 7 个用户级存储键，账号切换和退出登录时调用 |

新增 5 条单元测试（`matchesTimelineFilter` 纯函数），总计 127 条测试全部通过。

---

## 7. 已知限制与后续建议

### 7.1 已知限制

- **通知无声音配置**：系统通知默认无 sound，Chrome MV3 限制较多；如需声音建议后续走自定义按钮 + HTML5 audio（在 popup/看板中实现）。
- **工作区 10 版上限写死**：如需调整，改 `shared.ts` 的 `MAX_WORKSPACE_HISTORY_VERSIONS` 常量即可，无需动业务代码。
- **工作区标题 160 字符截断**：超长标题自动截断至 160 字符（`validateWorkspaceTitle`）。
- **最近关闭无全文搜索**：✅ 已实现。列表支持按 title/url 实时过滤。
- **工作区恢复未对比已打开标签**：✅ 已实现。恢复预览显示「✔ 已打开」标记，确认时自动跳过。

### 7.2 后续建议优先级

- **P1**：~~工作区恢复时智能对比当前标签~~ ✅ 已实现。预览显示已打开标签标记，确认时自动跳过重复 URL。
- **P2**：快捷键在 `chrome://` 页、PDF 预览等特殊页面有时不触发，manifest 已声明但需按 Chrome 版本做文档说明。
- **P2**：~~折叠状态按窗口维度记忆~~ ✅ 已实现。`board_collapsed_groups` 存储格式改为 `Record<windowId, boardKey[]>`。
- **P3**：~~时间线视图增加「已过期 / 3 天内 / 1 周内」过滤快捷按钮~~ ✅ 已实现。时间线工具栏新增「全部 / 今天 / 3天内 / 1周内」过滤按钮。

---

## 8. 环境变量 & 构建说明

### `.env.local` 必需项

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

- 新增权限 `notifications / alarms / sessions` 无需额外后端配置；Supabase 端无变更。
- GitHub Actions 中 release.yml 已使用 `SUPABASE_URL` / `SUPABASE_ANON_KEY` Secrets 注入，无需新增 Secret。
- `dist/` 构建后 `supabase-config.js` 会生成真实配置（未入库，仅本地临时产物）。

### 重新加载扩展

1. `npm run build`
2. `chrome://extensions`（或 `edge://extensions`）
3. 开发者模式 → 「加载已解压」→ 选 `dist/`
4. 如需让 Alt+B/D/S 快捷键生效，可在扩展页右下角「键盘快捷键」里确认。

---

## 9. Git 分支与发布状态

- **所有代码已合并发布**：
  - `feature/20260719` → PR #26 → `dev`（`b8c8a49`，tag `dev-preview`）
  - `dev` → PR #27 → `main`（`9c439cb`，tag `v0.1.11`）
- 当前分支 `feature/20260719` 工作区干净，与远端同步。
- 后续新功能应基于最新 `dev` 创建 `feature/*` 分支。
- 按 `PULL_REQUEST_WORKFLOW.md`：
  - push 前先 `git pull --rebase` 检查冲突；
  - 合入 `dev` 推荐走 PR + Actions 自动校验；
  - `main` 只接受稳定 PR，禁止直接推送。
- 如后续需要创建 PR：推荐使用仓库 `PR 描述模板`（见 AGENTS.md 末尾），勾选对应 Scope 框。

---

_End of handoff._
