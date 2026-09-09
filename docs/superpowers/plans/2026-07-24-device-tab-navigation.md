# Device & Browser Tab Navigation — 历史计划归档

> **Status:** ⚠️ 已废弃（2026-07-24）

> 本文件是原始跨设备标签导航计划的历史归档。该方案已被工作区导航替代。

## 废弃原因

原计划通过 `device_tab_snapshots` 表云同步各设备/浏览器的标签快照，实现跨设备只读查看。该方案已实现并测试，但用户体验不佳：

- 跨设备标签是静态快照，无法编辑或操作
- 用户更习惯通过「工作区」显式保存和加载标签集合
- 工作区已支持跨设备同步，且可在任意设备上编辑回写

## 当前替代方案

看板导航已重构为「当前 / 从工作区加载」模式（详见 `2026-07-24-workspace-board-nav.md`）：

- 工作区弹窗显示设备名称（`workspaceDeviceName`）
- 每个工作区记录关联的设备信息（`deviceName` 字段）
- 当前设备的工作区优先显示，其他设备的工作区也可加载
- 工作区可在任意设备上编辑并回写到云端

## 遗留代码

`device_tab_snapshots` 表和 `010_create_device_tab_snapshots.sql` 迁移仍存在于数据库中，但相关 TypeScript 代码和测试已移除。如需清理，可删除该表和迁移文件。
# Device & Browser Tab Navigation Implementation Plan

> ⚠️ **作废（2026-07-24）**：本计划已被 `2026-07-24-workspace-board-nav.md` 推翻。设备/浏览器跨设备导航 + `device_tab_snapshots` 云同步的代码与测试已全部移除，改为「当前 / 从工作区加载」的工作区导航。本文件仅作历史保留，**勿据此实现**。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:exec-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a navigation below the "新建分组" form that scopes the board by device and browser. "本设备" lists browsers on this device (current browser first and selected by default); "来自其他设备" expands into other devices, then their browsers. Selecting a browser loads its tab groups into the existing board grid — the current browser stays live/editable, all others are read-only snapshots synced via Supabase.

**User decisions (confirmed):**
- Full feature with cloud sync (overrides the prior "no tab-content sync" rule in `AGENTS.md`), gated by an opt-in setting.
- Selecting a browser loads its groups into the existing board grid (not an inline accordion).

**Architecture:** Each extension install is one browser on one device, identified by a stable `deviceId` (already implemented, uncommitted) plus a new `browserKind` ("chrome" | "edge"). On changes, the service worker builds a trimmed snapshot of the board's logical groups (titles, colors, board keys, tab titles/URLs/favicons — never runtime tab/window IDs) and upserts it to a new `device_tab_snapshots` table, keyed by `(user_id, device_id)`. The board fetches all snapshots, groups them by `deviceName` (so Chrome+Edge on the same machine cluster under one "本设备"), and renders the tree. Remote scopes render the grid read-only. Sync is opt-in via `syncTabSnapshotsEnabled` (default `false`).

**Tech Stack:** Native TypeScript, Chrome MV3 tabs/storage APIs, Supabase Auth + PostgREST, HTML/CSS, Node.js test runner.

**Key constraint:** Browsers cannot read each other's live tabs. Cross-browser/cross-device visibility is only possible through the synced snapshot. Runtime IDs (`tabId`, `windowId`, `boardAssignments`) are never uploaded — only stable tab content (title/url/favIconUrl) and group metadata.

---

### Task 1: Browser detection, snapshot types, and pure helpers

**Files:**
- Modify: `src/shared.ts`
- Modify: `tests/shared.test.js`

- [ ] **Step 1: Write failing tests**

```js
test("detects Edge vs Chrome from user agent", () => {
  assert.equal(detectBrowserKind("Mozilla/5.0 ... Edg/120.0 Safari/537.36"), "edge");
  assert.equal(detectBrowserKind("Mozilla/5.0 ... Chrome/120.0 Safari/537.36"), "chrome");
});

test("builds a device tab snapshot that strips runtime tab fields", () => {
  const groups = [{ boardKey: "auto:x", kind: "automatic", title: "Docs", color: "blue", rank: 1,
    tabs: [{ id: 9, windowId: 1, isCurrentWindow: true, title: "A", url: "https://a.com", favIconUrl: "https://a.com/f.png" }] }];
  const snap = buildDeviceTabSnapshot(groups, { id: "dev-1", name: "Mac 设备" }, "chrome", "2026-07-24T00:00:00.000Z");
  assert.deepEqual(snap.groups[0].tabs, [{ title: "A", url: "https://a.com", favIconUrl: "https://a.com/f.png" }]);
  assert.equal(snap.deviceId, "dev-1");
});

test("groups snapshots by device name with current browser first", () => {
  const current = { id: "dev-1", name: "Mac 设备", browserKind: "chrome" };
  const snapshots = [
    { deviceId: "dev-1", deviceName: "Mac 设备", browserKind: "chrome", groups: [], updatedAt: "t1" },
    { deviceId: "dev-2", deviceName: "Mac 设备", browserKind: "edge",  groups: [], updatedAt: "t2" },
    { deviceId: "dev-3", deviceName: "Windows 设备", browserKind: "edge", groups: [], updatedAt: "t3" },
  ];
  const tree = groupSnapshotsByDevice(snapshots, current);
  assert.deepEqual(tree.thisDevice.browsers.map((b) => b.browserKind), ["chrome", "edge"]);
  assert.equal(tree.otherDevices.length, 1);
  assert.equal(tree.otherDevices[0].deviceName, "Windows 设备");
});

test("validates device tab snapshots and rejects bad rows", () => {
  assert.ok(validateDeviceTabSnapshot({ deviceId: "d", deviceName: "Mac", browserKind: "edge", groups: [], updatedAt: "t" }));
  assert.equal(validateDeviceTabSnapshot({ deviceId: "d", deviceName: "Mac", browserKind: "firefox", groups: [], updatedAt: "t" }), null);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test`

Expected: FAIL — the types and helpers do not exist.

- [ ] **Step 3: Implement the pure API**

```ts
export type BrowserKind = "chrome" | "edge";

export interface DeviceTabSnapshotTab { title: string; url?: string; favIconUrl?: string; }
export interface DeviceTabSnapshotGroup {
  boardKey: BoardKey; kind: BoardGroupKind; title: string; color: GroupColor; rank: number;
  tabs: DeviceTabSnapshotTab[];
}
export interface DeviceTabSnapshot {
  deviceId: string; deviceName: string; browserKind: BrowserKind;
  groups: DeviceTabSnapshotGroup[]; updatedAt: string;
}
export interface DeviceTabSnapshotSyncRow {
  user_id: string; device_id: string; device_name: string; browser_kind: BrowserKind;
  groups: DeviceTabSnapshotGroup[]; updated_at: string;
}

export function detectBrowserKind(userAgent: string): BrowserKind;
export function buildDeviceTabSnapshot(
  groups: readonly BoardLogicalGroup[],
  device: { id: string; name: string },
  browserKind: BrowserKind,
  updatedAt: string,
): DeviceTabSnapshot;
export function validateDeviceTabSnapshot(value: unknown): DeviceTabSnapshot | null;
export function deviceTabSnapshotFromSyncRow(row: DeviceTabSnapshotSyncRow, userId: string): DeviceTabSnapshot | null;
export function deviceTabSnapshotToSyncRow(userId: string, snapshot: DeviceTabSnapshot): DeviceTabSnapshotSyncRow;

export interface DeviceNavBrowser { browserKind: BrowserKind; deviceId: string; updatedAt: string; isCurrent: boolean; }
export interface DeviceNavDevice { deviceName: string; isCurrentDevice: boolean; browsers: DeviceNavBrowser[]; }
export interface DeviceNavTree { thisDevice: DeviceNavDevice; otherDevices: DeviceNavDevice[]; }
export function groupSnapshotsByDevice(
  snapshots: readonly DeviceTabSnapshot[],
  current: { id: string; name: string; browserKind: BrowserKind },
): DeviceNavTree;
```

`detectBrowserKind` returns `"edge"` when `/Edg\//` matches, otherwise `"chrome"`. `buildDeviceTabSnapshot` maps each `BoardLogicalGroup` to a snapshot group, trimming each tab to `{ title, url?, favIconUrl? }` and dropping `id/windowId/windowLabel/isCurrentWindow`. `groupSnapshotsByDevice` clusters by `deviceName`; `thisDevice` is the cluster whose name equals `current.name` (current browser sorted first and flagged `isCurrent`), `otherDevices` are the remaining clusters ordered by name; within a device, browsers are ordered with the current browser first then alphabetical. Validation rejects unknown `browserKind`, missing/oversized `deviceName`, or non-array `groups`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test`

Expected: all tests pass.

### Task 2: Opt-in setting + migration

**Files:**
- Modify: `supabase/migrations/` (new `009_add_sync_tab_snapshots.sql`)
- Modify: `src/shared.ts`
- Modify: `tests/shared.test.js`

- [ ] **Step 1: Write failing test**

```js
test("round-trips the tab snapshot sync flag through settings sync row", () => {
  const row = settingsSyncRow("u1", { ...DEFAULT_SETTINGS, syncTabSnapshotsEnabled: true });
  assert.equal(row.sync_tab_snapshots_enabled, true);
  const back = settingsFromSyncRow({ ...row, deferred_shortcut_minutes: [1,3,5] });
  assert.equal(back?.syncTabSnapshotsEnabled, true);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test`

- [ ] **Step 3: Implement**

Migration `009_add_sync_tab_snapshots.sql`:

```sql
alter table public.user_settings
  add column if not exists sync_tab_snapshots_enabled boolean not null default false;
```

Add `syncTabSnapshotsEnabled?: boolean` to `Settings` (default `false` in `DEFAULT_SETTINGS`), `sync_tab_snapshots_enabled` to `SettingsSyncRow`, and wire it through `settingsSyncRow`, `settingsFromSyncRow` (default `false` when absent), and the validation guard. Update the `select` column list in `syncSettings`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test`

### Task 3: Snapshot table + sync layer

**Files:**
- Modify: `supabase/migrations/` (new `010_create_device_tab_snapshots.sql`)
- Modify: `src/sync.ts`
- Modify: `tests/shared.test.js`

- [ ] **Step 1: Write failing test**

```js
test("converts device tab snapshots to and from sync rows", () => {
  const snap = { deviceId: "d1", deviceName: "Mac 设备", browserKind: "edge", groups: [], updatedAt: "t" };
  const row = deviceTabSnapshotToSyncRow("u1", snap);
  assert.equal(row.user_id, "u1");
  assert.equal(row.browser_kind, "edge");
  assert.ok(deviceTabSnapshotFromSyncRow(row, "u1"));
});
```

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement**

Migration `010_create_device_tab_snapshots.sql`:

```sql
create table if not exists public.device_tab_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  device_name text not null check (char_length(trim(device_name)) between 1 and 60),
  browser_kind text not null check (browser_kind in ('chrome','edge')),
  groups jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);
create index if not exists device_tab_snapshots_user_idx on public.device_tab_snapshots(user_id);
-- reuse public.set_updated_at() trigger
-- RLS on, policies auth.uid() = user_id for select/insert/update/delete
-- revoke from anon; grant select/insert/update/delete to authenticated
```

In `sync.ts` add (mirroring the existing `databaseRequest` pattern):

```ts
export async function fetchDeviceTabSnapshots(userId: string): Promise<DeviceTabSnapshot[]>;
export async function upsertDeviceTabSnapshot(userId: string, snapshot: DeviceTabSnapshot): Promise<void>;
```

`fetchDeviceTabSnapshots` selects all rows for the user and maps via `deviceTabSnapshotFromSyncRow`, throwing if any row is invalid. `upsertDeviceTabSnapshot` POSTs to `/device_tab_snapshots?on_conflict=user_id,device_id` with `Prefer: resolution=merge-duplicates,return=minimal`. Both are no-ops only when called; gating by `cloudSyncEnabled && syncTabSnapshotsEnabled` happens in the caller (background).

- [ ] **Step 4: Verify GREEN**

Run: `npm test`

### Task 4: Service worker — push, fetch, and scoped board messages

**Files:**
- Modify: `src/background.ts`
- Modify: `src/shared.ts` (message types only, if union lives here) / `src/background.ts` (`PopupMessage`)
- Modify: `tests/shared.test.js`

- [ ] **Step 1: Write failing contract test**

```js
test("exposes device navigation and scoped board messages", async () => {
  const bg = await readFile(new URL("../dist/background.js", import.meta.url), "utf8");
  assert.match(bg, /message\.type === "get-device-nav"/);
  assert.match(bg, /message\.type === "get-device-board"/);
  assert.match(bg, /message\.type === "set-device-name"/);
  assert.match(bg, /upsertDeviceTabSnapshot/);
});
```

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement**

In `background.ts`:

- Compute `currentBrowserKind()` once via `detectBrowserKind(navigator.userAgent)`.
- `pushDeviceTabSnapshot(state)` (debounced alongside the existing tab-event debounce): requires user; if `cloudSyncEnabled && syncTabSnapshotsEnabled`, build `boardLogicalGroups(state)`, map with `buildDeviceTabSnapshot(..., getOrCreateDeviceId(), getOrCreateDeviceName(), currentBrowserKind(), nowIso)`, and `upsertDeviceTabSnapshot`. Call it after board recomputation and on `sync-now`. Never include runtime IDs.
- `get-device-nav` → returns `{ current: { id, name, browserKind }, tree: DeviceNavTree }`. Fetches `fetchDeviceTabSnapshots` when sync is enabled (empty tree otherwise) and applies `groupSnapshotsByDevice`. Always includes the current browser as a live entry in `thisDevice` even if no snapshot row exists yet.
- `get-device-board` with `{ deviceId, browserKind }` → for the current device+browser, delegate to the live `boardState`; for any other, locate the fetched snapshot, rebuild `BoardSegmentCard[]` via `buildBoardCards` from the snapshot groups (synthesizing `tab.id = 0` and `windowId` absent), and return `{ groups, readOnly: true, deviceName, browserKind, updatedAt }`.
- `set-device-name` with `{ name }` → validate 1–60 chars, persist via a new `storage.ts` `saveDeviceName(name)`, and re-push the snapshot so the renamed device propagates.
- Add the three message types to the `PopupMessage` union and the listener branches. Errors return `{ error }`.

`nowIso`: the worker may use `new Date().toISOString()` (the workflow sandbox restriction does not apply to the extension runtime). For test determinism, pass `updatedAt` into `buildDeviceTabSnapshot` from the caller.

- [ ] **Step 4: Verify GREEN**

Run: `npm test`

### Task 5: Board navigation UI + read-only scoped grid

**Files:**
- Modify: `src/board.html`
- Modify: `src/board.ts`
- Modify: `src/board.css`
- Modify: `tests/shared.test.js`

- [ ] **Step 1: Write failing UI contract test**

```js
test("renders device navigation and switches scopes", async () => {
  const [html, script, css] = await Promise.all([/* built board files */]);
  assert.match(html, /id="device-nav"/);
  assert.match(script, /type: "get-device-nav"/);
  assert.match(script, /type: "get-device-board"/);
  assert.match(css, /\.device-nav/);
  assert.match(script, /readOnly|read-only/);
});
```

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement**

`board.html`: insert `<nav id="device-nav" class="device-nav" aria-label="设备与浏览器"></nav>` between `#new-group-form` and `#board-grid`.

`board.ts`:
- State: `currentScope: { deviceId: string; browserKind: BrowserKind; isCurrent: boolean }` (defaults to current browser), `navTree: DeviceNavTree | null`, `currentDevice: { id; name; browserKind }` (extend existing `currentDevice`).
- `renderDeviceNav()`: builds a two-section tree. "本设备" is expanded by default and lists browser buttons (current first, selected). "来自其他设备" is collapsible; clicking it expands device rows; clicking a device expands its browser buttons. Selecting any browser updates `currentScope` and reloads the grid.
- `load()`: fetch `get-device-nav` (for tree + current device) and, for the current browser, `get-board-state`; render nav then board.
- `loadRemoteBoard(deviceId, browserKind)`: call `get-device-board`, store result as a read-only `currentState`, render the grid read-only.
- Read-only mode (scope not current): add `board-content.readonly` class; disable/hide the new-group form, auto-fill, window-filter, duplicate-review, workspace save, and drag-and-drop; render a header line "只读 · <deviceName> · <browser> · 更新于 <updatedAt>" and a "返回本设备" action. Tab rows render icon+title only (no close/defer/drag); clicking a tab opens its URL in a new tab via `chrome.tabs.create` in the current browser. Search remains active and filters the snapshot client-side.
- Existing live interactions (drag, close, defer, move, new group) only run when `currentScope.isCurrent`.

`board.css`: style `.device-nav`, `.device-nav-section`, `.device-nav-device`, `.device-nav-browser` (selected state), and the read-only header/badge.

- [ ] **Step 4: Verify GREEN**

Run: `npm test`

### Task 6: Options page — device name + opt-in toggle

**Files:**
- Modify: `src/options.html`
- Modify: `src/options.ts`
- Modify: `tests/shared.test.js`

- [ ] **Step 1: Write failing contract test**

```js
test("options page exposes device name and snapshot sync toggle", async () => {
  const [html, script] = await Promise.all([/* built options files */]);
  assert.match(html, /id="device-name"/);
  assert.match(html, /id="tab-snapshots-sync"/);
  assert.match(script, /type: "set-device-name"/);
  assert.match(script, /syncTabSnapshotsEnabled/);
});
```

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement**

Add to the "同步范围" card a `tab-snapshots-sync` switch labeled "同步本设备标签到云端（跨设备/跨浏览器查看）" with a muted explanation noting titles+URLs are uploaded when enabled. Add a "设备" card with a `device-name` input (prefilled from `get-device-nav`/a `get-device-identity` message) and a save button that sends `set-device-name`. Wire `syncTabSnapshotsEnabled` into `settingsPayload()` and the render path.

- [ ] **Step 4: Verify GREEN**

Run: `npm test`

### Task 7: Documentation + full verification

**Files:**
- Modify: `AGENTS.md`
- Verify: all modified files

- [ ] **Step 1: Update `AGENTS.md`**

In "数据同步策略", add that tab snapshots (group titles/colors/board keys + tab titles/URLs/favicons) are synced per `deviceId`+`browserKind` when `syncTabSnapshotsEnabled` is opt-in; clarify the "禁止同步" list still applies to runtime IDs (`tabId`, `windowId`, `boardAssignments`) — only stable tab content is uploaded via snapshots. Note the new `device_tab_snapshots` table and migrations 007/008.

- [ ] **Step 2: Run automated verification**

Run: `npm test && npm run typecheck && git diff --check`

Expected: all pass.

- [ ] **Step 3: Manually verify in Chrome + Edge**

Load the extension in both Chrome and Edge on the same machine, sign in to the same account, enable "同步本设备标签到云端" in both. Open the board: "本设备" should list both browsers (current first); selecting the other browser shows its tabs read-only. On a second device, confirm it appears under "来自其他设备" with its browsers expandable. Verify the current browser remains fully editable, remote scopes are read-only, no runtime tab IDs are sent (inspect the Supabase row), and disabling the toggle stops uploads.

No commit is included because the user has not requested a commit.
