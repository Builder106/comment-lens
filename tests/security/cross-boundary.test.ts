import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appRoot = new URL("../../", import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, appRoot), "utf8");
}

test("authenticated data routes contain owner-scoped access checks", async () => {
  const routes = await Promise.all([
    source("app/api/scans/[scanId]/route.ts"),
    source("app/api/scans/route.ts"),
    source("app/api/scans/[scanId]/comments/route.ts"),
    source("app/api/scans/[scanId]/export/route.ts"),
    source("app/api/comments/[commentId]/review/route.ts"),
    source("app/api/comments/[commentId]/assessment/route.ts"),
  ]);

  for (const route of routes) {
    assert.match(route, /requireSession/);
    assert.match(route, /getOwned|ownerId|assertScanOwner|listComments\([^)]*session/);
  }
});

test("worker boundaries validate identity, terminal state, and replay integrity", async () => {
  const chunks = await source("app/api/worker/scans/[scanId]/chunks/route.ts");
  const complete = await source("app/api/worker/scans/[scanId]/complete/route.ts");
  const failure = await source("app/api/worker/scans/[scanId]/failure/route.ts");

  assert.match(chunks, /verifyWorkerRequest/);
  assert.match(chunks, /payloadSha256/);
  assert.match(chunks, /Chunk replay hash mismatch/);
  assert.match(chunks, /repository/i);
  assert.match(complete, /Incomplete chunk set/);
  assert.match(complete, /Artifact hash mismatch/);
  assert.match(complete, /already terminal/);
  assert.match(failure, /WorkerFailurePayload/);
  assert.match(failure, /already terminal/);
});

test("worker authentication rejects missing, stale, and malformed signatures", async () => {
  const workerAuth = await source("lib/server/worker-auth.ts");
  assert.match(workerAuth, /!secret/);
  assert.match(workerAuth, /Date\.now\(\)/);
  assert.match(workerAuth, /timingSafeEqual/);
  assert.match(workerAuth, /sha256=/);
});

test("scan creation has a dispatch failure path", async () => {
  const route = await source("app/api/scans/route.ts");
  assert.match(route, /createWorkflowDispatch/);
  assert.match(route, /failed/i);
});

test("assessment is not part of scanner execution", async () => {
  const workflow = await source("../../.github/workflows/comment-lens-scan.yml");
  const scanner = await source("scanner/comment_lens_scanner/core.py");
  assert.doesNotMatch(scanner, /GEMINI|google\.genai|interactions\.create/i);
  assert.doesNotMatch(workflow.match(/parse:[\s\S]*?(?=\n\s{2}[a-zA-Z_-]+:|$)/)?.[0] ?? "", /GEMINI|INGESTION_SIGNING_SECRET/i);
});

test("production source retention is bounded to comment context", async () => {
  const schema = await source("db/schema.ts");
  const scanner = await source("scanner/comment_lens_scanner/core.py");
  assert.match(schema, /context|sourceContext/);
  assert.match(scanner, /8192|context/i);
  assert.doesNotMatch(scanner, /source_snapshot|full_source/i);
});
