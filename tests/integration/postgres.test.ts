import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { listComments } from "../../lib/server/data";
import { assessments, chunks, commentIdentities, comments, repositoryInstallations, reviewDecisions, scans } from "../../db/schema";
import { POST as uploadChunk } from "../../app/api/worker/scans/[scanId]/chunks/route";
import { POST as completeScan } from "../../app/api/worker/scans/[scanId]/complete/route";
import { GET as runRetention } from "../../app/api/cron/retention/route";
import { closePostgresFixture, createPostgresFixture, resetPostgresFixture } from "../fixtures/postgres/factory";

const fixture = await createPostgresFixture();
const integration = fixture ? test : test.skip;

function signedWorkerRequest(path: string, body: string, repositoryId: string, chunkId?: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", "test-worker-secret").update(`${timestamp}.${body}`).digest("hex");
  const headers = new Headers({
    "x-comment-lens-signature": `sha256=${signature}`,
    "x-comment-lens-timestamp": timestamp,
    "x-comment-lens-repository-id": repositoryId,
  });
  if (chunkId) headers.set("x-comment-lens-chunk-id", chunkId);
  return new Request(`https://comment-lens.test${path}`, { method: "POST", headers, body });
}

function commentRecord(scanId: string) {
  const span = { startByte: 0, endByte: 11, start: { line0: 0, columnByte0: 0 }, end: { line0: 0, columnByte0: 11 }, endExclusive: true as const, precision: "exact" as const };
  return {
    commentId: "comment-retry",
    scanId,
    path: "src/example.ts",
    language: "typescript",
    kind: "line" as const,
    placement: "standalone" as const,
    rawText: "// example",
    bodyText: "example",
    rawSpan: span,
    bodySpan: null,
    fragments: [span],
    tags: [],
    parser: "tree-sitter" as const,
    symbol: null,
    sourceContext: null,
    git: { available: false, primaryCommit: null, blameSpans: [], error: null },
    score: { eligible: true, priorityScore: 0, band: "low" as const, ruleSetVersion: "1", findings: [] },
  };
}

integration("enforces installation scope, foreign keys, replay idempotency, completion identity, and owner-scoped reviews", async () => {
  assert(fixture);
  await resetPostgresFixture(fixture.pool);
  const { db } = fixture;
  await db.insert(repositoryInstallations).values([
    { id: "install-a", installationId: 10, ownerLogin: "alice", ownerId: "u-a", repositoryId: "r-a", repository: "alice/repo" , defaultBranch: "main" },
    { id: "install-b", installationId: 11, ownerLogin: "bob", ownerId: "u-b", repositoryId: "r-b", repository: "bob/repo", defaultBranch: "main" },
  ]);
  await db.insert(scans).values([
    { id: "scan-a", ownerId: "u-a", ownerLogin: "alice", repositoryInstallationId: "install-a", repository: "r-a", ref: "main", status: "complete", resolvedCommit: "commit-1" },
    { id: "scan-b", ownerId: "u-b", ownerLogin: "bob", repositoryInstallationId: "install-b", repository: "r-b", ref: "main", status: "complete", resolvedCommit: "commit-2" },
  ]);
  await db.insert(commentIdentities).values([
    { id: "identity-old", repositoryInstallationId: "install-a", path: "src/a.ts", kind: "line", normalizedBody: "old", placement: "leading" },
    { id: "identity-new", repositoryInstallationId: "install-a", path: "src/b.ts", kind: "line", normalizedBody: "new", placement: "leading" },
  ]);
  await db.insert(comments).values([
    { id: "comment-old", scanId: "scan-a", identityId: "identity-old", path: "src/a.ts", language: "typescript", kind: "line", placement: "leading", bodyText: "old", rawText: "old", payload: { rawSpan: { start: { line0: 1 } } }, priorityScore: 20 },
    { id: "comment-new", scanId: "scan-a", identityId: "identity-new", path: "src/b.ts", language: "typescript", kind: "line", placement: "leading", bodyText: "new", rawText: "new", payload: { rawSpan: { start: { line0: 2 } } }, priorityScore: 90 },
  ]);
  await db.insert(chunks).values({ scanId: "scan-a", chunkId: "chunk-1", sequence: 0, totalChunks: 1, payloadSha256: "hash", payload: { comments: [] } });
  await db.insert(chunks).values({ scanId: "scan-a", chunkId: "chunk-1", sequence: 0, totalChunks: 1, payloadSha256: "hash", payload: { comments: [] } }).onConflictDoNothing();
  assert.equal((await db.select().from(chunks).where(eq(chunks.scanId, "scan-a"))).length, 1);

  await db.insert(reviewDecisions).values({ identityId: "identity-new", commentId: "comment-new", ownerId: "u-a", status: "keep", note: "keep" });
  await db.insert(assessments).values({ identityId: "identity-new", commentId: "comment-new", ownerId: "u-a", providerId: "test", model: "test", promptVersion: "1", contextScope: "comment_only", payload: { verdict: "ok" } });
  const owned = await listComments("scan-a", { page: 1, pageSize: 1, sort: "score" }, { githubUserId: "u-a", login: "alice" } as never);
  assert.deepEqual(owned.items.map((item) => item.comment.id), ["comment-new"]);
  assert.equal((await listComments("scan-a", { page: 1, pageSize: 10, status: "keep" })).total, 1);
  await db.update(comments).set({ stale: true }).where(eq(comments.identityId, "identity-old"));
  assert.equal((await db.select().from(comments).where(and(eq(comments.scanId, "scan-a"), eq(comments.stale, true)))).length, 1);
  await assert.rejects(() => db.insert(comments).values({ id: "bad", scanId: "missing", identityId: "identity-new", path: "x", kind: "line", placement: "leading", bodyText: "x", rawText: "x", payload: {} }));
  await assert.rejects(() => db.insert(reviewDecisions).values({ identityId: "missing", status: "accepted" }));
  assert.equal(createHash("sha256").update("scan-a").digest("hex").length, 64);
});

integration("repairs partial chunk writes and accepts a matching completion replay", async () => {
  assert(fixture);
  await resetPostgresFixture(fixture.pool);
  process.env.WORKER_INGEST_SECRET = "test-worker-secret";
  await fixture.db.insert(repositoryInstallations).values({ id: "install-retry", installationId: 20, ownerLogin: "alice", ownerId: "u-a", repositoryId: "r-a", repository: "alice/repo", defaultBranch: "main" });
  await fixture.db.insert(scans).values({ id: "scan-retry", ownerId: "u-a", ownerLogin: "alice", repositoryInstallationId: "install-retry", repository: "alice/repo", ref: "main", status: "running", retentionUntil: new Date(Date.now() + 86_400_000) });

  const comment = commentRecord("scan-retry");
  const chunk = { schemaVersion: 1, scanId: "scan-retry", chunkId: "scan-retry:0", sequence: 0, totalChunks: 1, comments: [comment], files: [], diagnostics: [] };
  const chunkBody = JSON.stringify(chunk);
  const chunkHash = createHash("sha256").update(chunkBody).digest("hex");

  await fixture.db.insert(chunks).values({ scanId: "scan-retry", chunkId: "scan-retry:0", sequence: 0, totalChunks: 1, payloadSha256: chunkHash, payload: chunk });
  const uploadResponse = await uploadChunk(
    signedWorkerRequest("/api/worker/scans/scan-retry/chunks", chunkBody, "alice/repo", "scan-retry:0"),
    { params: Promise.resolve({ scanId: "scan-retry" }) },
  );
  assert.equal(uploadResponse.status, 200);
  assert.equal((await uploadResponse.json()).duplicate, true);
  assert.equal((await fixture.db.select().from(comments).where(eq(comments.scanId, "scan-retry"))).length, 1);

  const completedAt = new Date().toISOString();
  const manifest = {
    schemaVersion: 1,
    scanId: "scan-retry",
    repoId: "alice/repo",
    sourceMode: "worktree" as const,
    headCommit: null,
    worktreeFingerprint: "a".repeat(64),
    configHash: "b".repeat(64),
    extractorVersion: "comment-lens-scanner/0.1.0",
    parserVersions: { "tree-sitter": "0.22+", pygments: "2.17+" },
    startedAt: completedAt,
    completedAt,
    files: [],
    diagnostics: [],
  };
  const completion = {
    schemaVersion: 1,
    scanId: "scan-retry",
    manifest,
    commentCount: 1,
    fileCount: 0,
    chunkCount: 1,
    contentSha256: createHash("sha256").update(chunkHash).digest("hex"),
  };
  const completionBody = JSON.stringify(completion);
  const firstCompletion = await completeScan(
    signedWorkerRequest("/api/worker/scans/scan-retry/complete", completionBody, "alice/repo"),
    { params: Promise.resolve({ scanId: "scan-retry" }) },
  );
  assert.equal(firstCompletion.status, 200);

  const [storedScan] = await fixture.db.select().from(scans).where(eq(scans.id, "scan-retry"));
  assert.equal(storedScan.configHash, manifest.configHash);
  assert.equal(storedScan.extractorVersion, manifest.extractorVersion);
  assert.deepEqual(storedScan.parserVersions, manifest.parserVersions);

  const replay = await completeScan(
    signedWorkerRequest("/api/worker/scans/scan-retry/complete", completionBody, "alice/repo"),
    { params: Promise.resolve({ scanId: "scan-retry" }) },
  );
  assert.equal(replay.status, 200);
});

integration("the retention route removes expired scan data and orphaned review records", async () => {
  assert(fixture);
  await resetPostgresFixture(fixture.pool);
  process.env.CRON_SECRET = "test-cron-secret-at-least-16";
  await fixture.db.insert(repositoryInstallations).values({ id: "install-retention", installationId: 21, ownerLogin: "alice", ownerId: "u-a", repositoryId: "r-a", repository: "alice/repo", defaultBranch: "main" });
  await fixture.db.insert(scans).values([
    { id: "scan-expired", ownerId: "u-a", ownerLogin: "alice", repositoryInstallationId: "install-retention", repository: "alice/repo", ref: "main", status: "complete", retentionUntil: new Date(0) },
    { id: "scan-active", ownerId: "u-a", ownerLogin: "alice", repositoryInstallationId: "install-retention", repository: "alice/repo", ref: "main", status: "complete", retentionUntil: new Date(Date.now() + 86_400_000) },
  ]);
  await fixture.db.insert(commentIdentities).values([
    { id: "identity-expired", repositoryInstallationId: "install-retention", path: "src/old.ts", kind: "line", normalizedBody: "old", placement: "standalone" },
    { id: "identity-shared", repositoryInstallationId: "install-retention", path: "src/current.ts", kind: "line", normalizedBody: "current", placement: "standalone" },
  ]);
  await fixture.db.insert(comments).values([
    { id: "comment-expired", scanId: "scan-expired", identityId: "identity-expired", path: "src/old.ts", kind: "line", placement: "standalone", bodyText: "old", rawText: "old", payload: {} },
    { id: "comment-shared-old", scanId: "scan-expired", identityId: "identity-shared", path: "src/current.ts", kind: "line", placement: "standalone", bodyText: "current", rawText: "current", payload: {} },
    { id: "comment-shared-current", scanId: "scan-active", identityId: "identity-shared", path: "src/current.ts", kind: "line", placement: "standalone", bodyText: "current", rawText: "current", payload: {} },
  ]);
  await fixture.db.insert(chunks).values({ scanId: "scan-expired", chunkId: "scan-expired:0", sequence: 0, totalChunks: 1, payloadSha256: "a".repeat(64), payload: {} });
  await fixture.db.insert(reviewDecisions).values([
    { identityId: "identity-expired", commentId: "comment-expired", ownerId: "u-a", status: "keep" },
    { identityId: "identity-shared", commentId: "comment-shared-current", ownerId: "u-a", status: "keep" },
  ]);
  await fixture.db.insert(assessments).values([
    { identityId: "identity-expired", commentId: "comment-expired", ownerId: "u-a", providerId: "test", model: "test", promptVersion: "1", contextScope: "comment_only", payload: {}, retentionUntil: new Date(Date.now() + 86_400_000) },
    { identityId: "identity-shared", commentId: "comment-shared-current", ownerId: "u-a", providerId: "test", model: "test", promptVersion: "1", contextScope: "comment_only", payload: {}, retentionUntil: new Date(0) },
  ]);

  const response = await runRetention(new Request("https://comment-lens.test/api/cron/retention", { headers: { authorization: "Bearer test-cron-secret-at-least-16" } }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.expiredScans, 1);
  assert.equal(result.removedIdentities, 1);
  assert.equal((await fixture.db.select().from(scans).where(eq(scans.id, "scan-expired"))).length, 0);
  assert.equal((await fixture.db.select().from(scans).where(eq(scans.id, "scan-active"))).length, 1);
  assert.equal((await fixture.db.select().from(comments).where(eq(comments.scanId, "scan-active"))).length, 1);
  assert.equal((await fixture.db.select().from(commentIdentities).where(eq(commentIdentities.id, "identity-expired"))).length, 0);
  assert.equal((await fixture.db.select().from(reviewDecisions)).length, 1);
  assert.equal((await fixture.db.select().from(assessments)).length, 0);
});

if (fixture) test.after(async () => closePostgresFixture(fixture.pool));
