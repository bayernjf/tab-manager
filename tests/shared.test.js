import test from "node:test";
import assert from "node:assert/strict";

globalThis.chrome = {};
const {
  automaticBoardKey,
  boardDropIndex,
  boardCustomGroupFromSyncRow,
  boardLayoutFromSyncRow,
  buildBoardCards,
  heightUnitsForTabCount,
  applyPortableImport,
  canConfirmOptionsImport,
  customBoardKey,
  findMatchingRule,
  groupRuleFromSyncRow,
  getSiteKey,
  ignoredSiteFromSyncRow,
  isIgnoredSite,
  matchesDomain,
  normalizeDomainInput,
  normalizeHostname,
  parsePortableData,
  previewPortableImport,
  resolveAutoGroup,
  resetOptionsForUser,
  resolveCloudCollection,
  syncFailureStatus,
  siteTitle,
  segmentTabs,
  placeBoardCards,
  boardCardsForDevice,
  manualBoardGridRow,
  moveManualBoardCard,
  moveBoardGroupRank,
  validateBoardTabDrop,
  validateBoardLayout,
  settingsFromSyncRow,
  toPortableData,
  toPortableDataFromState,
  updateGroupRuleFromInput,
  buildVirtualBoardGroups,
  moveVirtualBoardAssignment,
} = await import("../dist/shared.js");
const { getCurrentUser, isExplicitAuthenticationFailure } = await import("../dist/auth.js");

test("builds board cards from ten-tab segments and retains an empty custom card", () => {
  const tabs = Array.from({ length: 11 }, (_value, index) => ({ id: index + 1, title: `Tab ${index + 1}` }));
  const cards = buildBoardCards([
    { boardKey: "custom:7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573", kind: "custom", title: "Empty", color: "purple", rank: 0, tabs: [] },
    { boardKey: "auto:example.com", kind: "automatic", title: "Example", color: "blue", rank: 1, tabs },
  ]);

  assert.deepEqual(cards.map((card) => [card.boardKey, card.segmentIndex, card.segmentCount, card.tabs.length, card.heightUnits]), [
    ["custom:7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573", 0, 1, 0, 1],
    ["auto:example.com", 0, 2, 10, 2],
    ["auto:example.com", 1, 2, 1, 1],
  ]);
});

test("moves a logical board group to a new rank without moving Ungrouped", () => {
  const groups = [
    { boardKey: "ungrouped", kind: "ungrouped", title: "Ungrouped", color: "grey", rank: 0 },
    { boardKey: "auto:one.example", kind: "automatic", title: "One", color: "blue", rank: 1 },
    { boardKey: "auto:two.example", kind: "automatic", title: "Two", color: "green", rank: 2 },
  ];

  assert.deepEqual(moveBoardGroupRank(groups, "auto:two.example", 1).map((group) => [group.boardKey, group.rank]), [
    ["ungrouped", 0],
    ["auto:two.example", 1],
    ["auto:one.example", 2],
  ]);
  assert.equal(moveBoardGroupRank(groups, "ungrouped", 2), null);
});

test("rejects invalid board tab drops before Chrome state changes", () => {
  assert.equal(validateBoardTabDrop({ tabId: 1, targetBoardKey: "custom:not-a-uuid" }), null);
  assert.equal(validateBoardTabDrop({ tabId: -1, targetBoardKey: "ungrouped" }), null);
  assert.equal(validateBoardTabDrop({ tabId: 1, targetBoardKey: "ungrouped" }), null);
  assert.equal(validateBoardTabDrop({ tabId: 1, targetBoardKey: "ungrouped", position: "before" }), null);
  assert.equal(validateBoardTabDrop({ tabId: 1, targetBoardKey: "ungrouped", position: "after", targetTabId: 1 }), null);
  assert.deepEqual(validateBoardTabDrop({ tabId: 1, targetBoardKey: "ungrouped", position: "before", targetTabId: 2 }), {
    tabId: 1, targetBoardKey: "ungrouped", position: "before", targetTabId: 2,
  });
  assert.deepEqual(validateBoardTabDrop({ tabId: 1, targetBoardKey: "ungrouped", position: "append" }), {
    tabId: 1, targetBoardKey: "ungrouped", position: "append",
  });
});

test("computes final tab-strip indices for before and after board drops", () => {
  assert.equal(boardDropIndex(0, 1, "after"), 1);
  assert.equal(boardDropIndex(2, 1, "after"), 2);
  assert.equal(boardDropIndex(0, 1, "before"), 0);
  assert.equal(boardDropIndex(2, 1, "before"), 1);
  assert.equal(boardDropIndex(-1, 1, "before"), null);
});

test("moves and clears local virtual board assignments without browser group ids", () => {
  const customKey = "custom:7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573";
  const automaticKey = "auto:other.example";
  const moved = moveVirtualBoardAssignment({}, 7, 12, customKey);
  assert.deepEqual(moved, { "7:12": { windowId: 7, tabId: 12, boardKey: customKey, order: 0 } });

  const reassigned = moveVirtualBoardAssignment(moved, 7, 12, automaticKey, 3);
  assert.deepEqual(reassigned["7:12"], { windowId: 7, tabId: 12, boardKey: automaticKey, order: 3 });
  assert.deepEqual(moveVirtualBoardAssignment(reassigned, 7, 12, "ungrouped"), {});
});

test("builds virtual automatic groups by site while custom assignments take precedence", () => {
  const customId = "7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573";
  const groups = buildVirtualBoardGroups({
    windowId: 7,
    tabs: [
      { id: 1, title: "One", url: "https://www.example.com/a" },
      { id: 2, title: "Two", url: "https://example.com/b" },
      { id: 3, title: "Three", url: "https://example.com/c" },
    ],
    settings: { autoGroupEnabled: true, minimumTabs: 2, defaultGroupColor: "blue" },
    rules: [],
    ignoredSites: [],
    customGroups: [{ id: customId, title: "Research", color: "purple", sortOrder: 0 }],
    assignments: { "7:1": { windowId: 7, tabId: 1, boardKey: `custom:${customId}`, order: 0 } },
  });

  assert.deepEqual(groups.map((group) => [group.boardKey, group.tabs.map((tab) => tab.id)]), [
    ["ungrouped", []],
    [`custom:${customId}`, [1]],
    ["auto:example.com", [2, 3]],
  ]);
});

test("treats only explicit authentication responses as session-invalidating", () => {
  assert.equal(isExplicitAuthenticationFailure({ status: 401 }), true);
  assert.equal(isExplicitAuthenticationFailure({ status: 403 }), true);
  assert.equal(isExplicitAuthenticationFailure({ status: 500 }), false);
  assert.equal(isExplicitAuthenticationFailure(new TypeError("Failed to fetch")), false);
});

test("keeps the cached user through a transient auth network failure but clears an explicit rejection", async () => {
  const values = {
    supabaseSession: {
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "user-1", email: "user@example.com" },
    },
  };
  globalThis.chrome.storage = {
    local: {
      get: async (key) => key in values ? { [key]: values[key] } : {},
      set: async (next) => Object.assign(values, next),
      remove: async (key) => { delete values[key]; },
    },
  };
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    assert.deepEqual(await getCurrentUser(), values.supabaseSession.user);
    assert.ok(values.supabaseSession);

    globalThis.fetch = async () => new Response(JSON.stringify({ message: "JWT expired" }), { status: 401 });
    assert.equal(await getCurrentUser(), null);
    assert.equal(values.supabaseSession, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("accepts only board keys that satisfy the database key contract", () => {
  assert.equal(automaticBoardKey("WWW.Example.com."), "auto:example.com");
  assert.equal(automaticBoardKey("localhost"), null);
  assert.equal(customBoardKey("7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573"), "custom:7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573");
  assert.equal(customBoardKey("7C5E0DF8-D6B4-4B10-A820-2D1D1EF9B573"), null);
});

test("converts durable board custom groups from Supabase rows", () => {
  assert.deepEqual(boardCustomGroupFromSyncRow({
    id: "7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573",
    user_id: "user-1",
    title: "Research",
    color: "purple",
    sort_order: 3,
  }, "user-1"), {
    id: "7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573",
    title: "Research",
    color: "purple",
    sortOrder: 3,
  });
});

test("converts an automatic board layout using a stable site key", () => {
  assert.deepEqual(boardLayoutFromSyncRow({
    user_id: "user-1",
    board_key: "auto:example.com",
    device_class: "desktop",
    rank: 2,
    auto_fill: true,
    manual_lane: null,
    manual_order: null,
  }, "user-1"), {
    boardKey: "auto:example.com",
    deviceClass: "desktop",
    rank: 2,
    autoFill: true,
  });
});

test("rejects invalid board device classes and cross-user rows", () => {
  const layout = {
    user_id: "other-user",
    board_key: "auto:example.com",
    device_class: "desktop",
    rank: 0,
    auto_fill: true,
    manual_lane: null,
    manual_order: null,
  };
  const customGroup = { id: "7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573", user_id: "other-user", title: "Research", color: "blue", sort_order: 0 };

  assert.equal(boardLayoutFromSyncRow({ ...layout, user_id: "user-1", device_class: "watch" }, "user-1"), null);
  assert.equal(boardLayoutFromSyncRow(layout, "user-1"), null);
  assert.equal(boardCustomGroupFromSyncRow(customGroup, "user-1"), null);
});

test("rejects board custom groups without UUIDs and noncanonical automatic site keys", () => {
  const customGroup = {
    id: "group-1",
    user_id: "user-1",
    title: "Research",
    color: "blue",
    sort_order: 0,
  };
  const layout = {
    user_id: "user-1",
    board_key: "auto:www.example.com",
    device_class: "desktop",
    rank: 0,
    auto_fill: true,
    manual_lane: null,
    manual_order: null,
  };

  assert.equal(boardCustomGroupFromSyncRow(customGroup, "user-1"), null);
  assert.equal(boardLayoutFromSyncRow(layout, "user-1"), null);
});

test("maps board tab counts to five-row height units", () => {
  for (const tabCount of [0, 1, 2, 3, 4, 5]) {
    assert.equal(heightUnitsForTabCount(tabCount), 1);
  }
  for (const tabCount of [6, 7, 8, 9, 10]) {
    assert.equal(heightUnitsForTabCount(tabCount), 2);
  }
});

test("splits board tabs into ten-tab segments", () => {
  const tabs = Array.from({ length: 11 }, (_value, index) => `tab-${index + 1}`);

  assert.deepEqual(segmentTabs(tabs), [tabs.slice(0, 10), tabs.slice(10)]);
});

test("auto-fills complete multi-segment groups as topmost leftmost rectangles", () => {
  const placed = placeBoardCards([
    { boardKey: "auto:one.example", segmentIndex: 0, heightUnits: 2, rank: 1 },
    { boardKey: "auto:one.example", segmentIndex: 1, heightUnits: 1, rank: 1 },
    { boardKey: "auto:two.example", segmentIndex: 0, heightUnits: 1, rank: 2 },
    { boardKey: "auto:three.example", segmentIndex: 0, heightUnits: 1, rank: 3 },
  ], 3, true);

  assert.deepEqual(placed.placements.map((placement) => [placement.boardKey, placement.segmentIndex, placement.lane, placement.slot, placement.compositeHeight]), [
    ["auto:one.example", 0, 0, 0, 2],
    ["auto:one.example", 1, 1, 0, 2],
    ["auto:two.example", 0, 2, 0, 1],
    ["auto:three.example", 0, 2, 1, 1],
  ]);
});

test("reserves the short segment's lower cell in a twenty-one-tab composite", () => {
  const placed = placeBoardCards([
    { boardKey: "auto:a.example", segmentIndex: 0, heightUnits: 2, rank: 1 },
    { boardKey: "auto:a.example", segmentIndex: 1, heightUnits: 2, rank: 1 },
    { boardKey: "auto:a.example", segmentIndex: 2, heightUnits: 1, rank: 1 },
    { boardKey: "auto:b.example", segmentIndex: 0, heightUnits: 1, rank: 2 },
  ], 3, true);

  assert.deepEqual(placed.placements.map((placement) => [placement.boardKey, placement.segmentIndex, placement.lane, placement.slot]), [
    ["auto:a.example", 0, 0, 0],
    ["auto:a.example", 1, 1, 0],
    ["auto:a.example", 2, 2, 0],
    ["auto:b.example", 0, 0, 2],
  ]);
});

test("keeps manual card lane and order for device-specific rendering", () => {
  const placed = placeBoardCards([
    { boardKey: "auto:one.example", segmentIndex: 0, heightUnits: 1, manualLane: 1, manualOrder: 2 },
    { boardKey: "auto:two.example", segmentIndex: 0, heightUnits: 1, manualLane: 0, manualOrder: 1 },
    { boardKey: "auto:three.example", segmentIndex: 0, heightUnits: 2, manualLane: 1, manualOrder: 0 },
  ], 2, false);

  assert.deepEqual(placed.placements.map((placement) => [placement.boardKey, placement.lane, placement.order]), [
    ["auto:one.example", 1, 2],
    ["auto:two.example", 0, 1],
    ["auto:three.example", 1, 0],
  ]);
});

test("keeps an empty manual grid slot when card heights change", () => {
  const placed = placeBoardCards([
    { boardKey: "auto:one.example", segmentIndex: 0, heightUnits: 2, manualLane: 0, manualSlot: 0 },
    { boardKey: "auto:two.example", segmentIndex: 0, heightUnits: 1, manualLane: 0, manualSlot: 3 },
  ], 2, false);

  assert.deepEqual(placed.placements.map((placement) => [placement.boardKey, placement.lane, placement.slot]), [
    ["auto:one.example", 0, 0],
    ["auto:two.example", 0, 3],
  ]);
});

test("spans a fixed manual grid unit for each five-tab card height", () => {
  assert.deepEqual(manualBoardGridRow({ slot: 3, heightUnits: 2 }), { start: 4, span: 2 });
  assert.deepEqual(manualBoardGridRow({ slot: 3, heightUnits: 1 }), { start: 4, span: 1 });
});

test("shifts manual cards by a dragged two-unit span without grid overlap", () => {
  const moved = moveManualBoardCard([
    { boardKey: "auto:source.example", segmentIndex: 0, heightUnits: 2, lane: 0, order: 0, slot: 0 },
    { boardKey: "auto:target.example", segmentIndex: 0, heightUnits: 1, lane: 0, order: 2, slot: 2 },
    { boardKey: "auto:after.example", segmentIndex: 0, heightUnits: 1, lane: 0, order: 3, slot: 3 },
  ], "auto:source.example", "auto:target.example");

  assert.deepEqual(moved?.map((placement) => [placement.boardKey, placement.lane, placement.slot, placement.heightUnits]), [
    ["auto:source.example", 0, 2, 2],
    ["auto:target.example", 0, 4, 1],
    ["auto:after.example", 0, 5, 1],
  ]);
  const intervals = moved?.map((placement) => [placement.slot, placement.slot + placement.heightUnits]).sort((left, right) => left[0] - right[0]);
  assert.ok(intervals?.every((interval, index) => index === 0 || intervals[index - 1][1] <= interval[0]));
});

test("selects manual board slots only from the active device layout", () => {
  const cards = [{ boardKey: "auto:example.com", segmentIndex: 0, heightUnits: 1 }];
  const layouts = [
    { boardKey: "auto:example.com", deviceClass: "desktop", rank: 0, autoFill: false, manualLane: 2, manualSlot: 4 },
    { boardKey: "auto:example.com", deviceClass: "tablet", rank: 0, autoFill: false, manualLane: 1, manualSlot: 1 },
  ];

  assert.deepEqual(boardCardsForDevice(cards, layouts, "desktop"), [{
    boardKey: "auto:example.com", segmentIndex: 0, heightUnits: 1, manualLane: 2, manualSlot: 4,
  }]);
  assert.deepEqual(boardCardsForDevice(cards, layouts, "tablet"), [{
    boardKey: "auto:example.com", segmentIndex: 0, heightUnits: 1, manualLane: 1, manualSlot: 1,
  }]);
});

test("keeps eleven-tab segments in one horizontal manual composite", () => {
  const cards = buildBoardCards([{
    boardKey: "auto:example.com", kind: "automatic", title: "Example", color: "blue", rank: 0,
    tabs: Array.from({ length: 11 }, (_value, index) => ({ id: index + 1, title: `Tab ${index + 1}` })),
  }]);
  const positioned = boardCardsForDevice(cards, [{
    boardKey: "auto:example.com", deviceClass: "desktop", rank: 0, autoFill: false, manualLane: 1, manualSlot: 3,
  }], "desktop");

  const placed = placeBoardCards(positioned, 3, false);
  assert.deepEqual(placed.placements.map((placement) => [placement.segmentIndex, placement.lane, placement.slot, placement.compositeHeight]), [
    [0, 1, 3, 2],
    [1, 2, 3, 2],
  ]);
});

test("moves every segment of a composite together in manual layout", () => {
  const moved = moveManualBoardCard([
    { boardKey: "auto:a.example", segmentIndex: 0, heightUnits: 2, lane: 0, order: 0, slot: 0, compositeHeight: 2 },
    { boardKey: "auto:a.example", segmentIndex: 1, heightUnits: 1, lane: 1, order: 0, slot: 0, compositeHeight: 2 },
    { boardKey: "auto:b.example", segmentIndex: 0, heightUnits: 1, lane: 2, order: 0, slot: 0, compositeHeight: 1 },
  ], "auto:a.example", "auto:b.example", 4);

  assert.deepEqual(moved?.filter((placement) => placement.boardKey === "auto:a.example").map((placement) => [placement.lane, placement.slot]), [
    [2, 0], [3, 0],
  ]);
});

test("clamps a two-wide manual composite dropped on the last of three lanes", () => {
  const moved = moveManualBoardCard([
    { boardKey: "auto:a.example", segmentIndex: 0, heightUnits: 2, lane: 0, order: 0, slot: 0, compositeWidth: 2, compositeHeight: 2 },
    { boardKey: "auto:a.example", segmentIndex: 1, heightUnits: 1, lane: 1, order: 0, slot: 0, compositeWidth: 2, compositeHeight: 2 },
    { boardKey: "auto:b.example", segmentIndex: 0, heightUnits: 1, lane: 2, order: 0, slot: 0, compositeWidth: 1, compositeHeight: 1 },
  ], "auto:a.example", "auto:b.example", 3);

  assert.deepEqual(moved?.filter((placement) => placement.boardKey === "auto:a.example").map((placement) => placement.lane), [1, 2]);
});

test("keeps eleven- and twenty-one-tab composites horizontal at every board width", () => {
  for (const laneCount of [3, 2, 1]) {
    const eleven = placeBoardCards([
      { boardKey: "auto:eleven.example", segmentIndex: 0, heightUnits: 2, rank: 1 },
      { boardKey: "auto:eleven.example", segmentIndex: 1, heightUnits: 1, rank: 1 },
    ], laneCount, true).placements;
    const twentyOne = placeBoardCards([
      { boardKey: "auto:twenty-one.example", segmentIndex: 0, heightUnits: 2, rank: 1 },
      { boardKey: "auto:twenty-one.example", segmentIndex: 1, heightUnits: 2, rank: 1 },
      { boardKey: "auto:twenty-one.example", segmentIndex: 2, heightUnits: 1, rank: 1 },
    ], laneCount, true).placements;

    assert.deepEqual(eleven.map((placement) => [placement.lane, placement.slot]), [[0, 0], [1, 0]]);
    assert.deepEqual(twentyOne.map((placement) => [placement.lane, placement.slot]), [[0, 0], [1, 0], [2, 0]]);
  }
});

test("validates isolated manual board layouts for each device class", () => {
  const desktop = validateBoardLayout({
    boardKey: "custom:7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573",
    deviceClass: "desktop",
    rank: 2,
    autoFill: false,
    manualLane: 1,
    manualSlot: 3,
  });
  const tablet = validateBoardLayout({
    boardKey: "custom:7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573",
    deviceClass: "tablet",
    rank: 2,
    autoFill: false,
    manualLane: 0,
    manualSlot: 1,
  });

  assert.deepEqual(desktop, {
    boardKey: "custom:7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573",
    deviceClass: "desktop",
    rank: 2,
    autoFill: false,
    manualLane: 1,
    manualSlot: 3,
  });
  assert.deepEqual(tablet, {
    boardKey: "custom:7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573",
    deviceClass: "tablet",
    rank: 2,
    autoFill: false,
    manualLane: 0,
    manualSlot: 1,
  });
  assert.notDeepEqual(desktop, tablet);
  assert.equal(validateBoardLayout({ ...desktop, deviceClass: "watch" }), null);
  assert.equal(validateBoardLayout({ ...desktop, manualLane: -1 }), null);
  assert.deepEqual(validateBoardLayout({
    boardKey: "auto:docs.example",
    deviceClass: "mobile",
    rank: 4,
    autoFill: true,
  }), {
    boardKey: "auto:docs.example",
    deviceClass: "mobile",
    rank: 4,
    autoFill: true,
  });
  assert.equal(validateBoardLayout({
    boardKey: "auto:docs.example",
    deviceClass: "mobile",
    rank: 4,
    autoFill: true,
    manualLane: 0,
    manualOrder: 0,
  }), null);
});

test("marks cloud restore failures as retryable without exposing error details", () => {
  assert.deepEqual(syncFailureStatus(new Error("Bearer top-secret-token failed")), {
    state: "error",
    message: "云端同步暂时不可用，请稍后重试。",
  });
});

test("converts complete Supabase settings rows to concrete local settings", () => {
  assert.deepEqual(settingsFromSyncRow({
    user_id: "user-1",
    auto_group_enabled: false,
    minimum_tabs: 4,
    default_group_color: "purple",
    cloud_sync_enabled: false,
    sync_rules_enabled: true,
    sync_ignore_list_enabled: false,
  }), {
    autoGroupEnabled: false,
    minimumTabs: 4,
    defaultGroupColor: "purple",
    cloudSyncEnabled: false,
    syncRulesEnabled: true,
    syncIgnoreListEnabled: false,
  });
});

test("rejects malformed Supabase group-rule colors and match scopes", () => {
  const row = {
    id: "rule-1",
    user_id: "user-1",
    title: "Example",
    color: "blue",
    domains: ["example.com"],
    match_scope: "exact",
    enabled: true,
    sort_order: 0,
  };

  assert.equal(groupRuleFromSyncRow({ ...row, color: "teal" }), null);
  assert.equal(groupRuleFromSyncRow({ ...row, match_scope: "everywhere" }), null);
  assert.equal(ignoredSiteFromSyncRow({
    id: "site-1",
    user_id: "user-1",
    domain: "example.com",
    match_scope: "everywhere",
    sort_order: 0,
  }), null);
});

test("preserves an existing rule sort order when editing the UI DTO", () => {
  const existing = {
    id: "rule-1",
    title: "Before",
    color: "blue",
    domains: ["example.com"],
    matchScope: "exact",
    enabled: true,
    sortOrder: 7,
  };

  assert.deepEqual(updateGroupRuleFromInput({
    id: "rule-1",
    title: "After",
    color: "green",
    domains: ["docs.example.com"],
    matchScope: "domain-and-subdomains",
    enabled: false,
  }, existing), {
    ...existing,
    title: "After",
    color: "green",
    domains: ["docs.example.com"],
    matchScope: "domain-and-subdomains",
    enabled: false,
  });
});

test("uses existing cloud category data instead of stale local data", () => {
  const local = [{ id: "local", title: "Stale", color: "blue", domains: ["local.example.com"], matchScope: "exact", enabled: true, sortOrder: 0 }];
  const remote = [{ id: "remote", title: "Current", color: "green", domains: ["remote.example.com"], matchScope: "exact", enabled: true, sortOrder: 0 }];

  assert.deepEqual(resolveCloudCollection(local, remote), {
    local: remote,
    initializeRemote: false,
  });
});

test("initializes an absent cloud category from local data without clearing local data", () => {
  const local = [{ id: "local", domain: "local.example.com", matchScope: "exact", sortOrder: 0 }];

  assert.deepEqual(resolveCloudCollection(local, []), {
    local,
    initializeRemote: true,
  });
});

test("rejects Supabase rows returned for a different user", () => {
  const settingsRow = {
    user_id: "other-user",
    auto_group_enabled: true,
    minimum_tabs: 2,
    default_group_color: "blue",
    cloud_sync_enabled: true,
    sync_rules_enabled: true,
    sync_ignore_list_enabled: true,
  };
  const groupRuleRow = {
    id: "rule-1",
    user_id: "other-user",
    title: "Example",
    color: "blue",
    domains: ["example.com"],
    match_scope: "exact",
    enabled: true,
    sort_order: 0,
  };
  const ignoredSiteRow = {
    id: "site-1",
    user_id: "other-user",
    domain: "example.com",
    match_scope: "exact",
    sort_order: 0,
  };

  assert.equal(settingsFromSyncRow(settingsRow, "expected-user"), null);
  assert.equal(groupRuleFromSyncRow(groupRuleRow, "expected-user"), null);
  assert.equal(ignoredSiteFromSyncRow(ignoredSiteRow, "expected-user"), null);
});

test("normalizes hostnames and strips www", () => {
  assert.equal(normalizeHostname("WWW.Example.COM."), "example.com");
});

test("classifies only web URLs", () => {
  assert.equal(getSiteKey("https://www.Example.com/a?q=1"), "example.com");
  assert.equal(getSiteKey("http://docs.example.com/b"), "docs.example.com");
  assert.equal(getSiteKey("chrome://settings"), null);
  assert.equal(getSiteKey("not a url"), null);
});

test("builds readable site titles", () => {
  assert.equal(siteTitle("github.com"), "Github");
});

test("normalizes domain inputs from hostnames and web URLs", () => {
  assert.equal(normalizeDomainInput("WWW.Example.COM."), "example.com");
  assert.equal(normalizeDomainInput("https://www.example.com/path?q=1"), "example.com");
  assert.equal(normalizeDomainInput("chrome://settings"), null);
  assert.equal(normalizeDomainInput("not a domain"), null);
});

test("matches exact and domain-and-subdomains scopes", () => {
  assert.equal(matchesDomain("docs.example.com", "example.com", "exact"), false);
  assert.equal(matchesDomain("docs.example.com", "example.com", "domain-and-subdomains"), true);
  assert.equal(matchesDomain("notexample.com", "example.com", "domain-and-subdomains"), false);
});

test("selects an exact rule before an earlier subdomain rule", () => {
  const rules = [
    {
      id: "subdomain-rule",
      title: "Example sites",
      color: "blue",
      domains: ["example.com"],
      matchScope: "domain-and-subdomains",
      enabled: true,
      sortOrder: 0,
    },
    {
      id: "exact-rule",
      title: "Documentation",
      color: "green",
      domains: ["docs.example.com"],
      matchScope: "exact",
      enabled: true,
      sortOrder: 99,
    },
  ];

  assert.equal(findMatchingRule("docs.example.com", rules)?.id, "exact-rule");
});

test("an ignored site wins over an otherwise matching rule", () => {
  const ignoredSites = [{ id: "ignore-docs", domain: "docs.example.com", matchScope: "exact", sortOrder: 0 }];
  const rules = [{
    id: "docs-rule",
    title: "Documentation",
    color: "blue",
    domains: ["docs.example.com"],
    matchScope: "exact",
    enabled: true,
    sortOrder: 0,
  }];

  assert.equal(isIgnoredSite("docs.example.com", ignoredSites), true);
  assert.equal(isIgnoredSite("docs.example.com", ignoredSites) ? undefined : findMatchingRule("docs.example.com", rules), undefined);
});

test("resolves ignored sites before matching rules", () => {
  const settings = { autoGroupEnabled: true, minimumTabs: 2, defaultGroupColor: "purple" };
  const rules = [{ id: "docs-rule", title: "Documentation", color: "blue", domains: ["docs.example.com"], matchScope: "exact", enabled: true, sortOrder: 0 }];
  const ignoredSites = [{ id: "ignore-docs", domain: "docs.example.com", matchScope: "exact", sortOrder: 0 }];

  assert.deepEqual(resolveAutoGroup("docs.example.com", settings, rules, ignoredSites), { kind: "ignore" });
});

test("resolves a matching rule's title and color", () => {
  const settings = { autoGroupEnabled: true, minimumTabs: 2, defaultGroupColor: "purple" };
  const rules = [{ id: "docs-rule", title: "Documentation", color: "green", domains: ["example.com"], matchScope: "domain-and-subdomains", enabled: true, sortOrder: 0 }];

  assert.deepEqual(resolveAutoGroup("docs.example.com", settings, rules, []), {
    kind: "group",
    siteKey: "docs.example.com",
    title: "Documentation",
    color: "green",
  });
});

test("resolves unmatched sites with the default title and color", () => {
  const settings = { autoGroupEnabled: true, minimumTabs: 2, defaultGroupColor: "purple" };

  assert.deepEqual(resolveAutoGroup("github.com", settings, [], []), {
    kind: "group",
    siteKey: "github.com",
    title: "Github",
    color: "purple",
  });
});

test("parses only valid portable data and rejects sensitive unknown keys", () => {
  const valid = {
    version: 1,
    settings: {
      autoGroupEnabled: true,
      minimumTabs: 2,
      defaultGroupColor: "blue",
      cloudSyncEnabled: true,
      syncRulesEnabled: true,
      syncIgnoreListEnabled: true,
      lastSuccessfulSyncAt: null,
    },
    groupRules: [{
      id: "rule-1",
      title: "Example",
      color: "blue",
      domains: ["example.com"],
      matchScope: "domain-and-subdomains",
      enabled: true,
      sortOrder: 0,
    }],
    ignoredSites: [{ id: "ignore-1", domain: "ads.example.com", matchScope: "exact", sortOrder: 0 }],
  };

  assert.deepEqual(parsePortableData(valid), valid);
  assert.equal(parsePortableData({ ...valid, settings: { ...valid.settings, minimumTabs: 0 } }), null);
  assert.equal(parsePortableData({ ...valid, accessToken: "secret" }), null);
  assert.equal(parsePortableData({ ...valid, groupRules: [{ ...valid.groupRules[0], color: "teal" }] }), null);
  assert.equal(parsePortableData({ ...valid, groupRules: [{ ...valid.groupRules[0], domains: ["example.com", "example.com"] }] }), null);
});

test("rejects portable data whose required fields are inherited", () => {
  const valid = {
    version: 1,
    settings: {
      autoGroupEnabled: true,
      minimumTabs: 2,
      defaultGroupColor: "blue",
      cloudSyncEnabled: true,
      syncRulesEnabled: true,
      syncIgnoreListEnabled: true,
      lastSuccessfulSyncAt: null,
    },
    groupRules: [],
    ignoredSites: [],
  };

  assert.equal(parsePortableData(Object.create(valid)), null);
});

test("maps portable data explicitly without runtime-only fields", () => {
  const portable = toPortableData(
    {
      autoGroupEnabled: false,
      minimumTabs: 3,
      defaultGroupColor: "purple",
      cloudSyncEnabled: false,
      syncRulesEnabled: true,
      syncIgnoreListEnabled: false,
      lastSuccessfulSyncAt: "2026-07-22T00:00:00.000Z",
    },
    [{ id: "rule-1", title: "Example", color: "blue", domains: ["example.com"], matchScope: "exact", enabled: true, sortOrder: 1, accessToken: "secret" }],
    [{ id: "ignore-1", domain: "ads.example.com", matchScope: "exact", sortOrder: 1, accessToken: "secret" }],
  );

  assert.deepEqual(portable, {
    version: 1,
    settings: {
      autoGroupEnabled: false,
      minimumTabs: 3,
      defaultGroupColor: "purple",
      cloudSyncEnabled: false,
      syncRulesEnabled: true,
      syncIgnoreListEnabled: false,
      lastSuccessfulSyncAt: "2026-07-22T00:00:00.000Z",
    },
    groupRules: [{ id: "rule-1", title: "Example", color: "blue", domains: ["example.com"], matchScope: "exact", enabled: true, sortOrder: 1 }],
    ignoredSites: [{ id: "ignore-1", domain: "ads.example.com", matchScope: "exact", sortOrder: 1 }],
  });
});

test("converts stored state without runtime group mappings", () => {
  const portable = toPortableDataFromState({
    settings: {
      autoGroupEnabled: true,
      minimumTabs: 2,
    },
    groupRules: [{
      id: "rule-1",
      title: "Example",
      color: "blue",
      domains: ["example.com"],
      matchScope: "exact",
      enabled: true,
      sortOrder: 0,
    }],
    ignoredSites: [{ id: "ignore-1", domain: "ads.example.com", matchScope: "exact", sortOrder: 0 }],
    boardAssignments: { "7:12": { windowId: 7, tabId: 12, boardKey: "auto:example.com", order: 0 } },
  });

  assert.deepEqual(portable, {
    version: 1,
    settings: {
      autoGroupEnabled: true,
      minimumTabs: 2,
      defaultGroupColor: "blue",
      cloudSyncEnabled: true,
      syncRulesEnabled: true,
      syncIgnoreListEnabled: true,
      lastSuccessfulSyncAt: null,
    },
    groupRules: [{
      id: "rule-1",
      title: "Example",
      color: "blue",
      domains: ["example.com"],
      matchScope: "exact",
      enabled: true,
      sortOrder: 0,
    }],
    ignoredSites: [{ id: "ignore-1", domain: "ads.example.com", matchScope: "exact", sortOrder: 0 }],
  });
});

test("keeps stored state unchanged for invalid or unconfirmed imports", () => {
  const state = {
    settings: { autoGroupEnabled: true, minimumTabs: 2 },
    groupRules: [],
    ignoredSites: [],
    boardAssignments: { "7:12": { windowId: 7, tabId: 12, boardKey: "auto:example.com", order: 0 } },
  };
  const before = structuredClone(state);
  const valid = {
    version: 1,
    settings: {
      autoGroupEnabled: false,
      minimumTabs: 4,
      defaultGroupColor: "purple",
      cloudSyncEnabled: true,
      syncRulesEnabled: true,
      syncIgnoreListEnabled: true,
      lastSuccessfulSyncAt: null,
    },
    groupRules: [],
    ignoredSites: [],
  };

  assert.equal(previewPortableImport({ ...valid, settings: { ...valid.settings, minimumTabs: 0 } }), null);
  const preview = previewPortableImport(valid);
  assert.ok(preview);
  assert.ok(previewPortableImport(JSON.stringify(valid)));
  assert.equal(applyPortableImport(state, preview, false), state);
  assert.deepEqual(state, before);
});

test("exports a detached portable snapshot without runtime fields", () => {
  const rules = [{ id: "rule-1", title: "Example", color: "blue", domains: ["example.com"], matchScope: "exact", enabled: true, sortOrder: 0, accessToken: "secret" }];
  const exported = toPortableData({ autoGroupEnabled: true, minimumTabs: 2 }, rules, []);

  exported.groupRules[0].domains[0] = "changed.example.com";
  assert.equal(rules[0].domains[0], "example.com");
  assert.equal("accessToken" in exported.groupRules[0], false);
});

test("clears durable options when their owner differs from the signed-in user", () => {
  const state = {
    settings: { autoGroupEnabled: false, minimumTabs: 6, defaultGroupColor: "purple" },
    groupRules: [{ id: "rule-a", title: "Account A", color: "blue", domains: ["a.example.com"], matchScope: "exact", enabled: true, sortOrder: 0 }],
    ignoredSites: [{ id: "ignore-a", domain: "ads.example.com", matchScope: "exact", sortOrder: 0 }],
    boardAssignments: { "7:12": { windowId: 7, tabId: 12, boardKey: "auto:a.example.com", order: 0 } },
  };

  const switched = resetOptionsForUser(state, "account-a", "account-b");
  assert.equal(switched.changed, true);
  assert.deepEqual(switched.state.groupRules, []);
  assert.deepEqual(switched.state.ignoredSites, []);
  assert.equal(switched.state.settings.minimumTabs, 2);
  assert.deepEqual(switched.state.boardAssignments, state.boardAssignments);
  assert.equal(resetOptionsForUser(state, "account-a", "account-a").changed, false);
});

test("prepares persisted options for the authenticated account before reading them", async () => {
  const values = {
    optionsUserId: "account-a",
    settings: { autoGroupEnabled: false, minimumTabs: 6, defaultGroupColor: "purple" },
    groupRules: [{ id: "rule-a", title: "Account A", color: "blue", domains: ["a.example.com"], matchScope: "exact", enabled: true, sortOrder: 0 }],
    ignoredSites: [{ id: "ignore-a", domain: "ads.example.com", matchScope: "exact", sortOrder: 0 }],
  };
  globalThis.chrome.storage = {
    local: {
      get: async (keys) => {
        const requested = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(requested.flatMap((key) => key in values ? [[key, values[key]]] : []));
      },
      set: async (next) => Object.assign(values, next),
    },
  };
  const { prepareOptionsForUser } = await import("../dist/storage.js");

  const prepared = await prepareOptionsForUser("account-b");

  assert.deepEqual(prepared.groupRules, []);
  assert.deepEqual(prepared.ignoredSites, []);
  assert.equal(values.optionsUserId, "account-b");
});

test("only confirms an import preview for its original signed-in user", () => {
  assert.equal(canConfirmOptionsImport("account-a", "account-a"), true);
  assert.equal(canConfirmOptionsImport("account-a", "account-b"), false);
  assert.equal(canConfirmOptionsImport("account-a", null), false);
});
