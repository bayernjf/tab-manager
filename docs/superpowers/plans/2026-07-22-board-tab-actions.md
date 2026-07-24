# Board Tab Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a board tab activate its source browser tab on click and close that source tab from a hover- or focus-revealed left-side button.

**Architecture:** Keep Chrome tab mutations in the MV3 service worker and keep the board page as a message-driven view. Render separate open and close controls so keyboard focus has native button semantics and closing cannot activate the tab.

**Tech Stack:** Native TypeScript, Chrome MV3 `tabs` and `windows` APIs, HTML DOM APIs, CSS, Node.js test runner.

---

### Task 1: Cover service-worker tab action messages

**Files:**
- Modify: `tests/shared.test.js`
- Modify: `src/background.ts`

- [x] **Step 1: Write the failing test**

```js
test("builds board tab activation and close message handlers", async () => {
  const background = await readFile(new URL("../dist/background.js", import.meta.url), "utf8");
  assert.match(background, /type: "activate-board-tab"/);
  assert.match(background, /chrome\.windows\.update\(tab\.windowId, \{ focused: true \}\)/);
  assert.match(background, /chrome\.tabs\.update\(message\.tabId, \{ active: true \}\)/);
  assert.match(background, /type: "close-board-tab"/);
  assert.match(background, /chrome\.tabs\.remove\(message\.tabId\)/);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: the new test fails because neither message type exists.

- [x] **Step 3: Write minimal implementation**

Extend `PopupMessage` with two `tabId: unknown` messages. Validate each value as a positive integer. For activation, read the tab, focus its window when present, then set that tab active. For closure, remove the requested tab. Return `{ ok: true }` after each completed Chrome operation.

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test`

Expected: all Node tests pass.

### Task 2: Render accessible board tab controls and hover/focus affordance

**Files:**
- Modify: `tests/shared.test.js`
- Modify: `src/board.ts`
- Modify: `src/board.css`

- [x] **Step 1: Write the failing test**

```js
test("renders board tab open and close controls with focus-revealed close styling", async () => {
  const [boardScript, boardCss] = await Promise.all([
    readFile(new URL("../dist/board.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.css", import.meta.url), "utf8"),
  ]);
  assert.match(boardScript, /"tab-open"/);
  assert.match(boardScript, /"tab-close"/);
  assert.match(boardScript, /type: "activate-board-tab", tabId/);
  assert.match(boardScript, /type: "close-board-tab", tabId/);
  assert.match(boardCss, /\.tab-row:hover \.tab-close/);
  assert.match(boardCss, /\.tab-row:focus-within \.tab-close/);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: the new test fails because the existing row is a single draggable `div` with no action controls.

- [x] **Step 3: Write minimal implementation**

Render a `button.tab-open` containing the favicon and title, plus a sibling `button.tab-close` whose accessible name names the tab. Wire each button to its matching background message. Stop the close click from propagating and mark its drag start as prevented. Hide the close control by opacity until `.tab-row:hover` or `.tab-row:focus-within`, while retaining an obvious `:focus-visible` outline.

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test`

Expected: all Node tests pass with the new interaction contract present in built files.

### Task 3: Verify the complete change

**Files:**
- Verify: `src/background.ts`
- Verify: `src/board.ts`
- Verify: `src/board.css`

- [x] **Step 1: Run static and test checks**

Run: `npm run typecheck && npm test && git diff --check`

Expected: all three commands complete successfully with no TypeScript, test, or whitespace errors.

- [ ] **Step 2: Perform manual browser verification**

Reload the unpacked extension, open the board, hover a tab row and verify the left-side × appears, click the title and verify the source browser tab becomes active, click × and verify only that source tab closes, then use Tab and Enter to verify equivalent keyboard behavior.

This step requires a browser with the unpacked extension loaded and was not run because the available browser session had no tabs or extension state.

No commit is included because the user has not requested a commit.
