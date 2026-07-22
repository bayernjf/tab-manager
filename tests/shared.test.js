import test from "node:test";
import assert from "node:assert/strict";

globalThis.chrome = { tabGroups: { TAB_GROUP_ID_NONE: -1 } };
const {
  autoRecordKey,
  heightUnitsForTabCount,
  applyPortableImport,
  canConfirmOptionsImport,
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
  validateBoardLayout,
  settingsFromSyncRow,
  toPortableData,
  toPortableDataFromState,
  updateGroupRuleFromInput,
} = await import("../dist/shared.js");

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

test("auto-fills board cards into the leftmost shortest lane", () => {
  const placed = placeBoardCards([
    { boardKey: "auto:one.example", segmentIndex: 0, heightUnits: 2 },
    { boardKey: "auto:two.example", segmentIndex: 0, heightUnits: 2 },
    { boardKey: "auto:three.example", segmentIndex: 0, heightUnits: 1 },
    { boardKey: "auto:four.example", segmentIndex: 0, heightUnits: 1 },
    { boardKey: "auto:five.example", segmentIndex: 0, heightUnits: 1 },
  ], 3, true);

  assert.deepEqual(placed.laneHeights, [3, 2, 2]);
  assert.deepEqual(placed.placements.map((placement) => placement.lane), [0, 1, 2, 2, 0]);
});

test("validates isolated manual board layouts for each device class", () => {
  const desktop = validateBoardLayout({
    boardKey: "custom:group-1",
    deviceClass: "desktop",
    rank: 2,
    autoFill: false,
    manualLane: 1,
    manualOrder: 3,
  });
  const tablet = validateBoardLayout({
    boardKey: "custom:group-1",
    deviceClass: "tablet",
    rank: 2,
    autoFill: false,
    manualLane: 0,
    manualOrder: 1,
  });

  assert.deepEqual(desktop, {
    boardKey: "custom:group-1",
    deviceClass: "desktop",
    rank: 2,
    autoFill: false,
    manualLane: 1,
    manualOrder: 3,
  });
  assert.deepEqual(tablet, {
    boardKey: "custom:group-1",
    deviceClass: "tablet",
    rank: 2,
    autoFill: false,
    manualLane: 0,
    manualOrder: 1,
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

test("builds window-scoped keys and readable titles", () => {
  assert.equal(autoRecordKey(12, "docs.example.com"), "12:docs.example.com");
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
    [{ id: "rule-1", title: "Example", color: "blue", domains: ["example.com"], matchScope: "exact", enabled: true, sortOrder: 1, accessToken: "secret", groupId: 42, windowId: 7 }],
    [{ id: "ignore-1", domain: "ads.example.com", matchScope: "exact", sortOrder: 1, accessToken: "secret", groupId: 42, windowId: 7 }],
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
    autoGroups: {
      "7:example.com": { groupId: 42, windowId: 7, siteKey: "example.com" },
    },
    customGroups: {
      custom: { id: "custom", groupId: 99, windowId: 7, title: "Custom", color: "green" },
    },
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
    autoGroups: { "7:example.com": { groupId: 42, windowId: 7, siteKey: "example.com" } },
    customGroups: {},
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
  const rules = [{ id: "rule-1", title: "Example", color: "blue", domains: ["example.com"], matchScope: "exact", enabled: true, sortOrder: 0, groupId: 42 }];
  const exported = toPortableData({ autoGroupEnabled: true, minimumTabs: 2 }, rules, []);

  exported.groupRules[0].domains[0] = "changed.example.com";
  assert.equal(rules[0].domains[0], "example.com");
  assert.equal("groupId" in exported.groupRules[0], false);
});

test("clears durable options when their owner differs from the signed-in user", () => {
  const state = {
    settings: { autoGroupEnabled: false, minimumTabs: 6, defaultGroupColor: "purple" },
    groupRules: [{ id: "rule-a", title: "Account A", color: "blue", domains: ["a.example.com"], matchScope: "exact", enabled: true, sortOrder: 0 }],
    ignoredSites: [{ id: "ignore-a", domain: "ads.example.com", matchScope: "exact", sortOrder: 0 }],
    autoGroups: { "7:a.example.com": { groupId: 42, windowId: 7, siteKey: "a.example.com" } },
    customGroups: {},
  };

  const switched = resetOptionsForUser(state, "account-a", "account-b");
  assert.equal(switched.changed, true);
  assert.deepEqual(switched.state.groupRules, []);
  assert.deepEqual(switched.state.ignoredSites, []);
  assert.equal(switched.state.settings.minimumTabs, 2);
  assert.deepEqual(switched.state.autoGroups, state.autoGroups);
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
