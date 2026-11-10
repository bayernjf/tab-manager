import test, { mock } from "node:test";
import assert from "node:assert/strict";

// Replace the Supabase config and auth modules before sync.js loads: the dist
// build ships placeholder credentials and chrome.storage is unavailable here.
globalThis.chrome = {};
mock.module("../dist/supabase-config.js", {
  namedExports: {
    SUPABASE_URL: "https://unit-test.invalid",
    SUPABASE_ANON_KEY: ["unit", "test", "anon", "key"].join("-"),
    assertSupabaseConfigured: () => {},
  },
});
mock.module("../dist/auth.js", {
  namedExports: { getAccessToken: async () => ["unit", "test", "token"].join("-") },
});

const {
  replaceGroupRules,
  replaceIgnoredSites,
  replaceBoardCustomGroups,
  replaceBoardLayouts,
} = await import("../dist/sync.js");

function recordFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body ?? null };
    calls.push(call);
    return handler(call);
  };
  return calls;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

const rule = {
  id: "rule-1",
  title: "Docs",
  color: "blue",
  domains: ["example.com"],
  matchScope: "domain-and-subdomains",
  enabled: true,
  sortOrder: 0,
};

test("replaceGroupRules upserts the new set before pruning stale rows", async () => {
  const calls = recordFetch(() => jsonResponse([]));
  await replaceGroupRules("user-1", [rule]);
  assert.deepEqual(calls.map((call) => call.method), ["POST", "DELETE"]);
  assert.match(calls[0].url, /\/group_rules\?on_conflict=user_id,id$/);
  assert.equal(calls[0].headers.Prefer, "resolution=merge-duplicates,return=minimal");
  assert.match(calls[1].url, /\/group_rules\?user_id=eq\.user-1&id=not\.in\.\(rule-1\)$/);
});

test("replaceGroupRules never deletes rows when the upsert fails", async () => {
  const calls = recordFetch(() => jsonResponse({ message: "upsert exploded" }, 500));
  await assert.rejects(() => replaceGroupRules("user-1", [rule]), /upsert exploded/);
  assert.deepEqual(calls.map((call) => call.method), ["POST"]);
});

test("replaceGroupRules with an empty set only issues the delete-all", async () => {
  const calls = recordFetch(() => jsonResponse([]));
  await replaceGroupRules("user-1", []);
  assert.deepEqual(calls.map((call) => call.method), ["DELETE"]);
  assert.match(calls[0].url, /\/group_rules\?user_id=eq\.user-1$/);
});

test("replaceIgnoredSites and replaceBoardCustomGroups use the same upsert-then-prune order", async () => {
  const calls = recordFetch(() => jsonResponse([]));
  await replaceIgnoredSites("user-1", [{ id: "site-1", domain: "ads.example.com", matchScope: "exact", sortOrder: 0 }]);
  await replaceBoardCustomGroups("user-1", [{ id: "7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573", title: "Research", color: "purple", sortOrder: 0 }]);
  assert.deepEqual(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`), [
    "POST /rest/v1/ignored_sites",
    "DELETE /rest/v1/ignored_sites",
    "POST /rest/v1/board_custom_groups",
    "DELETE /rest/v1/board_custom_groups",
  ]);
});

test("replaceBoardLayouts upserts, then prunes only stale composite keys", async () => {
  const calls = recordFetch((call) => {
    if (call.method === "GET") {
      return jsonResponse([
        { board_key: "ungrouped", device_class: "desktop" },
        { board_key: "auto:example.com", device_class: "mobile" },
      ]);
    }
    return jsonResponse([]);
  });
  await replaceBoardLayouts("user-1", [{ boardKey: "ungrouped", deviceClass: "desktop", rank: 0, autoFill: true }]);
  assert.deepEqual(calls.map((call) => call.method), ["POST", "GET", "DELETE"]);
  assert.match(calls[0].url, /\/board_layouts\?on_conflict=user_id,board_key,device_class$/);
  assert.match(calls[1].url, /\/board_layouts\?user_id=eq\.user-1&select=board_key,device_class$/);
  assert.match(calls[2].url, /user_id=eq\.user-1&or=\(and\(board_key\.eq\.auto%3Aexample\.com,device_class\.eq\.mobile\)\)$/);
});

test("replaceBoardLayouts with an empty set prunes every existing row without an upsert", async () => {
  const calls = recordFetch((call) => (call.method === "GET"
    ? jsonResponse([{ board_key: "ungrouped", device_class: "desktop" }])
    : jsonResponse([])));
  await replaceBoardLayouts("user-1", []);
  assert.deepEqual(calls.map((call) => call.method), ["GET", "DELETE"]);
  assert.match(calls[1].url, /or=\(and\(board_key\.eq\.ungrouped,device_class\.eq\.desktop\)\)$/);
});
