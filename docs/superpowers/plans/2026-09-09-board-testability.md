# 看板可测性重构 + E2E 回归（2026-09-09）

## 背景

`tests/shared.test.js` 有 127 个单测全绿，但只有 `shared.ts` / `auth.ts` / `sync.ts` / `storage.ts`
是真正 import 进来跑函数。`board.ts`（2488 行）、`background.ts`（1468 行）的"测试"是把编译产物
当文本读进来做正则匹配：

```js
const script = await readFile(new URL("../dist/board.js", ...), "utf8");
assert.match(html, /id="deferred-reminders"/);
```

这类断言只证明某个字符串存在于产物里，不证明行为。而近期修的三个 bug 全在这两个文件里：

| Bug | 位置 | 现有测试能否发现回归 |
|---|---|---|
| 未分组拖拽顺序刷新丢失 | `board.ts` 乐观更新 + `background.ts:1093-1098` | 否 |
| 工作区报错序号用了勾选序位 | `background.ts:835` | 否 |
| 切回"当前"闪一下待恢复提醒 | `board.ts:2026` | 否 |

### 探查中发现的真实缺陷

`background.ts:869-880` 的 `restore-workspace-tabs` 与 `save-workspace:830-840` 是同一段校验逻辑的
复制粘贴，但**只有 `save-workspace` 打了真实序号补丁**，`restore-workspace-tabs:879` 仍在用
`firstInvalid + 1`（勾选序位）。抽公共函数会顺带修掉这个不一致。

## 目标

1. 把上述 bug 涉及的纯逻辑从 DOM/chrome API 中抽到 `shared.ts`，补真单测（治本）；
2. 在 Playwright 里补 DOM 层行为回归，兜住抽不出来的部分。

不改动任何 UI 行为——除了 `restore-workspace-tabs` 的序号修正（属于修 bug）和
待恢复提醒可见性收敛到单一判定（消除潜在的模式/数据冲突）。

## Part 2：抽纯函数 + 单测

`shared.ts` 目前零 import、纯逻辑，四个函数都放这里，`board.ts` / `background.ts` 改为调用。

### 2.1 `moveBoardTabOptimistically(groups, drop)` → `BoardSegmentCard[]`

来源：`board.ts:2094-2135` 的 `rebalanceGroupSegments` + `applyOptimisticTabMove`。两者现在直接
mutate 模块级 `currentState`，但逻辑全是数据运算，依赖的 `segmentTabs`、`heightUnitsForTabCount`
已在 `shared.ts`。

改为纯函数（入参 `readonly BoardSegmentCard[]`，返回新数组，不 mutate）。`board.ts` 侧：

```ts
currentState.groups = moveBoardTabOptimistically(currentState.groups, { tabId, targetBoardKey, position, targetSegmentIndex, targetTabId });
```

单测覆盖：跨组移动、组内 before/after/append、目标 tab 不存在时落到末尾、移动后分段重新平衡
（`segmentCount` / `heightUnits` / 排序正确）、源 tab 不存在时原样返回。

### 2.2 `planBoardTabInsertion(targetTabs, source, drop)` → `{ status: "ok"; tabs } | { status: "target-missing" }`

来源：`background.ts:1093-1098`。抽出"排除自身 → 定位目标 → 算插入位 → splice"这段；handler 保留
`chrome.tabs.get` / `loadState` / `boardLogicalGroups` / `saveBoardAssignments` 这些副作用。

单测覆盖：`before` / `after` / `append` 的插入位、`targetTabId` 找不到返回 `target-missing`、
移动到未分组时的顺序（bug 1 的服务端侧）、同组内前后移动不重复。

### 2.3 `validateWorkspaceTabsPayload(tabs)` → 判别联合

来源：`background.ts:830-840`（`save-workspace`）与 `869-880`（`restore-workspace-tabs`）的重复块。

```ts
| { status: "empty" }
| { status: "too-many" }
| { status: "invalid"; displayIndex: number; reason: Exclude<WorkspaceTabValidation["status"], "valid"> }
| { status: "ok"; tabs: WorkspaceTab[] }
```

`displayIndex` 统一取 `tabs[i].index`（board 传来的真实序号），缺失时回退到数组下标——即 bug 2
的修法，两个 handler 一起生效。i18n 文案仍在 handler 里拼（`shared.ts` 不引 i18n）。

单测覆盖：空数组 / 超 200 / 首个非法项的 `displayIndex` 取真实 index、缺 index 时回退下标、
非连续勾选（如只勾第 3、7 个）报第 7 个而非第 2 个、全合法时返回归一化 tabs。

### 2.4 `deferredRemindersHidden({ workspaceMode, deferredCount })` → `boolean`

来源：`board.ts:2026`（模式切换）与 `board.ts:1405`（数据渲染）两处各自 toggle 同一元素，靠调用
顺序保证不冲突——就是闪烁 bug 的根因。收敛成单一判定：工作区模式隐藏，否则按 `deferredCount === 0`。

两处调用点都改成 `deferredReminders.classList.toggle("hidden", deferredRemindersHidden({...}))`，
`renderDeferredTabs` 需要读当前 `scopeMode`。顺带修掉一个潜在问题：现在
`renderDeferredTabs` 不看模式，在工作区模式下若有数据会错误显示。

单测覆盖：四种组合（模式开关 × 有无数据）。

## Part 1：E2E 回归（`e2e/01-board.e2e.js`）

沿用现有 fixture 与"未登录则 `test.skip`"的写法。

1. **切回"当前"不闪待恢复提醒**：在页面里挂 `MutationObserver` 监听 `#deferred-reminders` 的
   `class` 变化并记录序列，点"当前"，断言全程没有出现过"移除 hidden 又加回 hidden"。需登录才能进
   工作区模式，未登录则 skip。
2. **工作区弹窗结构**：`.workspace-select-all` 在 `.workspace-tabs` 之前（`compareDocumentPosition`），
   每个 tab 行含 `.workspace-tab-index`（文本为 1-based）与 `.tab-icon`。不需登录即可开弹窗则不 skip。
3. **未分组拖拽顺序持久化**：拖动后 reload，断言顺序不回弹。依赖真实拖放 + 登录，作为
   credential-gated 用例；若环境不具备则 skip 并在断言前显式说明原因。

## 落地顺序与提交划分

按原子提交，每步跑 `npm test`：

1. `refactor(shared): extract moveBoardTabOptimistically` + 单测
2. `refactor(shared): extract planBoardTabInsertion` + 单测
3. `refactor(shared): extract validateWorkspaceTabsPayload`（含 restore 序号修正）+ 单测
4. `refactor(board): single source of truth for deferred reminders visibility` + 单测
5. `test(e2e): add board regression coverage`

## 验证

- `npm test`：现有 127 个必须全绿，新增单测约 25-30 个；
- `npm run typecheck`；
- `npm run e2e`（本地 headed，未登录时相关用例 skip）。

## 风险

- 2.1 把 mutate 改成返回新数组，`moveTab` 的 `structuredClone` 回滚路径要跟着核对；
- 2.4 改了 `renderDeferredTabs` 的可见性判定，需确认 `scopeMode` 在该函数作用域内可读；
- 2.3 改动 `restore-workspace-tabs` 的报错文案序号，属预期的行为变更。
