# Tab Garden 项目交接文档

> 最后更新时间：2026-07-30  
> 当前分支：`feature/20260719`  
> 验证状态：typecheck ✅ / 115 tests ✅ / diff-check ✅ / 构建通过 ✅

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
npm test             # 完整构建 + Node.js 单元测试（115 条用例）
git diff --check     # 空白符检查（提交前必跑）
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
| 10 | 全键盘导航（j/k/d/m/Enter/Esc） | ✅ 已完成 | 看板和时间线通用；输入控件内自动禁用；当前行高亮边框 |
| 11 | 按内存占用排序并一键关闭 Top N（processes API） | ✅ 已完成 | 多 tab 进程内存分摊；带相对进度条；「关闭前 5」按钮 |

---

## 3. 本轮提交（7 个原子 Commit，未 Push）

按职责拆分，便于回溯与回滚：

```
06c47bd  chore(build): add notifications/alarms/sessions/processes permissions and commands
3fae067  docs(i18n): add keys for batch/recent/timeline/collapse/memory/history/commands
9589abb  feat(shared): add workspace history/recent tab/process types and validators
f7a65c3  feat(storage): add recently closed/memory process/workspace history helpers
fe491da  feat(background): due notifications, commands, recent capture and new RPCs
ba7e1a1  feat(board): add batch bar/recent dialog/timeline/collapse/memory dialog structure and styles
be424ea  feat(board): batch select, recent, timeline, collapse, keyboard, memory interactions
```

| Commit | 文件 | 说明 |
|---|---|---|
| 06c47bd | `src/manifest.json` | 新增 `notifications / alarms / sessions / processes` 权限；注册 Alt+B / Alt+D / Alt+S commands |
| 3fae067 | `src/_locales/{zh_CN,en}/messages.json` | 新增 ~50 个翻译键，覆盖批量操作 / 最近关闭 / 时间线 / 折叠 / 内存 / 历史版本 / 工作区导入导出 / 命令描述 |
| 9589abb | `src/shared.ts` | 新增 6 个领域类型 + 12+ 纯验证转换函数；常量 `MAX_RECENTLY_CLOSED_TABS=50` / `MAX_WORKSPACE_HISTORY_VERSIONS=10` |
| f7a65c3 | `src/storage.ts` | 最近关闭 / 进程缓存 / 工作区历史 三组存储辅助函数 |
| fe491da | `src/background.ts` | alarms 定时检查到期 + 系统通知；commands 快捷键；tabs.onRemoved 自动捕获最近关闭；~15 个新 PopupMessage RPC |
| ba7e1a1 | `src/board.html` / `src/board.css` | 批量操作栏 + 批量移动 / 最近关闭 / 内存弹窗结构；时间线工具栏 + 折叠 / 选中 / 焦点等样式 |
| be424ea | `src/board.ts` | 批量选择、最近关闭会话恢复、看板/时间线切换、分组折叠持久化、j/k/d/m 键盘导航、进程内存排序等全部交互逻辑 |

---

## 4. 核心新增机制与文件职责

### 4.1 共享类型与纯函数 —— `src/shared.ts`

| 类型 / 函数 | 用途 |
|---|---|
| `RecentlyClosedTab` / `validateRecentlyClosedTab()` | 最近关闭 tab 记录结构；含 sessionId 便于 sessions.restore 精准恢复 |
| `TabProcessInfo` / `validateTabProcessInfo()` | 进程信息（tabId、processId、privateMemoryKB、cpu）；内存弹窗数据源 |
| `WorkspaceVersion` / `WorkspaceHistory` / `appendWorkspaceVersion()` | 工作区单版快照 + 集合；10 版上限自动截断 |
| `WorkspacePortableData` / `toWorkspacePortableData()` / `previewWorkspacePortableImport()` | 工作区便携 JSON 格式 + 导出 + 导入预览（支持字符串/对象入参，自动过滤运行时字段） |

### 4.2 存储辅助 —— `src/storage.ts`

| 存储键 | 函数族 | 说明 |
|---|---|---|
| `recentlyClosedTabs` | `loadRecentlyClosedTabs / saveRecentlyClosedTabs / appendRecentlyClosedTab / removeRecentlyClosedTab / clearRecentlyClosedTabs` | 50 条上限，最近关闭 tab 列表 |
| `tabProcesses` | `loadTabProcesses / saveTabProcesses / upsertTabProcess / clearTabProcesses` | 内存诊断缓存，按 tabId 聚合 |
| `workspaceHistory` + workspaceId 子键 | `loadWorkspaceHistory / loadAllWorkspaceHistories / saveWorkspaceHistory / saveWorkspaceVersion / deleteWorkspaceHistory / clearAllWorkspaceHistories` | 每个 workspaceId 对应 10 个版本的数组 |

### 4.3 后台消息 RPC（新增 ~15 个）— `src/background.ts`

> 全部走原有 `PopupMessage` 联合类型与 `chrome.runtime.onMessage` 分发：

| 类型 | 用途 | 返回 |
|---|---|---|
| `get-recently-closed` | 获取最近关闭列表 | `RecentlyClosedTab[]` |
| `restore-recently-closed` | 恢复指定记录（优先 sessionId） | 新 tab 基础信息 |
| `remove-recently-closed` | 从列表移除单条 | `{ ok: true }` |
| `clear-recently-closed` | 清空最近关闭列表 | `{ ok: true }` |
| `get-tab-processes` | 读取进程缓存快照 | `TabProcessInfo[]` |
| `refresh-tab-processes` | 重新调用 chrome.processes 取实时数据 | `TabProcessInfo[]` |
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
| 内存诊断 | `memoryUsage`, `refreshMemory`, `closeTopMemory`, `memoryEmpty` |
| 工作区版本 | `workspaceHistory`, `saveVersion`, `restoreVersion`, `versionNote`, `versionAt` |
| 导入导出 | `exportWorkspaces`, `importWorkspaces`, `importPreview`, `importConfirmed`, `importDuplicated`, `importDone` |

---

## 5. 验证方式

### 5.1 自动验证（全部通过）

```bash
npm run typecheck      # tsc --noEmit           （0 错误）
npm test               # 构建 + 115 条单元测试   （115/115 通过，约 224ms）
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
10. **键盘导航**：不聚焦输入框时，`j/k` 上下移动焦点 → `d` 删除/关闭当前 → `m` 进入移动或稍后 → `Enter` 激活当前标签 → `Esc` 退出选择模式。
11. **内存诊断**：点「内存占用」→ 等待刷新 → 列表按 MB 降序，进度条相对最大值 → 「关闭前 5」一键关闭 top 5（跳过当前活动 tab）。

### 5.3 权限边界验证

1. **运行时 tabId 不上云**：检查 `workspace_snapshots` / `user_settings` 表结构与写入字段，确认 tabId、windowId、boardAssignments（虚拟看板归属）均未上传。
2. **service_role key 不进源码 / dist**：`scripts/inject-env.mjs` 只注入 `SUPABASE_URL` + `SUPABASE_ANON_KEY`；`.env.local` 未 Git 追踪。
3. **RLS 保留**：所有 `public.*` 表均基于 `auth.uid() = user_id` 做行级策略（迁移 001 已覆盖，本轮未修改数据库）。

---

## 6. 已知限制与后续建议

### 6.1 已知限制

- **通知无声音配置**：系统通知默认无 sound，Chrome MV3 限制较多；如需声音建议后续走自定义按钮 + HTML5 audio（在 popup/看板中实现）。
- **processes API 仅 Chromium 支持**：Firefox 版需降级为 tab count 估算，当前代码已做 try/catch 降级返回基本信息。
- **工作区 10 版上限写死**：如需调整，改 `shared.ts` 的 `MAX_WORKSPACE_HISTORY_VERSIONS` 常量即可，无需动业务代码。
- **键盘导航未覆盖工作区编辑弹窗**：工作区保存/加载弹窗内的左右面板暂未加 j/k 操作，后续可扩展。
- **最近关闭无全文搜索**：列表仅按关闭时间倒序，后续可加 title/url 过滤。

### 6.2 后续建议优先级

- **P1**：工作区恢复时智能对比当前标签，提示「该标签已打开，是否跳转到现有 tab」，避免重复打开翻倍。
- **P1**：`chrome.processes` 返回内存周期性写入（15 分钟一次），避免多次刷新引起的 CPU 抖动。
- **P2**：快捷键在 `chrome://` 页、PDF 预览等特殊页面有时不触发，manifest 已声明但需按 Chrome 版本做文档说明。
- **P2**：折叠状态按窗口维度记忆（现在按 boardKey 全局），多窗口看板体验更好。
- **P3**：时间线视图增加「已过期 / 3 天内 / 1 周内」过滤快捷按钮。

---

## 7. 环境变量 & 构建说明

### `.env.local` 必需项

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

- 新增权限 `notifications / alarms / sessions / processes` 无需额外后端配置；Supabase 端无变更。
- GitHub Actions 中 release.yml 已使用 `SUPABASE_URL` / `SUPABASE_ANON_KEY` Secrets 注入，无需新增 Secret。
- `dist/` 构建后 `supabase-config.js` 会生成真实配置（未入库，仅本地临时产物）。

### 重新加载扩展

1. `npm run build`
2. `chrome://extensions`（或 `edge://extensions`）
3. 开发者模式 → 「加载已解压」→ 选 `dist/`
4. 如需让 Alt+B/D/S 快捷键生效，可在扩展页右下角「键盘快捷键」里确认。

---

## 8. Git 分支与 Push 提醒

- 当前分支：`feature/20260719`，7 个 commit 全部在本地，**未 push**。
- 按 `PULL_REQUEST_WORKFLOW.md`：
  - push 前先 `git pull --rebase` 检查冲突；
  - 合入 `dev` 推荐走 PR + Actions 自动校验；
  - `main` 只接受稳定 PR，禁止直接推送。
- 如后续需要创建 PR：推荐使用仓库 `PR 描述模板`（见 AGENTS.md 末尾），勾选对应 Scope 框。

---

_End of handoff._
