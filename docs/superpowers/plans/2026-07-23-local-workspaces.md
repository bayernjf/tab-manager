# Local Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save selected board tabs as local named workspaces and restore them into the board window only after a preview and explicit confirmation.

**Architecture:** Define serializable workspace and preview types plus validation in `src/shared.ts`. Keep snapshots in a dedicated `chrome.storage.local` key, separate from synced settings; the MV3 worker owns creation and restoration, while the board renders selection, saved records, and the confirmation preview.

**Tech Stack:** Native TypeScript, Chrome MV3 tabs/storage APIs, HTML dialog, CSS, Node.js test runner.

---

### Task 1: Define and validate local workspace records

**Files:**
- Modify: `src/shared.ts`
- Modify: `tests/shared.test.js`

- [ ] **Step 1: Write failing tests**

```js
test("validates local workspace snapshots without unsupported URLs", () => {
  const snapshot = validateWorkspaceSnapshot({
    id: "workspace-1", title: "Research", createdAt: "2026-07-23T00:00:00.000Z",
    tabs: [{ title: "Docs", url: "https://example.com/docs" }, { title: "Internal", url: "chrome://newtab/" }],
  });

  assert.equal(snapshot, null);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test`

Expected: FAIL because workspace validation is missing.

- [ ] **Step 3: Implement the smallest pure API**

```ts
export interface WorkspaceTab { title: string; url: string; }
export interface WorkspaceSnapshot { id: string; title: string; createdAt: string; tabs: WorkspaceTab[]; }
export function validateWorkspaceSnapshot(value: unknown): WorkspaceSnapshot | null;
export function workspaceRestorePreview(snapshot: WorkspaceSnapshot): { tabs: WorkspaceTab[]; unavailableCount: number };
```

Accept 1–200 HTTP(S) pages with nonempty title/URL values, preserve order, and reject malformed or unsupported records. Restore preview must re-check URL protocol so old or corrupt local data cannot open an internal URL.

- [ ] **Step 4: Verify GREEN**

Run: `npm test`

Expected: all tests pass.

### Task 2: Persist and restore snapshots through the service worker

**Files:**
- Modify: `src/storage.ts`
- Modify: `src/background.ts`
- Modify: `tests/shared.test.js`

- [ ] **Step 1: Write the failing worker contract test**

```js
test("builds local workspace save, preview, restore, and delete handlers", async () => {
  const background = await readFile(new URL("../dist/background.js", import.meta.url), "utf8");
  assert.match(background, /message\.type === "save-workspace"/);
  assert.match(background, /message\.type === "get-workspace-restore-preview"/);
  assert.match(background, /message\.type === "restore-workspace"/);
  assert.match(background, /message\.confirmed !== true/);
  assert.match(background, /chrome\.tabs\.create/);
  assert.match(background, /message\.type === "delete-workspace"/);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test`

Expected: FAIL because no workspace messages exist.

- [ ] **Step 3: Implement local-only storage and messages**

```ts
export async function loadWorkspaceSnapshots(): Promise<WorkspaceSnapshot[]>;
export async function saveWorkspaceSnapshots(workspaces: readonly WorkspaceSnapshot[]): Promise<void>;
```

Add `get-workspaces`, `save-workspace`, `get-workspace-restore-preview`, `restore-workspace`, and `delete-workspace` messages. Every operation requires a signed-in user; save validates an input title and selected `{title,url}` entries and adds a UUID/timestamp. Restore requires explicit confirmation and a valid normal `windowId`, revalidates the snapshot, and creates only preview-eligible tabs with `active: false`. It returns created and unavailable counts without closing or moving existing tabs. Do not add snapshots to `StoredState`, sync payloads, migrations, or Supabase calls.

- [ ] **Step 4: Verify GREEN**

Run: `npm test`

Expected: all tests pass.

### Task 3: Add board workspace selection and restore preview

**Files:**
- Modify: `src/board.html`
- Modify: `src/board.ts`
- Modify: `src/board.css`
- Modify: `tests/shared.test.js`

- [ ] **Step 1: Write the failing UI contract test**

```js
test("renders local workspace selection and restore-preview dialogs", async () => {
  const [html, script, css] = await Promise.all([/* built board files */]);
  assert.match(html, /id="open-workspaces"/);
  assert.match(html, /id="workspace-dialog"/);
  assert.match(html, /id="workspace-restore-dialog"/);
  assert.match(script, /type: "save-workspace"/);
  assert.match(script, /type: "get-workspace-restore-preview"/);
  assert.match(script, /type: "restore-workspace"/);
  assert.match(css, /\.workspace-dialog/);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test`

Expected: FAIL because the board has no workspace UI.

- [ ] **Step 3: Implement the smallest reviewable UI**

Add an `工作区` action in the board header. Its dialog includes a name field, a checkbox list of all currently visible eligible board tabs with source-window labels, a `保存选中标签` action, and existing local workspace records. Each record offers restore and delete. Restore fetches a preview dialog that lists pages to open, reports unavailable items, and has an explicit `确认打开 N 个标签` button. Refresh the workspace list after save/delete/restore and show results through the existing status region. Render all user-controlled data with DOM APIs and `textContent`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test`

Expected: all tests pass.

### Task 4: Verify the workspace feature

**Files:**
- Verify: `src/shared.ts`
- Verify: `src/storage.ts`
- Verify: `src/background.ts`
- Verify: `src/board.html`
- Verify: `src/board.ts`
- Verify: `src/board.css`

- [ ] **Step 1: Run automated verification**

Run: `npm test && npm run typecheck && git diff --check`

Expected: all commands pass.

- [ ] **Step 2: Manually verify in Chrome**

Reload the extension, open eligible pages in more than one normal window, save a workspace from selected rows, reopen the dialog to verify the saved record, request restore and inspect its page list, then confirm. Verify pages open in the board window and no existing tab closes. Delete the record and verify it disappears; confirm that no Supabase request or synced data contains the snapshot.

No commit is included because the user has not requested a commit.
