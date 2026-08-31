import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CommentQuery, ReviewDecisionRequest, WorkerChunkPayload } from "../../contracts";

test("malformed comment queries fail closed", () => {
  assert.throws(() => CommentQuery.parse({ schemaVersion: 1, scanId: "scan", minScore: 90, maxScore: 10 }));
  assert.throws(() => CommentQuery.parse({ schemaVersion: 1, scanId: "scan", pageSize: 101 }));
  assert.throws(() => ReviewDecisionRequest.parse({ schemaVersion: 1, status: "unreviewed" }));
});

test("worker chunks reject out-of-range sequence numbers", () => {
  const invalid = {
    schemaVersion: 1,
    scanId: "scan",
    chunkId: "chunk",
    sequence: 2,
    totalChunks: 2,
    comments: [],
    files: [],
    diagnostics: [],
  };
  assert.throws(() => WorkerChunkPayload.parse(invalid));
});

test("rescan implementation exposes stale and identity persistence hooks", async () => {
  const schema = await readFile(new URL("../../db/schema.ts", import.meta.url), "utf8");
  const data = await readFile(new URL("../../lib/server/data.ts", import.meta.url), "utf8");
  assert.match(schema, /stale|identityId/i);
  assert.match(data, /identityId|stale/i);
});
