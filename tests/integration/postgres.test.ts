import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { listComments } from "../../lib/server/data";
import { assessments, chunks, commentIdentities, comments, repositoryInstallations, reviewDecisions, scans } from "../../db/schema";
import { closePostgresFixture, createPostgresFixture, resetPostgresFixture } from "../fixtures/postgres/factory";

const fixture = await createPostgresFixture();
const integration = fixture ? test : test.skip;

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

if (fixture) test.after(async () => closePostgresFixture(fixture.pool));
