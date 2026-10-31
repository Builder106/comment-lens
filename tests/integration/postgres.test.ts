import assert from "node:assert/strict";
import { createHash, createHmac, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { listComments } from "@/lib/server/data";
import { assessments, chunks, commentIdentities, comments, repositoryInstallations, reviewDecisions, scans, scanImprovements } from "@/db/schema";
import { POST as uploadChunk } from "@/app/api/worker/scans/[scanId]/chunks/route";
import { POST as completeScan } from "@/app/api/worker/scans/[scanId]/complete/route";
import { GET as runRetention } from "@/app/api/cron/retention/route";
import { GET as readScan } from "@/app/api/scans/[scanId]/route";
import { GET as readComments } from "@/app/api/scans/[scanId]/comments/route";
import { GET as exportScan } from "@/app/api/scans/[scanId]/export/route";
import { PATCH as reviewComment } from "@/app/api/comments/[commentId]/review/route";
import { POST as createScan } from "@/app/api/scans/route";
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
  await fixture.db.insert(scanImprovements).values({
    scanId: "scan-active",
    commentId: "comment-shared-current",
    identityId: "identity-shared",
    ownerId: "u-a",
    providerId: "google-gemini",
    model: "gemini-test",
    promptVersion: "comment-improvement-v1",
    contextScope: "comment_only",
    payload: { commentId: "comment-shared-current", outcome: "leave_as_is" },
    retentionUntil: new Date(0),
  });

  const response = await runRetention(new Request("https://comment-lens.test/api/cron/retention", { headers: { authorization: "Bearer test-cron-secret-at-least-16" } }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.expiredScans, 1);
  assert.equal(result.expiredImprovements, 1);
  assert.equal(result.removedIdentities, 1);
  assert.equal((await fixture.db.select().from(scans).where(eq(scans.id, "scan-expired"))).length, 0);
  assert.equal((await fixture.db.select().from(scans).where(eq(scans.id, "scan-active"))).length, 1);
  assert.equal((await fixture.db.select().from(comments).where(eq(comments.scanId, "scan-active"))).length, 1);
  assert.equal((await fixture.db.select().from(commentIdentities).where(eq(commentIdentities.id, "identity-expired"))).length, 0);
  assert.equal((await fixture.db.select().from(reviewDecisions)).length, 1);
  assert.equal((await fixture.db.select().from(assessments)).length, 0);
  assert.equal((await fixture.db.select().from(scanImprovements)).length, 0);
});

integration("bearer clients can scan organizations, review owned results, and cannot access other owners", async (context) => {
  assert(fixture);
  await resetPostgresFixture(fixture.pool);
  const token = "integration-only-token-".padEnd(64, "x");
  const names = ["COMMENT_LENS_API_TOKEN_SHA256", "COMMENT_LENS_API_LOGIN", "ALLOWED_GITHUB_USER_ID", "COMMENT_LENS_GITHUB_ORGANIZATIONS", "GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "COMMENT_LENS_WORKFLOW_OWNER", "COMMENT_LENS_WORKFLOW_REPOSITORY", "COMMENT_LENS_WORKFLOW_ID", "COMMENT_LENS_WORKFLOW_REF", "COMMENT_LENS_WORKFLOW_TARGET"] as const;
  const saved = names.map((name) => process.env[name]);
  try {
    process.env.COMMENT_LENS_API_TOKEN_SHA256 = createHash("sha256").update(token).digest("hex");
    process.env.COMMENT_LENS_API_LOGIN = "alice";
    process.env.ALLOWED_GITHUB_USER_ID = "42";
    await fixture.db.insert(repositoryInstallations).values({ id: "api-install", installationId: 10, ownerLogin: "alice", ownerId: "42", repositoryId: "r-api", repository: "alice/repo", defaultBranch: "main" });
    await fixture.db.insert(scans).values([
      { id: "api-owned", ownerId: "42", ownerLogin: "alice", repositoryInstallationId: "api-install", repository: "alice/repo", ref: "main", status: "complete", resolvedCommit: "commit-api" },
      { id: "api-other", ownerId: "43", ownerLogin: "bob", repositoryInstallationId: "api-install", repository: "alice/repo", ref: "main", status: "complete", resolvedCommit: "commit-api" },
    ]);
    await fixture.db.insert(commentIdentities).values({ id: "api-identity", repositoryInstallationId: "api-install", path: "src/example.ts", kind: "line", normalizedBody: "example", placement: "standalone" });
    await fixture.db.insert(comments).values({ id: "comment-retry", scanId: "api-owned", identityId: "api-identity", path: "src/example.ts", language: "typescript", kind: "line", placement: "standalone", bodyText: "example", rawText: "// example", payload: commentRecord("api-owned"), priorityScore: 0 });
    const request = (path: string, method = "GET", body?: object) => new Request(`https://comment-lens.test/api/${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const params = { params: Promise.resolve({ scanId: "api-owned" }) };
    const scan = await readScan(request("scans/api-owned"), params);
    assert.equal(scan.status, 200);
    assert.equal((await scan.json()).status, "complete");
    const result = await readComments(request("scans/api-owned/comments"), params);
    assert.equal(result.status, 200);
    assert.equal((await result.json()).items[0].commentId, "comment-retry");
    const review = await reviewComment(request("comments/comment-retry/review", "PATCH", { schemaVersion: 1, status: "keep", note: "API review" }), { params: Promise.resolve({ commentId: "comment-retry" }) });
    assert.equal(review.status, 200);
    const exported = await exportScan(request("scans/api-owned/export"), params);
    assert.equal(exported.status, 200);
    assert.equal((await exported.json())[0].review.status, "keep");
    const other = { params: Promise.resolve({ scanId: "api-other" }) };
    assert.equal((await readScan(request("scans/api-other"), other)).status, 404);
    assert.equal((await exportScan(request("scans/api-other/export"), other)).status, 404);
    process.env.COMMENT_LENS_GITHUB_ORGANIZATIONS = "SankofaForge";
    process.env.GITHUB_APP_ID = "123";
    process.env.GITHUB_APP_PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.COMMENT_LENS_WORKFLOW_OWNER = "alice";
    process.env.COMMENT_LENS_WORKFLOW_REPOSITORY = "comment-lens";
    process.env.COMMENT_LENS_WORKFLOW_ID = "comment-lens-scan.yml";
    process.env.COMMENT_LENS_WORKFLOW_REF = "main";
    process.env.COMMENT_LENS_WORKFLOW_TARGET = "development";
    let dispatchCount = 0;
    context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const json = (body: unknown) => {
        const response = Response.json(body);
        Object.defineProperty(response, "url", { value: url.href });
        return response;
      };
      const authorization = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get("authorization");
      if (url.pathname === "/app/installations") return json([
        { id: 10, account: { id: 42, login: "alice", type: "User" } },
        { id: 20, account: { id: 50, login: "SankofaForge", type: "Organization" } },
      ]);
      if (url.pathname === "/app/installations/10/access_tokens") return json({ token: "control-token" });
      if (url.pathname === "/app/installations/20/access_tokens") return json({ token: "target-token" });
      if (url.pathname === "/installation/repositories") return json({
        total_count: 1,
        repositories: authorization?.includes("target-token")
          ? [{ id: 99, name: "project", full_name: "SankofaForge/project", owner: { login: "SankofaForge" }, private: true, fork: false, default_branch: "main" }]
          : [{ id: 98, name: "comment-lens", full_name: "alice/comment-lens", owner: { login: "alice" }, private: true, fork: false, default_branch: "main" }],
      });
      if (url.pathname === "/repos/SankofaForge/project/commits/main") {
        assert.match(authorization ?? "", /target-token/);
        return json({ sha: "organization-commit" });
      }
      if (url.pathname === "/repos/alice/comment-lens/actions/workflows/comment-lens-scan.yml/dispatches") {
        assert.match(authorization ?? "", /control-token/);
        const dispatch = JSON.parse(String(init?.body)) as { inputs: { repository: string; target: string } };
        assert.equal(dispatch.inputs.repository, "SankofaForge/project");
        assert.equal(dispatch.inputs.target, "development");
        dispatchCount++;
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected GitHub path ${url.pathname}`);
    });
    const started = await createScan(request("scans", "POST", { schemaVersion: 1, repositoryId: "99", ref: "main" }));
    assert.equal(started.status, 202);
    const startedScan = await started.json();
    assert.equal(dispatchCount, 1);
    const [stored] = await fixture.db.select().from(scans).where(eq(scans.id, startedScan.scanId));
    assert.equal(stored.ownerId, "42");
    assert.equal(stored.repositoryInstallationId, "20:99");
    assert.equal(stored.resolvedCommit, "organization-commit");
    assert.equal(stored.status, "running");
    const denied = await createScan(request("scans", "POST", { schemaVersion: 1, repositoryId: "unavailable", ref: "main" }));
    assert.equal(denied.status, 403);
    assert.equal(dispatchCount, 1);
    process.env.COMMENT_LENS_API_TOKEN_SHA256 = createHash("sha256").update("rotated-token").digest("hex");
    assert.equal((await readScan(request("scans/api-owned"), params)).status, 401);
  } finally {
    names.forEach((name, index) => {
      if (saved[index] === undefined) delete process.env[name];
      else process.env[name] = saved[index];
    });
  }
});

if (fixture) test.after(async () => closePostgresFixture(fixture.pool));
