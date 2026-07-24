# Deferred Shortcut Editor Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized reminder shortcut inputs with the approved compact natural-capsule editor while preserving existing settings behavior.

**Architecture:** Keep the current `Settings.deferredShortcutMinutes` model and form submission path unchanged. Build each editable shortcut through one DOM factory in `options.ts`, centralize count/limit state in one updater, and scope all new presentation rules to the shortcut card in `options.css`.

**Tech Stack:** Native TypeScript, HTML, CSS, Chrome Manifest V3, Node.js built-in test runner.

---

### Task 1: Add a failing built-artifact contract test

**Files:**
- Modify: `tests/shared.test.js:265`
- Test: `tests/shared.test.js`

- [ ] **Step 1: Write the failing test**

Add this test after the existing deferred shortcut normalization test:

```js
test("renders a compact accessible deferred shortcut editor", async () => {
  const [html, script, css] = await Promise.all([
    readFile(new URL("../dist/options.html", import.meta.url), "utf8"),
    readFile(new URL("../dist/options.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/options.css", import.meta.url), "utf8"),
  ]);

  assert.match(html, /class="card shortcut-card"/);
  assert.match(html, /id="deferred-shortcut-count"/);
  assert.match(html, /id="deferred-shortcut-note"/);
  assert.match(script, /const MAX_DEFERRED_SHORTCUTS = 5/);
  assert.match(script, /className = "deferred-shortcut"/);
  assert.match(script, /input\.ariaLabel = "快捷提醒分钟数"/);
  assert.match(script, /remove\.ariaLabel = "删除此快捷提醒时间"/);
  assert.match(script, /addDeferredShortcut\.hidden = count >= MAX_DEFERRED_SHORTCUTS/);
  assert.match(script, /input\.focus\(\)/);
  assert.match(css, /\.deferred-shortcuts \{/);
  assert.match(css, /\.deferred-shortcut:focus-within/);
  assert.match(css, /\.deferred-shortcut-remove:hover/);
});
```

- [ ] **Step 2: Run the test suite and verify the new test fails**

Run:

```bash
npm test
```

Expected: the new test fails because the approved shortcut classes, count element, and editor state functions do not exist yet; all previously existing tests continue to pass.

### Task 2: Implement the natural-capsule editor

**Files:**
- Modify: `src/options.html:53`
- Modify: `src/options.ts:5-30`
- Modify: `src/options.css:1-3`
- Test: `tests/shared.test.js`

- [ ] **Step 1: Replace the shortcut card markup**

Replace the current shortcut section inside `#settings-form` with:

```html
<section class="card shortcut-card">
  <div class="shortcut-card-header">
    <div>
      <h2>快捷提醒时间</h2>
      <p class="muted">在“稍后处理”菜单中显示这些常用时间。</p>
    </div>
    <span id="deferred-shortcut-count" class="shortcut-count" aria-live="polite">0 / 5</span>
  </div>
  <div class="shortcut-editor">
    <div id="deferred-shortcuts" class="deferred-shortcuts"></div>
    <button id="add-deferred-shortcut" class="shortcut-add" type="button">＋ 添加时间</button>
  </div>
  <p id="deferred-shortcut-note" class="shortcut-note">支持 1–10080 分钟，保存时自动去重。</p>
</section>
```

Keep the existing save button immediately after this section.

- [ ] **Step 2: Add the count element and shared limit constant**

In `src/options.ts`, add:

```ts
const MAX_DEFERRED_SHORTCUTS = 5;
```

Extend the existing DOM query declaration with:

```ts
const deferredShortcutCount = $<HTMLElement>("#deferred-shortcut-count");
```

- [ ] **Step 3: Centralize item creation and editor state**

Replace the existing `renderShortcutInputs` implementation with:

```ts
function updateShortcutEditorState(): void {
  const count = deferredShortcuts.querySelectorAll<HTMLInputElement>(".deferred-shortcut-input").length;
  deferredShortcutCount.textContent = `${count} / ${MAX_DEFERRED_SHORTCUTS}`;
  addDeferredShortcut.hidden = count >= MAX_DEFERRED_SHORTCUTS;
}

function createShortcutInput(minute: number): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "deferred-shortcut";

  const input = document.createElement("input");
  input.className = "deferred-shortcut-input";
  input.type = "number";
  input.min = "1";
  input.max = "10080";
  input.value = String(minute);
  input.ariaLabel = "快捷提醒分钟数";

  const unit = document.createElement("span");
  unit.className = "deferred-shortcut-unit";
  unit.textContent = "分钟";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "deferred-shortcut-remove";
  remove.textContent = "×";
  remove.ariaLabel = "删除此快捷提醒时间";
  remove.addEventListener("click", () => {
    row.remove();
    updateShortcutEditorState();
  });

  row.append(input, unit, remove);
  return row;
}

function renderShortcutInputs(minutes: readonly number[]): void {
  deferredShortcuts.replaceChildren(...minutes.map(createShortcutInput));
  updateShortcutEditorState();
}
```

- [ ] **Step 4: Reuse the factory for the add action**

Replace the current `addDeferredShortcut` listener with:

```ts
addDeferredShortcut.addEventListener("click", () => {
  const count = deferredShortcuts.querySelectorAll<HTMLInputElement>(".deferred-shortcut-input").length;
  if (count >= MAX_DEFERRED_SHORTCUTS) return;
  const row = createShortcutInput(10);
  deferredShortcuts.append(row);
  updateShortcutEditorState();
  const input = row.querySelector<HTMLInputElement>(".deferred-shortcut-input");
  input?.focus();
  input?.select();
});
```

The existing `settingsPayload()` selector remains valid because it reads all inputs below `#deferred-shortcuts`.

- [ ] **Step 5: Add scoped capsule styles**

Append these rules before the existing responsive media query in `src/options.css`:

```css
.shortcut-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.shortcut-card-header h2 { margin-bottom: 0; }
.shortcut-card-header .muted { margin: 5px 0 0; font-size: 13px; }
.shortcut-count { flex: 0 0 auto; padding: 4px 8px; border-radius: 999px; color: #678071; background: #f0f5f1; font-size: 11px; font-weight: 700; }
.shortcut-editor { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 20px; }
.deferred-shortcuts { display: contents; }
.deferred-shortcut { display: inline-flex; height: 42px; align-items: center; gap: 3px; padding: 0 7px 0 13px; border: 1px solid #d7e4da; border-radius: 999px; background: #fbfdfb; box-shadow: 0 2px 8px rgba(41, 74, 55, .05); transition: border-color .16s ease, box-shadow .16s ease, background .16s ease; }
.deferred-shortcut:hover { border-color: #b9d0c0; background: #fff; }
.deferred-shortcut:focus-within { border-color: #4a8b68; background: #fff; box-shadow: 0 0 0 3px rgba(74, 139, 104, .12); }
.deferred-shortcut-input { width: 34px; padding: 0; border: 0; outline: 0; color: #1f3d2e; background: transparent; font-size: 16px; font-weight: 750; text-align: right; }
.deferred-shortcut-input:focus-visible { outline: 0; }
.deferred-shortcut-unit { margin-right: 2px; color: #71837a; font-size: 12px; }
.deferred-shortcut-remove { display: grid; width: 27px; height: 27px; place-items: center; padding: 0; border-radius: 50%; color: #809087; background: transparent; font-size: 17px; line-height: 1; }
.deferred-shortcut-remove:hover, .deferred-shortcut-remove:focus-visible { outline: 0; color: #a04f4f; background: #faeeee; }
button.shortcut-add { height: 41px; margin: 0; padding: 0 14px; border: 1px dashed #b9cdbf; border-radius: 11px; color: #377255; background: #f7fbf8; font-weight: 700; }
button.shortcut-add:hover { border-color: #71a486; background: #edf7f0; }
.shortcut-note { display: flex; align-items: center; gap: 7px; margin: 14px 0 0; color: #8a9890; font-size: 11px; }
.shortcut-note::before { width: 5px; height: 5px; border-radius: 50%; background: #7aaa8d; content: ""; }
```

- [ ] **Step 6: Build and run the tests**

Run:

```bash
npm test
```

Expected: all tests pass, including `renders a compact accessible deferred shortcut editor`.

### Task 3: Verify type safety and workspace cleanliness

**Files:**
- Verify: `src/options.html`
- Verify: `src/options.ts`
- Verify: `src/options.css`
- Verify: `tests/shared.test.js`

- [ ] **Step 1: Run TypeScript validation**

Run:

```bash
npm run typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 2: Check whitespace and inspect the final diff**

Run:

```bash
git diff --check
git diff -- src/options.html src/options.ts src/options.css tests/shared.test.js
```

Expected: no whitespace errors; the diff contains only the approved shortcut editor markup, behavior, styles, and contract test in addition to the pre-existing uncommitted shortcut work.

- [ ] **Step 3: Do not commit**

Leave all changes uncommitted because the repository instructions require explicit user authorization before any commit.
