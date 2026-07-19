import test from "node:test";
import assert from "node:assert/strict";

globalThis.chrome = { tabGroups: { TAB_GROUP_ID_NONE: -1 } };
const { autoRecordKey, getSiteKey, normalizeHostname, siteTitle } = await import("../dist/shared.js");

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
