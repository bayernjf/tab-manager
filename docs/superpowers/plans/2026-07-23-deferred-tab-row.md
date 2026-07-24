# Deferred Reminder Tab Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render deferred reminders as compact, single-line tab rows and consume each reminder after it is successfully restored.

**Architecture:** Keep reminder storage local and make the background own the ordered restore operation: create the browser tab first, then remove the reminder. The board refreshes the list and statistics after the background reports success; built-artifact regression contracts cover the ordering and refresh behavior.

**Tech Stack:** TypeScript, DOM APIs, CSS, Node.js test runner, Chrome Manifest V3

---

## File Structure

- `tests/shared.test.js`: verifies the built board renderer and styles contain the compact tab-row contract.
- `src/board.ts`: renders favicon, title, due status, and actions in a single reminder row.
- `src/board.css`: aligns reminder rows visually with existing board tab rows and keeps actions visible.
- `src/background.ts`: removes a reminder only after its saved URL has been opened successfully.

### Task 1: Add the compact reminder-row regression contract

**Files:**
- Modify: `tests/shared.test.js:296-310`

- [ ] **Step 1: Extend the existing reminder rendering test**

Add these assertions to `renders every scheduled reminder with clear status and actions`:

```js
assert.match(script, /deferred-icon/);
assert.match(script, /tab\.favIconUrl/);
assert.match(script, /github-tab-icon/);
assert.match(css, /\.deferred-row \{[^}]*min-height: 40px/);
assert.match(css, /\.deferred-title \{[^}]*flex: 1/);
assert.match(css, /\.deferred-actions \{[^}]*flex: 0 0 auto/);
assert.doesNotMatch(css, /\.deferred-actions \{[^}]*(?:opacity: 0|display: none|visibility: hidden)/);
```

- [ ] **Step 2: Run the test suite and verify the contract fails**

Run: `npm test`

Expected: FAIL in `renders every scheduled reminder with clear status and actions` because `deferred-icon` and the compact 40-pixel row are absent.

### Task 2: Render reminders as single-line tab rows

**Files:**
- Modify: `src/board.ts:187-216`

- [ ] **Step 1: Add the saved favicon before the title**

In `renderDeferredRow`, create the image after the row:

```ts
const icon = document.createElement("img");
icon.className = "tab-icon deferred-icon";
icon.alt = "";
icon.src = tab.favIconUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
icon.classList.toggle("github-tab-icon", getSiteKey(tab.url) === "github.com");
```

- [ ] **Step 2: Flatten the title and status into the row**

Remove the `deferred-info` wrapper. Keep `deferred-title`, `deferred-status`, and `deferred-actions`, then append in this order:

```ts
row.append(icon, title, reminderStatus, actions);
```

The existing open and delete listeners remain unchanged.

### Task 3: Apply compact tab-row styling

**Files:**
- Modify: `src/board.css:82-88`

- [ ] **Step 1: Replace the reminder layout rules**

Use the following layout values while retaining the existing colors for due state and actions:

```css
.deferred-reminders { margin: 0 0 12px; padding: 12px; border: 1px solid #ead9a8; border-radius: 12px; background: #fffaf0; }
.deferred-reminders h2 { margin: 0 4px 8px; }
.deferred-row { display: flex; min-height: 40px; align-items: center; gap: 9px; padding: 4px 8px; border-top: 1px solid #edf0ec; background: #fff; font-size: 12px; }
.deferred-row:first-child { border-top: 0; border-radius: 8px 8px 0 0; }
.deferred-row:last-child { border-radius: 0 0 8px 8px; }
.deferred-icon { width: 16px; height: 16px; flex: 0 0 16px; }
.deferred-title { min-width: 0; flex: 1; overflow: hidden; color: #33493d; font-size: 12px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.deferred-status { flex: 0 0 auto; padding: 0; border-radius: 0; background: transparent; font-size: 11px; font-weight: 650; white-space: nowrap; }
.deferred-actions { display: flex; flex: 0 0 auto; gap: 6px; }
.deferred-action { min-width: 52px; min-height: 28px; padding: 5px 10px; border: 1px solid transparent; border-radius: 7px; font-size: 11px; font-weight: 750; line-height: 1; }
```

- [ ] **Step 2: Remove the mobile two-line override**

Delete the `.deferred-row` column layout, full-width `.deferred-actions`, and flexible `.deferred-action` declarations from the `max-width: 640px` media query so reminders remain a single line.

### Task 4: Consume a reminder after successful restoration

**Files:**
- Modify: `tests/shared.test.js:300-320`
- Modify: `src/background.ts:456-459`
- Modify: `src/board.ts:204-212`

- [ ] **Step 1: Write the failing restore-consumption contract**

Add this test to `tests/shared.test.js`:

```js
test("consumes a deferred reminder only after it opens successfully", async () => {
  const [background, board] = await Promise.all([
    readFile(new URL("../dist/background.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.js", import.meta.url), "utf8"),
  ]);
  const openHandlerStart = background.indexOf('if (message.type === "open-deferred-tab")');
  const openHandlerEnd = background.indexOf('if (message.type === "reschedule-deferred-tab")', openHandlerStart);
  const openHandler = background.slice(openHandlerStart, openHandlerEnd);

  assert.ok(openHandlerStart >= 0 && openHandlerEnd > openHandlerStart);
  assert.match(openHandler, /await chrome\.tabs\.create/);
  assert.match(openHandler, /await saveDeferredTabs/);
  assert.ok(openHandler.indexOf("await chrome.tabs.create") < openHandler.indexOf("await saveDeferredTabs"));
  assert.match(openHandler, /deferredTabs\.filter\(\(item\) => item\.id !== message\.id\)/);
  assert.match(board, /type: "open-deferred-tab"[\s\S]*Promise\.all\(\[renderDeferredTabs\(\), renderBoardStatistics\(\)\]\)/);
});
```

- [ ] **Step 2: Run the suite and verify the contract fails**

Run: `npm test`

Expected: FAIL because the open handler does not call `saveDeferredTabs` and the board does not refresh after opening.

- [ ] **Step 3: Make the background create first and remove second**

Replace the `open-deferred-tab` handler body with:

```ts
if (message.type === "open-deferred-tab") {
  await requireBoardUser();
  if (!safeRecordId(message.id) || typeof message.windowId !== "number" || !Number.isInteger(message.windowId)) throw new Error("提醒不存在");
  const deferredTabs = await loadDeferredTabs();
  const tab = deferredTabs.find((item) => item.id === message.id);
  const window = await chrome.windows.get(message.windowId);
  if (!tab || window.type !== "normal") throw new Error("提醒不存在");
  await chrome.tabs.create({ windowId: message.windowId, url: tab.url });
  await saveDeferredTabs(deferredTabs.filter((item) => item.id !== message.id));
  return { ok: true };
}
```

- [ ] **Step 4: Refresh the board after a successful open**

Append the refresh after the existing open request in `renderDeferredRow`:

```ts
await send({ type: "open-deferred-tab", id: tab.id, windowId: current?.windowId });
await Promise.all([renderDeferredTabs(), renderBoardStatistics()]);
```

- [ ] **Step 5: Run the suite and verify the contract passes**

Run: `npm test`

Expected: all tests pass, including `consumes a deferred reminder only after it opens successfully`.

### Task 5: Verify the implementation

**Files:**
- Verify: `tests/shared.test.js`
- Verify: `src/board.ts`
- Verify: `src/board.css`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all tests pass, including the compact reminder-row contract.

- [ ] **Step 2: Run strict TypeScript checking**

Run: `npm run typecheck`

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Check whitespace**

Run: `git diff --check`

Expected: exit code 0 with no output.

- [ ] **Step 4: Produce the local extension build**

Run: `npm run build`

Expected: exit code 0 and refreshed output in `dist/`.

No commit, push, or pull request is included because project policy requires explicit user authorization for Git delivery actions.
