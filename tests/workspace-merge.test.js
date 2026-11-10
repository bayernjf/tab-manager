import test from "node:test";
import assert from "node:assert/strict";

globalThis.chrome = {};
const { mergeWorkspaceSnapshots, mergeWorkspaceTombstones, validateWorkspaceSnapshot, validateWorkspaceTombstone } = await import("../dist/shared.js");

function snapshot(id, overrides = {}) {
  const base = {
    id,
    title: `ws-${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    tabs: [{ title: "Example", url: "https://example.com/" }],
    deviceId: "device-1",
    deviceName: "Mac-Chrome",
  };
  const merged = { ...base, ...overrides };
  const validated = validateWorkspaceSnapshot(merged);
  assert.ok(validated, `fixture ${id} must be a valid snapshot`);
  return validated;
}

const T1 = "2026-01-02T00:00:00.000Z";
const T2 = "2026-01-03T00:00:00.000Z";
const T3 = "2026-01-04T00:00:00.000Z";

test("offline-created local workspace survives merge and is queued for upload", () => {
  const localNew = snapshot("a", { updatedAt: T2 });
  const shared = snapshot("b", { updatedAt: T1 });
  const result = mergeWorkspaceSnapshots([localNew, shared], [shared]);
  assert.deepEqual(result.merged.map((w) => w.id).sort(), ["a", "b"]);
  assert.deepEqual(result.upload.map((w) => w.id), ["a"], "local-only workspace must be uploaded, not dropped");
});

test("cloud deletion with tombstone removes the local copy", () => {
  const localCopy = snapshot("a", { updatedAt: T1 });
  const tombstone = { id: "a", deletedAt: T2 };
  const result = mergeWorkspaceSnapshots([localCopy], [], [tombstone], []);
  assert.deepEqual(result.merged, [], "tombstoned local workspace must be removed");
  assert.deepEqual(result.upload, [], "tombstoned local workspace must not be resurrected to the cloud");
  assert.deepEqual(result.tombstones, [tombstone]);
});

test("local tombstone suppresses a surviving cloud row and retries its deletion", () => {
  const cloudCopy = snapshot("a", { updatedAt: T1 });
  const tombstone = { id: "a", deletedAt: T2 };
  const result = mergeWorkspaceSnapshots([], [cloudCopy], [tombstone], []);
  assert.deepEqual(result.merged, []);
  assert.deepEqual(result.deleteFromCloud, ["a"], "cloud row older than the tombstone must be deleted remotely");
  assert.deepEqual(result.uploadTombstones, [tombstone], "local-only tombstone must be uploaded");
});

test("snapshot modified after the tombstone survives (last write wins)", () => {
  const edited = snapshot("a", { updatedAt: T3 });
  const tombstone = { id: "a", deletedAt: T2 };
  const result = mergeWorkspaceSnapshots([edited], [], [tombstone], []);
  assert.deepEqual(result.merged.map((w) => w.id), ["a"]);
  assert.deepEqual(result.upload.map((w) => w.id), ["a"]);
});

test("two-way conflict: newer side wins", () => {
  const localOlder = snapshot("a", { updatedAt: T1, title: "local-old" });
  const cloudNewer = snapshot("a", { updatedAt: T2, title: "cloud-new" });
  const result1 = mergeWorkspaceSnapshots([localOlder], [cloudNewer]);
  assert.equal(result1.merged[0].title, "cloud-new");
  assert.deepEqual(result1.upload, []);

  const localNewer = snapshot("a", { updatedAt: T3, title: "local-new" });
  const result2 = mergeWorkspaceSnapshots([localNewer], [cloudNewer]);
  assert.equal(result2.merged[0].title, "local-new");
  assert.deepEqual(result2.upload.map((w) => w.id), ["a"]);
});

test("cloud-only workspace is downloaded", () => {
  const cloudOnly = snapshot("c", { updatedAt: T1 });
  const result = mergeWorkspaceSnapshots([], [cloudOnly]);
  assert.deepEqual(result.merged.map((w) => w.id), ["c"]);
  assert.deepEqual(result.upload, []);
});

test("snapshots without updatedAt fall back to createdAt for comparison", () => {
  const legacyLocal = snapshot("a", { createdAt: T2 }); // no updatedAt
  const cloudOlder = snapshot("a", { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: T1 });
  const result = mergeWorkspaceSnapshots([legacyLocal], [cloudOlder]);
  assert.deepEqual(result.upload.map((w) => w.id), ["a"], "local createdAt newer than cloud updatedAt wins");
});

test("tombstone merge keeps the latest deletedAt per id", () => {
  const older = { id: "a", deletedAt: T1 };
  const newer = { id: "a", deletedAt: T3 };
  const merged = mergeWorkspaceTombstones([older], [newer, { id: "b", deletedAt: T2 }]);
  assert.equal(merged.find((t) => t.id === "a").deletedAt, T3);
  assert.equal(merged.length, 2);
});

test("validateWorkspaceSnapshot round-trips updatedAt", () => {
  const withTs = validateWorkspaceSnapshot({ ...snapshot("x"), updatedAt: T2 });
  assert.equal(withTs.updatedAt, T2);
  const withoutTs = validateWorkspaceSnapshot(snapshot("x"));
  assert.equal(withoutTs.updatedAt, undefined);
  const invalidTs = validateWorkspaceSnapshot({ ...snapshot("x"), updatedAt: "not-a-date" });
  assert.equal(invalidTs.updatedAt, undefined);
});

test("validateWorkspaceTombstone accepts valid rows and rejects invalid ones", () => {
  assert.deepEqual(validateWorkspaceTombstone({ id: "abc", deletedAt: T1 }), { id: "abc", deletedAt: T1 });
  assert.equal(validateWorkspaceTombstone({ id: "abc", deletedAt: "nope" }), null);
  assert.equal(validateWorkspaceTombstone({ deletedAt: T1 }), null);
});
