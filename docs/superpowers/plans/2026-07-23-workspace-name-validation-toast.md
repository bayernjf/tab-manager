# Workspace Name Validation Toast Implementation Plan

> **Status:** ✅ 已实现（v0.1.11）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show empty and duplicate workspace-name validation in an accessible toast beside the workspace name field while enforcing the same uniqueness rule in the background.

**Architecture:** Add one pure workspace-title validator to `shared.ts` and reuse it in the board and background service worker. The board performs immediate validation and owns the field-adjacent toast state; the background reloads stored workspaces and revalidates before saving so stale UI state cannot create duplicates.

**Tech Stack:** Native TypeScript, HTML, CSS, Chrome Manifest V3, Node.js built-in test runner.

**Repository constraint:** Leave all changes uncommitted. Existing unrelated working-tree changes belong to the user and must remain untouched.

---

### Task 1: Define and enforce the workspace-title rule

**Files:**
- Modify: `tests/shared.test.js:38-48,234-243,393-403`
- Modify: `src/shared.ts:369-385`
- Modify: `src/background.ts:16-24,409-417`

- [ ] **Step 1: Write the failing pure-function and background contract tests**

Import `validateWorkspaceTitle` from `dist/shared.js`, then add:

```js
test("normalizes unique workspace names and rejects empty or duplicate names", () => {
  assert.deepEqual(validateWorkspaceTitle("  Research  ", []), { status: "valid", title: "Research" });
  assert.deepEqual(validateWorkspaceTitle("   ", []), { status: "empty" });
  assert.deepEqual(validateWorkspaceTitle(" research ", ["Research"]), { status: "duplicate" });
  assert.deepEqual(validateWorkspaceTitle("Work", ["work"]), { status: "duplicate" });
  assert.deepEqual(validateWorkspaceTitle("x".repeat(81), []), { status: "invalid" });
});
```

Extend the existing background handler contract test with:

```js
assert.match(background, /validateWorkspaceTitle\(message\.title, storedWorkspaces\.map\(\(workspace\) => workspace\.title\)\)/);
assert.match(background, /请输入工作区名称/);
assert.match(background, /该工作区名称已存在/);
```

- [ ] **Step 2: Run the suite and verify the new test fails**

Run:

```bash
npm test
```

Expected: FAIL because `validateWorkspaceTitle` is not exported and the background handler does not enforce distinct empty and duplicate errors. Previously existing tests must continue to build and run.

- [ ] **Step 3: Add the pure shared validator**

Add to `src/shared.ts` before `validateWorkspaceSnapshot`:

```ts
export type WorkspaceTitleValidation =
  | { status: "valid"; title: string }
  | { status: "empty" | "duplicate" | "invalid" };

export function validateWorkspaceTitle(value: unknown, existingTitles: readonly string[]): WorkspaceTitleValidation {
  if (typeof value !== "string") return { status: "invalid" };
  const title = value.trim();
  if (!title) return { status: "empty" };
  if (title.length > 80) return { status: "invalid" };
  const key = title.toLowerCase();
  return existingTitles.some((existingTitle) => existingTitle.trim().toLowerCase() === key)
    ? { status: "duplicate" }
    : { status: "valid", title };
}
```

Replace `validateWorkspaceSnapshot` so valid workspace titles have one normalization rule:

```ts
export function validateWorkspaceSnapshot(value: unknown): WorkspaceSnapshot | null {
  if (!isPlainObject(value) || !isRecordId(value.id) || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) || !Array.isArray(value.tabs) || value.tabs.length < 1 || value.tabs.length > 200) return null;
  const title = validateWorkspaceTitle(value.title, []);
  if (title.status !== "valid") return null;
  const tabs = value.tabs.map(workspaceTab);
  return tabs.every((tab): tab is WorkspaceTab => tab !== null)
    ? { id: value.id, title: title.title, createdAt: value.createdAt, tabs }
    : null;
}
```

- [ ] **Step 4: Enforce the rule in the background save handler**

Import `validateWorkspaceTitle` in `src/background.ts`. Replace the current title construction with:

```ts
const storedWorkspaces = await loadWorkspaceSnapshots();
const title = validateWorkspaceTitle(message.title, storedWorkspaces.map((workspace) => workspace.title));
if (title.status === "empty") throw new Error("请输入工作区名称");
if (title.status === "duplicate") throw new Error("该工作区名称已存在");
if (title.status !== "valid") throw new Error("工作区名称或标签页无效");
const snapshot = validateWorkspaceSnapshot({
  id: crypto.randomUUID(),
  title: title.title,
  createdAt: new Date().toISOString(),
  tabs: message.tabs,
});
if (!snapshot) throw new Error("工作区名称或标签页无效");
await saveWorkspaceSnapshots([...storedWorkspaces, snapshot]);
```

- [ ] **Step 5: Build and verify Task 1 is green**

Run:

```bash
npm test
npm run typecheck
```

Expected: the new normalization/duplicate tests and background contract pass with no TypeScript errors.

---

### Task 2: Add the field-adjacent validation toast

**Files:**
- Modify: `tests/shared.test.js:404-421`
- Modify: `src/board.html:40-45`
- Modify: `src/board.ts:1,47-89,549`
- Modify: `src/board.css:83-88,92`

- [ ] **Step 1: Write the failing built-artifact UI contract test**

Extend `renders local workspace selection and restore-preview dialogs` with:

```js
assert.match(html, /class="workspace-name-field"/);
assert.match(html, /id="workspace-name-error"[^>]*class="workspace-name-toast"[^>]*role="alert"[^>]*hidden/);
assert.match(html, /id="workspace-name"[^>]*aria-describedby="workspace-name-error"[^>]*aria-invalid="false"/);
assert.match(script, /validateWorkspaceTitle\(workspaceName\.value, workspaces\.map\(\(workspace\) => workspace\.title\)\)/);
assert.match(script, /showWorkspaceNameError\("请输入工作区名称"\)/);
assert.match(script, /showWorkspaceNameError\("该工作区名称已存在"\)/);
assert.match(script, /workspaceName\.addEventListener\("input", clearWorkspaceNameError\)/);
assert.match(script, /workspaceDialog\.addEventListener\("close", clearWorkspaceNameError\)/);
assert.match(css, /\.workspace-name-toast/);
assert.match(css, /\.workspace-name-input-invalid/);
assert.match(css, /\.workspace-name-toast\[hidden\]/);
```

- [ ] **Step 2: Run the suite and verify the UI contract fails**

Run:

```bash
npm test
```

Expected: FAIL because the workspace name field has no adjacent alert or local validation state yet.

- [ ] **Step 3: Add accessible toast markup beside the input**

Replace the standalone workspace name input in `src/board.html` with:

```html
<div class="workspace-name-field">
  <input id="workspace-name" maxlength="80" placeholder="工作区名称" aria-describedby="workspace-name-error" aria-invalid="false">
  <p id="workspace-name-error" class="workspace-name-toast" role="alert" hidden></p>
</div>
```

- [ ] **Step 4: Add board-side validation state helpers**

Import `validateWorkspaceTitle` from `shared.js`, query `#workspace-name-error`, and add:

```ts
function clearWorkspaceNameError(): void {
  workspaceNameError.hidden = true;
  workspaceNameError.textContent = "";
  workspaceName.classList.remove("workspace-name-input-invalid");
  workspaceName.setAttribute("aria-invalid", "false");
}

function showWorkspaceNameError(message: string): void {
  workspaceNameError.textContent = message;
  workspaceNameError.hidden = false;
  workspaceName.classList.add("workspace-name-input-invalid");
  workspaceName.setAttribute("aria-invalid", "true");
  workspaceName.focus();
}
```

- [ ] **Step 5: Validate before sending and map background name errors locally**

Refactor `saveCurrentWorkspace` to validate before collecting/sending tabs:

```ts
async function saveCurrentWorkspace(): Promise<void> {
  const title = validateWorkspaceTitle(workspaceName.value, workspaces.map((workspace) => workspace.title));
  if (title.status === "empty") {
    showWorkspaceNameError("请输入工作区名称");
    return;
  }
  if (title.status === "duplicate") {
    showWorkspaceNameError("该工作区名称已存在");
    return;
  }
  if (title.status !== "valid") throw new Error("工作区名称或标签页无效");

  const tabs: WorkspaceTab[] = Array.from(workspaceTabs.querySelectorAll<HTMLInputElement>("input:checked")).map((input) => ({
    title: input.dataset.title ?? "未命名标签页",
    url: input.dataset.url ?? "",
  }));
  try {
    await send({ type: "save-workspace", title: title.title, tabs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "请输入工作区名称" || message === "该工作区名称已存在") {
      showWorkspaceNameError(message);
      return;
    }
    throw error;
  }
  workspaceName.value = "";
  clearWorkspaceNameError();
  await loadWorkspaces();
  showStatus("工作区已保存");
}
```

Register cleanup without replacing the existing global handling for unrelated errors:

```ts
workspaceName.addEventListener("input", clearWorkspaceNameError);
workspaceDialog.addEventListener("close", clearWorkspaceNameError);
```

- [ ] **Step 6: Style the toast beside the field and below it on narrow screens**

Add scoped styles in `src/board.css`:

```css
.workspace-name-field { position: relative; width: min(310px, 100%); }
.workspace-name-field input { width: 100%; }
.workspace-name-input-invalid { border-color: #c65b5b; box-shadow: 0 0 0 3px rgba(198, 91, 91, .12); }
.workspace-name-toast { position: absolute; z-index: 2; top: 50%; left: calc(100% + 10px); width: max-content; max-width: 230px; margin: 0; padding: 8px 10px; transform: translateY(-50%); border: 1px solid #efc4c4; border-radius: 8px; color: #993f3f; background: #fff5f5; box-shadow: 0 6px 18px rgba(74, 37, 37, .12); font-size: 12px; font-weight: 650; }
.workspace-name-toast::before { position: absolute; top: 50%; right: 100%; width: 8px; height: 8px; transform: translate(5px, -50%) rotate(45deg); border-bottom: 1px solid #efc4c4; border-left: 1px solid #efc4c4; background: #fff5f5; content: ""; }
.workspace-name-toast[hidden] { display: none; }
```

Extend the existing `@media (max-width: 640px)` rule with:

```css
.workspace-name-toast { position: static; width: 100%; max-width: none; margin-top: 6px; transform: none; }
.workspace-name-toast::before { display: none; }
```

- [ ] **Step 7: Build and verify Task 2 is green**

Run:

```bash
npm test
npm run typecheck
git diff --check
```

Expected: all tests pass, type checking succeeds, and no whitespace errors are reported.

---

### Task 3: Verify interaction and preserve workspace state

**Files:**
- Verify: `src/shared.ts`
- Verify: `src/background.ts`
- Verify: `src/board.html`
- Verify: `src/board.ts`
- Verify: `src/board.css`
- Verify: `tests/shared.test.js`

- [ ] **Step 1: Inspect the focused diff**

Run:

```bash
git diff -- src/shared.ts src/background.ts src/board.html src/board.ts src/board.css tests/shared.test.js
```

Expected: the new changes are limited to shared title validation, background duplicate enforcement, the nearby toast, and related tests. Preserve all unrelated pre-existing modifications in these files.

- [ ] **Step 2: Run the complete automated verification**

Run:

```bash
npm test
npm run typecheck
git diff --check
```

Expected: exit code 0 for all commands and no test failures.

- [ ] **Step 3: Verify the board interaction in a real extension context**

Reload the locally built `dist/` extension and open the board workspace dialog. Confirm:

1. Saving an empty or whitespace-only name shows `请输入工作区名称` beside the field, focuses the field, and does not add a workspace.
2. Saving `Work`, then attempting ` work `, shows `该工作区名称已存在` beside the field and does not add a second record.
3. Typing after either error clears the toast and invalid state immediately.
4. Closing with the button or Escape clears the toast for the next open.
5. A unique name is trimmed, saved once, clears the field, and retains the existing success status.
6. A non-name error still appears in the existing board-wide status region.
7. At narrow width, the toast moves below the input without covering the tab checklist.

- [ ] **Step 4: Leave the worktree uncommitted**

Do not stage, commit, push, create a PR, merge, or remove any existing uncommitted files. Report the focused file list and verification evidence to the user.
