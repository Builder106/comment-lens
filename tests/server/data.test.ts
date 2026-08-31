import test from "node:test";
import assert from "node:assert/strict";
import { assertScanOwner, scanResponse } from "../../lib/server/data";
import { requireDb, db } from "../../db";

test("assertScanOwner throws FORBIDDEN when user IDs do not match", () => {
  assert.throws(
    () => assertScanOwner({ ownerId: "user-123" }, { login: "user2", githubUserId: "user-456", exp: Date.now() + 1000 }),
    /FORBIDDEN/
  );
});

test("assertScanOwner succeeds when user IDs match", () => {
  assert.doesNotThrow(
    () => assertScanOwner({ ownerId: "user-123" }, { login: "user1", githubUserId: "user-123", exp: Date.now() + 1000 })
  );
});

test("scanResponse formats and validates scan record", () => {
  const now = new Date();
  const mockScan = {
    id: "scan_123",
    repository: "owner/repo",
    ref: "main",
    resolvedCommit: "abcdef",
    status: "complete" as const,
    commentCount: 5,
    fileCount: 2,
    chunkCount: 1,
    diagnostics: [{ path: "file.js", severity: "warning", code: "warn", message: "msg" }],
    createdAt: now,
    completedAt: now,
  };
  const res = scanResponse(mockScan as any);
  assert.equal(res.scanId, "scan_123");
  assert.equal(res.repository, "owner/repo");
  assert.equal(res.status, "complete");
  assert.equal(res.diagnostics.length, 1);
});

test("scanResponse handles empty diagnostics and null completedAt", () => {
  const now = new Date();
  const mockScan = {
    id: "scan_456",
    repository: "owner/repo2",
    ref: "main",
    resolvedCommit: "123456",
    status: "queued" as const,
    commentCount: 0,
    fileCount: 0,
    chunkCount: 0,
    diagnostics: null,
    createdAt: now,
    completedAt: null,
  };
  const res = scanResponse(mockScan as any);
  assert.equal(res.scanId, "scan_456");
  assert.deepEqual(res.diagnostics, []);
  assert.equal(res.completedAt, null);
});

test("requireDb throws when DATABASE_URL is not configured", () => {
  if (!db) {
    assert.throws(() => requireDb(), /DATABASE_URL is not configured/);
  } else {
    assert.ok(requireDb());
  }
});
