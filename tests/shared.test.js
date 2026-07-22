import test from "node:test";
import assert from "node:assert/strict";

globalThis.chrome = { tabGroups: { TAB_GROUP_ID_NONE: -1 } };
const {
  autoRecordKey,
  findMatchingRule,
  groupRuleFromSyncRow,
  getSiteKey,
  ignoredSiteFromSyncRow,
  isIgnoredSite,
  matchesDomain,
  normalizeDomainInput,
  normalizeHostname,
  parsePortableData,
  siteTitle,
  settingsFromSyncRow,
  toPortableData,
  toPortableDataFromState,
} = await import("../dist/shared.js");

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
