import assert from "node:assert/strict";
import test from "node:test";
import { createLargeCommentFixture } from "../fixtures/large-comments";

test("10,000-comment fixture is deterministic and bounded", () => {
  const comments = createLargeCommentFixture();
  assert.equal(comments.length, 10_000);
  assert.equal(comments[0]?.commentId, "fixture-00000");
  assert.equal(comments[9_999]?.commentId, "fixture-09999");
  assert.equal(new Set(comments.map((comment) => comment.commentId)).size, 10_000);
  assert.ok(comments.every((comment) => comment.path.startsWith("src/")));
});

test("fixture search work remains linear and completes within the local guard", () => {
  const comments = createLargeCommentFixture();
  const started = performance.now();
  const matches = comments.filter((comment) => comment.bodyText.includes("operation 9999"));
  const elapsed = performance.now() - started;
  assert.equal(matches.length, 1);
  assert.ok(elapsed < 150, `search took ${elapsed.toFixed(1)}ms`);
});
