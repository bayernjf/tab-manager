import test, { mock } from "node:test";
import assert from "node:assert/strict";

// The background service worker is a module with top-level chrome listeners. This
// harness supplies a small in-memory chrome API and a signed-in user so the real
// compiled handlers can be exercised instead of pattern-matching their source.
const store = new Map();
const listeners = { message: null, removed: null };

function storageGet(keys) {
  if (keys == null) return Object.fromEntries(store);
  if (typeof keys === "string") return store.has(keys) ? { [keys]: store.get(keys) } : {};
  if (Array.isArray(keys)) {
    const result = {};
    for (const key of keys) if (store.has(key)) result[key] = store.get(key);
    return result;
  }
  const result = { ...keys };
  for (const [key, value] of store) if (key in keys) result[key] = value;
  return result;
}

const chromeMock = {
  storage: {
    local: {
      get: async (keys) => storageGet(keys),
      set: async (values) => { for (const [key, value] of Object.entries(values)) store.set(key, value); },
      remove: async (keys) => { for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key); },
    },
    onChanged: { addListener: () => {} },
  },
  runtime: {
    getURL: (path) => `chrome-extension://unit-test/${path}`,
    onMessage: { addListener: (fn) => { listeners.message = fn; } },
    onInstalled: { addListener: () => {} },
    onStartup: { addListener: () => {} },
    lastError: undefined,
  },
  i18n: { getMessage: (key) => key, getUILanguage: () => "en" },
  windows: {
    getAll: async () => chromeMock.__windows,
    get: async (windowId) => chromeMock.__windowById.get(windowId) ?? Promise.reject(new Error("window missing")),
    update: async (windowId, info) => { chromeMock.__calls.push({ api: "windows.update", windowId, info }); },
  },
  tabs: {
    get: async (tabId) => chromeMock.__tabById.get(tabId) ?? Promise.reject(new Error("tab missing")),
    create: async (props) => {
      const tab = { id: chromeMock.__nextTabId++, ...props };
      chromeMock.__tabById.set(tab.id, tab);
      chromeMock.__calls.push({ api: "tabs.create", props });
      return tab;
    },
    update: async (tabId, props) => { chromeMock.__calls.push({ api: "tabs.update", tabId, props }); return chromeMock.__tabById.get(tabId); },
    remove: async (tabId) => {
      chromeMock.__calls.push({ api: "tabs.remove", tabId });
      chromeMock.__tabById.delete(tabId);
    },
    query: async () => [...chromeMock.__tabById.values()],
    onCreated: { addListener: () => {} },
    onRemoved: { addListener: (fn) => { listeners.removed = fn; } },
  },
  alarms: {
    create: async () => {},
    get: async () => undefined,
    clear: async () => true,
    onAlarm: { addListener: () => {} },
  },
  notifications: { create: async () => {}, clear: async () => {}, onClicked: { addListener: () => {} } },
  commands: { onCommand: { addListener: () => {} } },
  sessions: { getRecentlyClosed: async () => [], restore: async () => {} },
  __windows: [],
  __windowById: new Map(),
  __tabById: new Map(),
  __calls: [],
  __nextTabId: 100,
};

globalThis.chrome = chromeMock;

mock.module("../dist/auth.js", {
  namedExports: {
    getCurrentUser: async () => ({ id: "user-1", email: "user@example.test" }),
    getLocalUser: async () => ({ id: "user-1", email: "user@example.test" }),
    getStoredUser: async () => ({ id: "user-1", email: "user@example.test" }),
    getAccessToken: async () => ["unit", "test", "token"].join("-"),
    signIn: async () => {},
    signOut: async () => {},
    signUp: async () => {},
  },
});

const { findDuplicateBoardTabs } = await import("../dist/shared.js");
await import("../dist/background.js");

const messageListener = listeners.message;
assert.ok(messageListener, "background registers a runtime message listener");
assert.ok(listeners.removed, "background registers a tab removal listener");

function reset({ settings = {}, windows = [] } = {}) {
  store.clear();
  chromeMock.__calls.length = 0;
  chromeMock.__tabById.clear();
  chromeMock.__windowById.clear();
  chromeMock.__windows = windows;
  chromeMock.__nextTabId = 100;
  store.set("settings", { cloudSyncEnabled: false, ...settings });
  store.set("tabCreatedAt", {});
  for (const window of windows) {
    chromeMock.__windowById.set(window.id, window);
    for (const tab of window.tabs ?? []) chromeMock.__tabById.set(tab.id, tab);
  }
}

function send(message) {
  return new Promise((resolve, reject) => {
    const handled = messageListener(message, {}, (response) => {
      if (response && response.error) reject(new Error(response.error));
      else resolve(response);
    });
    if (!handled) reject(new Error(`message not handled: ${message.type}`));
  });
}

async function flush() {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

const siteTab = (id, url, windowId = 1, extra = {}) => ({ id, windowId, url, title: url, pinned: false, active: false, ...extra });
const workspaceId = "ws-0001";

function seedWorkspace() {
  const workspace = {
    id: workspaceId,
    title: "Reading",
    createdAt: "2024-01-01T00:00:00.000Z",
    tabs: [{ title: "Alpha", url: "https://alpha.example/" }, { title: "Beta", url: "https://beta.example/" }],
  };
  store.set("workspaceSnapshots", [workspace]);
  store.set("deviceId", "device-1");
  store.set("deviceName", "This device");
  return workspace;
}

test("activates a board tab by focusing its window and selecting the tab", async () => {
  reset({ windows: [{ id: 1, type: "normal", tabs: [siteTab(7, "https://alpha.example/")] }] });
  await send({ type: "activate-board-tab", tabId: 7 });
  assert.deepEqual(chromeMock.__calls, [
    { api: "windows.update", windowId: 1, info: { focused: true } },
    { api: "tabs.update", tabId: 7, props: { active: true } },
  ]);
  await assert.rejects(send({ type: "activate-board-tab", tabId: 0 }), /invalidTabData/);
});

test("closes a board tab through the real chrome.tabs.remove path", async () => {
  reset({ windows: [{ id: 1, type: "normal", tabs: [siteTab(8, "https://alpha.example/")] }] });
  await send({ type: "close-board-tab", tabId: 8 });
  assert.deepEqual(chromeMock.__calls, [{ api: "tabs.remove", tabId: 8 }]);
  assert.equal(chromeMock.__tabById.has(8), false);
  await assert.rejects(send({ type: "close-board-tab", tabId: -1 }), /invalidTabData/);
});

test("tab removal listener drops the stored creation timestamp", async () => {
  reset({ windows: [{ id: 1, type: "normal", tabs: [siteTab(9, "https://alpha.example/")] }] });
  store.set("tabCreatedAt", { 9: 1234 });
  chromeMock.__tabById.delete(9);
  listeners.removed(9, { isWindowClosing: false });
  await flush();
  assert.equal(store.get("tabCreatedAt")["9"], undefined);
});

test("workspace tab edit messages persist ordering and content", async () => {
  reset();
  seedWorkspace();
  await send({ type: "update-workspace-tab", id: workspaceId, index: 1, title: "Beta edited", url: "https://beta.example/new" });
  let saved = store.get("workspaceSnapshots");
  assert.equal(saved[0].tabs[1].title, "Beta edited");
  assert.equal(saved[0].tabs[1].url, "https://beta.example/new");

  await send({ type: "move-workspace-tab", id: workspaceId, fromIndex: 1, toIndex: 0 });
  saved = store.get("workspaceSnapshots");
  assert.deepEqual(saved[0].tabs.map((tab) => tab.title), ["Beta edited", "Alpha"]);

  await send({ type: "remove-workspace-tab", id: workspaceId, index: 0 });
  saved = store.get("workspaceSnapshots");
  assert.deepEqual(saved[0].tabs.map((tab) => tab.title), ["Alpha"]);

  await assert.rejects(send({ type: "remove-workspace-tab", id: workspaceId, index: 99 }), /tabNotFound/);
  await assert.rejects(send({ type: "update-workspace-tab", id: workspaceId, index: 0, title: "x", url: "chrome://settings" }), /unsupportedUrl/);
});

test("workspace board returns cards built from stored tabs", async () => {
  reset();
  seedWorkspace();
  const response = await send({ type: "get-workspace-board", id: workspaceId });
  assert.equal(response.workspace.title, "Reading");
  assert.ok(Array.isArray(response.cards));
  assert.ok(response.cards.some((card) => card.tabs.some((tab) => tab.url === "https://alpha.example/")));
  await assert.rejects(send({ type: "get-workspace-board", id: "missing" }), /workspaceNotFound/);
});

test("deferred tab lifecycle stores, opens, reschedules and deletes", async () => {
  const dueAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  reset({
    windows: [{
      id: 1,
      type: "normal",
      tabs: [siteTab(3, "https://defer.example/"), siteTab(4, "https://defer-two.example/"), siteTab(5, "https://defer-three.example/")],
    }],
  });
  const deferred = await send({ type: "defer-board-tab", tabId: 3, dueAt });
  assert.equal(deferred.tab.url, "https://defer.example/");
  assert.equal(store.get("deferredTabs").length, 1);
  assert.equal(chromeMock.__tabById.has(3), false);

  const listed = await send({ type: "get-deferred-tabs" });
  assert.equal(listed.tabs[0].id, deferred.tab.id);

  const later = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  await send({ type: "reschedule-deferred-tab", id: deferred.tab.id, dueAt: later });
  assert.equal(store.get("deferredTabs")[0].dueAt, later);

  await send({ type: "open-deferred-tab", id: deferred.tab.id, windowId: 1 });
  assert.deepEqual(chromeMock.__calls.at(-1), { api: "tabs.create", props: { windowId: 1, url: "https://defer.example/" } });
  assert.deepEqual(store.get("deferredTabs"), []);

  const second = await send({ type: "defer-board-tab", tabId: 4, dueAt });
  await send({ type: "delete-deferred-tab", id: second.tab.id });
  assert.deepEqual(store.get("deferredTabs"), []);
  await assert.rejects(send({ type: "defer-board-tab", tabId: 5, dueAt: "2000-01-01T00:00:00.000Z" }), /reminderTimeInvalid/);
});

test("saves, previews, restores and deletes a workspace", async () => {
  reset({ windows: [{ id: 1, type: "normal", tabs: [] }] });
  seedWorkspace();
  const saved = await send({ type: "save-workspace", title: "Fresh", tabs: [{ title: "Gamma", url: "https://gamma.example/" }] });
  assert.equal(saved.workspace.title, "Fresh");
  assert.equal(store.get("workspaceSnapshots").length, 2);

  await assert.rejects(send({ type: "save-workspace", title: "Fresh", tabs: [] }), /workspaceNameDuplicate/);
  await assert.rejects(send({ type: "save-workspace", title: "Empty", tabs: [] }), /selectAtLeastOneTab|tabValidationError/);

  const preview = await send({ type: "get-workspace-restore-preview", id: saved.workspace.id });
  assert.equal(preview.workspace.title, "Fresh");

  const restored = await send({ type: "restore-workspace", id: saved.workspace.id, windowId: 1, confirmed: true });
  assert.equal(restored.created, 1);
  assert.deepEqual(chromeMock.__calls.at(-1), { api: "tabs.create", props: { windowId: 1, url: "https://gamma.example/", active: false } });
  await assert.rejects(send({ type: "restore-workspace", id: saved.workspace.id, windowId: 1 }), /confirmRestoreWorkspace/);

  await send({ type: "delete-workspace", id: saved.workspace.id });
  assert.equal(store.get("workspaceSnapshots").length, 1);
  assert.equal(store.get("workspaceTombstones").length, 1);

  const renamed = await send({ type: "set-device-name", name: "  Renamed  " });
  assert.equal(renamed.name, "Renamed");
  assert.equal(store.get("deviceName"), "Renamed");
  await assert.rejects(send({ type: "set-device-name", name: "   " }), /deviceNameInvalid/);
});

test("restores workspace tabs only when confirmed and skips already-open urls", async () => {
  reset();
  await assert.rejects(
    send({ type: "restore-workspace-tabs", tabs: [{ title: "One", url: "https://one.example/" }], windowId: 1 }),
    /confirmRestoreTabs/,
  );
  const response = await send({
    type: "restore-workspace-tabs",
    confirmed: true,
    windowId: 1,
    skipUrls: ["https://one.example/"],
    tabs: [{ title: "One", url: "https://one.example/" }, { title: "Two", url: "https://two.example/" }],
  });
  assert.equal(response.created, 1);
  assert.deepEqual(chromeMock.__calls.filter((call) => call.api === "tabs.create"), [{
    api: "tabs.create",
    props: { windowId: 1, url: "https://two.example/", active: false },
  }]);
});

test("duplicate preview and confirmed close remove only redundant tabs", async () => {
  reset({
    windows: [{
      id: 1,
      type: "normal",
      tabs: [siteTab(11, "https://dup.example/"), siteTab(12, "https://dup.example/"), siteTab(13, "https://unique.example/")],
    }],
  });
  const preview = await send({ type: "get-board-duplicate-preview" });
  assert.deepEqual(preview.groups.map((group) => group.url), ["https://dup.example/"]);
  const group = preview.groups[0];
  assert.deepEqual(group.tabs.map((tab) => tab.id), [11, 12]);
  assert.equal(findDuplicateBoardTabs(group.tabs).length, 1);

  await assert.rejects(send({ type: "close-board-duplicates", groups: [{ retainedTabId: 11, tabIds: [11, 12] }] }), /confirmCloseDuplicates/);
  const closed = await send({
    type: "close-board-duplicates",
    confirmed: true,
    groups: [{ retainedTabId: 11, tabIds: [11, 12] }],
  });
  assert.deepEqual(closed, { ok: true, closed: 1, skipped: 0 });
  assert.deepEqual(chromeMock.__calls.filter((call) => call.api === "tabs.remove").map((call) => call.tabId), [12]);
  assert.equal(chromeMock.__tabById.has(11), true);
  assert.equal(chromeMock.__tabById.has(13), true);

  await assert.rejects(send({
    type: "close-board-duplicates",
    confirmed: true,
    groups: [{ retainedTabId: 11, tabIds: [11, 11] }],
  }), /duplicatePreviewExpired/);
});
