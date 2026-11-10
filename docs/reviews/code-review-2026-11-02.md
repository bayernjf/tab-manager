# Tab Garden 深度代码评审报告（2026-11-02）

> 评审方式：只读评审。全量通读 `src/`（12 个 TS + 3 组 HTML/CSS）、`supabase/migrations/001–013`、`tests/`、`e2e/`、`scripts/`、`docs/` 与根目录文档；实际执行 `npm run typecheck`、`npm test`、`npm run e2e`、`npm audit`、`npm outdated` 及自建 i18n 键扫描脚本。未修改任何源码。
> 关联文档：仓库已存在 `docs/project-audit-2026-09-30.md`（下称「9-30 审计」）。经 `git log --since=2026-09-30` 确认，该审计之后 `src/` 无任何代码变更，其发现全部仍然成立；本报告对其中的关键条目做了独立复核与最新行号确认，并补充了若干新发现。

---

## 1. 仓库定位与规模概览

Tab Garden：Chrome / Edge Manifest V3 标签管理扩展。原生 TypeScript strict + HTML/CSS，无框架、无打包器（`tsc` 直出）；后台为 ES Module service worker；后端为 Supabase Auth REST + PostgREST（无 SDK）。

| 区域 | 规模（行） | 说明 |
|---|---|---|
| `src/*.ts` | ~6,530 | `board.ts` 2233、`background.ts` 1448、`shared.ts` 1415 三大件占 78% |
| `tests/shared.test.js` | 3069 | 205 条 Node 单测（`node --test`） |
| `e2e/` | 695 | 17 条 Playwright 用例（加载真实扩展） |
| `supabase/migrations/` | 13 个文件 | RLS 全覆盖，含 3 个有意保留的废弃迁移（008/009/010） |
| git 跟踪文件 | ~125 | 其余为文档、配置、CI |

架构分层清晰：前台（popup/options/board）不持有 token、不直连数据库，全部经 `background.ts` 的 `chrome.runtime.onMessage` 路由（约 60 个分支）转发；`storage.ts` 管 `chrome.storage.local`，`sync.ts`/`auth.ts` 管 Supabase。`board-dom.ts`/`board-history.ts` 已从无循环依赖地拆出。

---

## 2. 结论摘要

| 严重度 | 数量 |
|---|---|
| P0 | 1 |
| P1 | 5 |
| P2 | 9 |
| P3 | 12 |

**最关键的 3 条：**

1. **P0 — 云端工作区列表整表覆盖本地，离线期创建的工作区被静默删除**（`src/background.ts:457-466`）。
2. **P1 — 工作区标题代码允许 160 字符、数据库 CHECK 仅 80，81–160 字标题永远无法上云且失败被吞**（`src/shared.ts:436` vs `supabase/migrations/011_create_workspace_snapshots.sql:28` + `src/background.ts:725`）。
3. **P1 — 工作区视图下键盘 `d`/`m`/`Enter` 会把伪 tabId（0..n）当作真实 tabId 操作，可能关闭/稍后任意真实标签页**（`src/board.ts:171-179,2129-2166` + `src/shared.ts:637` + `src/background.ts:1048-1052`）。

---

## 3. 逐条发现（按严重度排序）

### P0 — 可被利用的安全问题 / 数据丢失 / 线上中断

#### P0-1 云端工作区列表整表覆盖本地 → 静默数据丢失

- **位置**：`src/background.ts:457-466`（`loadAllWorkspaces`）
- **证据**：
  ```ts
  const cloud = await fetchWorkspaces(userId).catch(() => null);
  if (cloud) {
    await saveWorkspaceSnapshots(cloud).catch(() => {});   // 云端非空即以云端整表覆盖本地
    return cloud;
  }
  ```
  所有写路径（`save-workspace:827`、`add-tab-to-workspace:910`、`update-workspace-tab:934`、`import-workspaces-json:1416` 等）都以该函数返回的「云端列表」为基数回写本地。
- **影响**：用户在离线 / Supabase 故障 / token 失效期间创建或修改的工作区只存在于本地；下一次云端拉取成功后这些条目被整表覆盖、**无任何提示地消失**。
- **修复建议**：改为按 `id` 合并（云端 ∪ 本地），冲突时以 `updatedAt` 较新者为准；或至少在覆盖前把「仅本地存在」的条目先 upsert 上云。

### P1 — 严重缺陷（功能错误、崩溃、数据不一致）

#### P1-1 工作区标题长度 TS(160) 与 DB(80) 不一致，长标题永远无法同步且失败被吞

- **位置**：`src/shared.ts:436,444`（允许并截断到 160）；`supabase/migrations/011_create_workspace_snapshots.sql:28`（`check (char_length(trim(title)) between 1 and 80)`）；吞错点 `src/background.ts:725,840`（`upsertWorkspace(...).catch(() => {})`）
- **影响**：81–160 字符标题本地校验通过、本地保存成功，但 PostgREST 写入触发 CHECK 违例（400），且错误被 `.catch(() => {})` 吞掉——用户无任何感知，该工作区永远不会出现在其他设备。
- **修复建议**：把 `shared.ts` 的 160 统一收紧为 80（无需迁移，推荐）；或新起迁移放宽 DB 至 160。同时此类云端写失败至少应记入同步状态而非静默。

#### P1-2 工作区视图下键盘操作作用于错误的真实标签页

- **位置**：`src/shared.ts:637`（`groupWorkspaceTabsByDomain` 把工作区标签映射为 `{id: 数组下标}`）；`src/board.ts:171-179`（`getVisibleTabIds` 在工作区模式返回这些伪 id）；`src/board.ts:2129-2166`（键盘 `d`/`m`/`Enter` 不区分 `scopeMode` 直接调用关闭/稍后/激活）；`src/background.ts:1048-1052`（`close-board-tab` 仅校验 `>0` 的整数）
- **影响**：工作区模式下伪 id 为 0..n-1；id=0 被后台校验拒绝，但 id=1..n-1 是合法入参——若浏览器中恰好存在该 id 的真实标签（浏览器重启后 tab id 可从很小数字开始），按 `d` 会**关闭一个完全不相关的真实标签**，按 `m` 会把它加入稍后列表并关闭，按 `Enter` 会激活错误的标签。
- **修复建议**：键盘导航处理在工作区模式下禁用 `d`/`m`/`Enter`，或 `getVisibleTabIds` 在工作区模式返回空；后台 `close-board-tab` 等写操作可要求调用方附带当前窗口上下文校验。

#### P1-3 popup 保存设置基于 `DEFAULT_SETTINGS` 展开 → 静默重置同步开关等全部设置

- **位置**：`src/popup.ts:191-198`
  ```ts
  const settings = { ...DEFAULT_SETTINGS, autoGroupEnabled: autoToggle.checked,
                     minimumTabs: Number(minimumTabs.value), theme };
  await send({ type: "update-settings", settings });
  ```
- **影响**：在 popup 里切一次主题或分组开关，`cloudSyncEnabled` / `syncRulesEnabled` / `syncIgnoreListEnabled` / `defaultGroupColor` / `deferredShortcutTimes` / `language` 全部被重置为默认值（`src/shared.ts:297-309`），并经 `background.ts:1280-1288` 推送到云端。用户可能因此**无意中关掉云同步**。
- **修复建议**：以 `get-popup-state` 返回的当前 `state.settings` 为基数展开，只覆盖本次变更字段。

#### P1-4 并发刷新 token 无锁 → 有效会话被误判失效并强制登出

- **位置**：`src/auth.ts:112-135`（`getValidSession` 无 in-flight 复用；刷新失败且 `status` 为 400/401/403 时 `saveSession(null)`）；并发源 `src/sync.ts:241`（`Promise.all([fetchBoardCustomGroups, fetchBoardLayouts])` 各自触发 `getAccessToken`）、`src/background.ts:343`
- **影响**：Supabase 默认开启 refresh token 轮换。两个并发请求同时发现 token 将过期 → 同时用同一 refresh_token 刷新 → 后到的请求收到 400 → 落入 `isExplicitAuthenticationFailure` → **清空本地有效会话，用户被强制登出**。
- **修复建议**：模块级缓存一个 in-flight 的刷新 Promise，所有并发调用复用之。

#### P1-5 通知去重状态易失 + `onClosed` 即删 → 同一提醒每分钟重复弹窗

- **位置**：`src/background.ts:490`（`notifiedDeferredIds` 为模块级内存 `Set`）、`581-585`（`onClosed` 中 `notifiedDeferredIds.delete`）、`523-549`（每分钟轮询只按该 Set 去重）
- **影响**：(a) 用户只是划掉通知（未点击打开），去重标记被删除，下一轮 1 分钟轮询再次弹同一通知，循环往复直到打开或删除提醒；(b) MV3 service worker 空闲约 30s 即被回收，内存 Set 清空后所有已到期提醒再次集中弹窗。缓解因素：通知 id 固定为 `deferred:<id>`，重复创建是「更新同一条」而非堆叠多条，但仍会反复触发系统提示。
- **修复建议**：把已通知状态持久化（如 `DeferredTab.lastNotifiedAt` 或 storage 键），并移除 `onClosed` 中的删除逻辑。

### P2 — 质量 / 可维护性 / 性能问题

1. **「最近关闭」存储链路整体是死代码（约 100 行）**——`src/background.ts:623-649`：`chrome.tabs.onRemoved` 触发时标签已删除，`chrome.tabs.get(tabId)`（:632）必然 reject → `tab` 恒为 null → 直接 return，`appendRecentlyClosedTab` 永不执行；且 :634 读取的 `removeInfo.sessionId` 在 Chrome `TabRemoveInfo`（仅 `isWindowClosing`/`windowId`）中根本不存在。下游 4 个 RPC（`get/restore/remove/clear-recently-closed`，:1319-1352）也无任何前台调用——看板 UI 直连 `chrome.sessions.getRecentlyClosed`（`src/board.ts:398`）。但 `handoff.md` §4.1/§2 仍宣称「`chrome.tabs.onRemoved` 自动捕获」「含 sessionId 便于 sessions.restore 精准恢复」。**建议**：删除该链路，统一走 sessions API；或修文档。
2. **`import-workspaces-json` 谎报同步结果**——`src/background.ts:1442`：`const synced = useCloud;` 只要开了云同步就返回 `synced: true`，但循环内每个 `upsertWorkspace` 都有 `.catch(() => {})`（:1424,1438），全部失败也报成功。
3. **整表 replace 非原子**——`src/sync.ts:127-135`（`replaceGroupRules`）、`:151-159`、`:173-175`、`:189-191` 均为「先 DELETE 全部再 POST」；两步之间网络失败会把云端清空。下次 `restore*SyncData` 时远端为空会用本地重新初始化（`src/shared.ts:1093-1096`）可自愈，但期间其他设备拉到的是空表。
4. **storage 配额与膨胀风险**——`fetchWorkspaces`（`src/sync.ts:193-202`）无 `limit` 全量拉取并整体写入 `chrome.storage.local`（10MB 配额，manifest 无 `unlimitedStorage`）；`workspaceHistories` 理论峰值约 8MB；`boardAssignments` 只增不减（`src/shared.ts:698-707` 无 GC）。所有 `set` 失败会冒泡为普通错误，无降级。
5. **迁移 003 与 004 重复且顺序相关**——两者都给 `user_settings` 加 `theme`：`003_add_theme_column.sql:13-15` 为 `not null default 'light'`，`004_add_theme_to_user_settings.sql:13-15` 为 nullable；均 `if not exists`，最终 schema 取决于执行顺序（且 004 头部日期 18:19 早于 003 的 21:58，编号却更大）。建议废弃其一或在文档中固定顺序。
6. **DB 与代码校验口径不一致（另两处）**——(a) `minimum_tabs` DB `between 2 and 20`（`001:30-31`）vs 代码 `2..100`（`src/shared.ts:1210-1212`）：UI 下拉只有 2/3/4（`src/popup.html:37`），但导入 JSON 可带入 21–100 → `pushSettings` 失败；(b) 分组规则标题 DB/sync 校验 ≤40（`001:42`、`src/shared.ts:337`）vs 便携导入允许 ≤100（`src/shared.ts:1185`）：含 41–100 字标题的导入文件预览通过、本地生效，推送云端时报「分组规则包含无效数据」。
7. **E2E 主题用例不稳定**——本次实跑 `npm run e2e`：`11 passed / 5 skipped / 1 flaky (3.4m)`，flaky 为 `e2e/01-board.e2e.js:31`「theme toggle flips data-theme」（重试后通过）。异步链路（sendMessage→storage→回调）靠 `expect.poll` 轮询，仍有竞态窗口。
8. **测试「验证门」含金量问题**——`tests/shared.test.js` 中有 13 处只对 `dist/*` 产物 `readFile` 后做正则匹配的「契约测试」（如 :2517 仅断言 `chrome.tabs.onRemoved.addListener` 存在），对 P2-1 这类「监听器注册了但逻辑永不生效」的死代码零检出；`createGroupRuleFromInput`、`validateWorkspacePortableData`、`previewWorkspacePortableImport` 等关键校验函数无直接覆盖。
9. **单体文件过大**——`board.ts` 2233 行（含弹窗、拖拽、键盘、双视图、工作区编辑全部状态），`background.ts` 1448 行的消息路由器约 60 个 if 分支。9-30 审计已拆分 `board-dom.ts`/`board-history.ts`，但工作区主弹窗仍耦合在看板可变状态上（`handoff.md` §4.6 已自承）。继续拆分是主要可维护性杠杆。

### P3 — 体验 / 规范问题

1. **3 个用户可见的缺失 i18n 键**（本次用脚本全量扫描 `i18n.t()` 与 `data-i18n` 实得）：`saveWorkspaceLoginRequired`（`src/background.ts:696`，Alt+S 未登录时 toast 直接显示原始 key）、`invalidWindow`（`src/board-history.ts:102`）、`workspace`（`src/board.ts:1827`，工作区头部前缀）。另：`i18n.t()` 缺键时返回 key 本身（`src/i18n.ts:64,68`），故代码里所有 `i18n.t(x) || "中文兜底"` 写法（如 `src/board-history.ts:27,62,106-108`）的兜底永不生效——其中 `confirmRestoreVersionPrompt` 靠该兜底才没显示原始 key。
2. **文档数字漂移**——`handoff.md:6` 称「204 unit tests」（实测 205 通过）、`handoff.md:259` 称「总计 127 条测试」；`AGENTS.md` 称迁移为「001–011」（实际 001–013）、`tests/shared.test.js`（127 条）（实际 205 条）。
3. **handoff 对 E2E 凭证读取方式的描述与实现不符**——`handoff.md:195` 称「登录凭证从 `.env.local` 的 `E2E_EMAIL`/`E2E_PASSWORD` 读取（真实环境变量优先）」，但 `e2e/_fixtures.js:95-100` 只读 `process.env`，没有任何代码加载 `.env.local`。本次在本机 `.env.local` 已配置凭证的情况下实跑，5 条登录态用例仍全部 skip——登录链路在常规 `npm run e2e` 下事实上从未被执行。
4. **README 关于原生标签组的描述已过时**——`README.md:11,40` 称「自定义分组及浏览器中手工创建的原生分组不会被自动规则改动」「若标签页已位于不受本扩展管理的原生标签组中……保持不动」，但全仓 `grep tabGroups` 无任何命中，manifest 也无 `tabGroups` 权限：扩展已不触碰原生分组，相关承诺为空。
5. **迁移注释交叉引用错误**——`008_add_deferred_shortcut_minutes.sql:16` 称「已被 `010_add_deferred_shortcut_times.sql` 取代」，实际文件是 `012_...`（其头部 Note 又写对为 012，自相矛盾）；`013_add_workspace_snapshots_updated_at.sql:15` 称「修复 009 遗漏」，实际修复的是 011 的 `workspace_snapshots`。
6. **`inject-env.mjs` 两道防线缺失**——`scripts/inject-env.mjs:32-41`：(a) 不校验注入的 key 是否真为 anon（误填 service_role 会原样打进 dist）；(b) `String.replace` 未命中占位符时静默 no-op，dist 可能携带占位符发布。建议解析 JWT payload 校验 `role==="anon"` 并对替换结果做断言。
7. **会话 token 明文存于 `chrome.storage.local`**——`src/auth.ts:56-59`（`access_token`+`refresh_token`）。这是扩展的常见做法，但本机任何能读扩展 profile 目录的进程均可取走 refresh token；可考虑 `chrome.storage.session`（需权衡重启掉线）。另外 `signOut`（:142-148）用可能已过期的 access token 调 `/logout`，401 时服务端 refresh token 实际未被吊销。
8. **`optionsState` 恒报「同步中」**——`src/background.ts:248`：登录状态下 `sync` 恒为 `{state:"syncing"}`，选项页账号卡片同步状态文案失真（`src/options.ts:68` 消费该字段）。
9. **未知消息返回 `{ok:false}` 而非错误**——`src/background.ts:1445`：调用方无法区分「消息类型不存在」与「正常空结果」。
10. **保留的废弃表/列**——`migrations/008`（`deferred_shortcut_minutes`）、`009`（`sync_tab_snapshots_enabled`）、`010`（整表 `device_tab_snapshots`，RLS/grant 齐全、闲置在线）。属有意保留（文件内有「勿删」声明），但 010 仍是一张可存标签标题/URL 的可写表，建议后续单独评估是否 drop。
11. **开发依赖主版本落后**（`npm outdated` 实测）：`@types/chrome` 0.0.326 → 0.3.7、`typescript` 5.9.3 → 7.0.2、`playwright` 1.62 → 1.64.1。均为 devDependencies，运行时无影响；`npm audit` 0 漏洞。
12. **小一致性**——`src/background.ts:866-878`（`restore-workspace-tabs`）未像 `restore-workspace`（:858-859）那样校验目标窗口为 normal；`:1152` `delete-board-group` 用 `!message.confirmed` 而其他分支用 `!== true`；`:509` toast 通知 id 用 `Date.now()`，同毫秒两次 toast 会撞 id。

---

## 4. 分维度补充说明（无实质问题项）

- **安全（注入 / XSS / 密钥 / RLS）**：全仓 `grep` 无 `innerHTML`/`insertAdjacentHTML`/`eval`/`new Function`，DOM 全部 `createElement`+`textContent`；PostgREST 查询串中的 userId/id 均经 `encodeURIComponent`（`src/sync.ts` 多处），无字符串拼接注入面；`host_permissions` 仅 `https://*.supabase.co/*`，无 content_scripts；`.env.local` 未被 git 跟踪，dist 注入仅 URL+anon key（见 P3-6 的加固建议）；13 个迁移中所有业务表均 `enable row level security` + `revoke all ... from anon` + 四条 `auth.uid() = user_id` 策略（如 `001:89-169`、`011:52-86`），RLS 真实生效。未发现明文存放的用户数据泄露点（会话 token 见 P3-7）。
- **架构与模块边界**：分层（UI → RPC → storage/sync）单一、无循环依赖；前台不持 token。主要债务是大文件（P2-9）。
- **性能**：未发现明显热点。`boardLogicalGroups`（`src/background.ts:393-406`）每次全窗口扫描为 O（标签数） 纯函数组合，量级正常；看板刷新有 300ms 防抖（`src/board.ts:2220-2225`）。
- **依赖与构建**：`npm run build`/`typecheck` 可用（见下）；`package-lock.json` 在库；无高危漏洞（audit 0）。

---

## 5. 验证门实际执行结果（2026-11-02，本机）

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | ✅ 0 错误（tsc --noEmit） |
| `npm test`（构建 + `node --test`） | ✅ **205/205 通过**，duration ~0.92s |
| `npm run e2e` | ⚠️ **11 passed / 5 skipped / 1 flaky**（3.4m）。5 条 skip 为需登录态用例——凭证机制见 P3-3；flaky 为 `01-board.e2e.js:31` 主题切换（重试通过，见 P2-7） |
| `npm audit` / `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| `npm outdated` | 见 P3-11 |
| i18n 键扫描（自建脚本比对 `i18n.t()`/`data-i18n` 与两份 locale JSON） | 缺 4 键（见 P3-1），`data-i18n` 137 键零缺失 |

注：e2e 需本机 Chromium 与已构建的 `dist/`，本次为真实执行，非引用历史结果。

---

## 6. 文档与实现一致性抽查（9 处）

| # | 文档声称 | 实际验证 | 结论 |
|---|---|---|---|
| 1 | `handoff.md:6`「204 unit tests」 | 实测 205 通过 | ❌ 漂移（P3-2） |
| 2 | `handoff.md:6`「17 E2E tests ✅ (0 skipped)」 | 实测 11 passed/5 skipped/1 flaky | ❌ 仅在导出环境变量后可能复现（P3-3、P2-7） |
| 3 | `handoff.md:181`「service_role key 不进源码/dist，inject-env 只注入两个变量」 | `scripts/inject-env.mjs:32-40` 属实（但缺校验，P3-6） | ✅（有保留） |
| 4 | `handoff.md:180`「运行时 tabId 不上云」 | `src/sync.ts:204-220` 工作区载荷仅 title/url/device 字段；boardAssignments 仅存本地 | ✅ |
| 5 | `handoff.md:182`「所有 public 表 RLS 基于 auth.uid()」 | 逐迁移核对属实 | ✅ |
| 6 | `handoff.md:86`「RecentlyClosedTab 含 sessionId 便于精准恢复」+「onRemoved 自动捕获」 | 链路永不生效（P2-1） | ❌ |
| 7 | `README.md:11,40` 原生分组「保持不动」 | 无 `tabGroups` 代码与权限 | ❌ 过时（P3-4） |
| 8 | `AGENTS.md`「迁移 001–011」「测试 127 条」 | 实际 001–013 / 205 条 | ❌ 漂移（P3-2） |
| 9 | `handoff.md:150`「board.ts 由 2445 降至 2233 行」 | `wc -l` 实测 2233 | ✅ |

---

## 7. 修复优先级建议

1. **先做数据安全三件套**：P0-1（合并策略替代整表覆盖）、P1-1（标题长度统一为 80）、P1-3（popup 基于当前设置展开）。均为小改动、直接消除静默数据丢失/设置重置。
2. **修会话与误操作面**：P1-4（刷新 Promise 复用）、P1-2（工作区模式禁用键盘标签操作）、P1-5（通知去重持久化）。
3. **清理死代码与同步语义**：P2-1（删最近关闭链路并同步修 handoff）、P2-2（import synced 如实上报）、P2-3（replace 改为 upsert 或自愈补偿说明）。
4. **迁移与文档收口**：P2-5/P2-6（统一 DB 与代码校验口径，新起迁移而非改旧文件）、P3-1（补 4 个 i18n 键）、P3-2/3/4/5（文档数字与表述对齐实现）。
5. **流程加固**：P3-6（inject-env 校验 anon + 替换断言）、P2-7（消 flaky）、P2-8（把 13 处正则契约测试替换为行为测试）。

> 说明：9-30 审计中另有约 20 条 P1/P2 级细节（如 `boardAssignments` 膨胀、`optionsState` 恒 syncing、CSS 媒体查询失效、a11y 噪音等）经本次抽查仍然成立，为免重复未全部列入；执行修复时建议以本报告严重度排序为主、以 `docs/project-audit-2026-09-30.md` §4 为补充清单。
