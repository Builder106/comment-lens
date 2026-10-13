import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWorkerRequest } from "../../lib/server/worker-auth";

test("worker signatures accept epoch-second timestamps and reject stale or altered requests", () => {
  process.env.WORKER_INGEST_SECRET = "test-secret";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = '{"schemaVersion":1}';
  const signature = "sha256=" + createHmac("sha256", "test-secret").update(timestamp + "." + payload).digest("hex");
  const staleTimestamp = String(Number(timestamp) - 301);
  const staleSignature = "sha256=" + createHmac("sha256", "test-secret").update(staleTimestamp + "." + payload).digest("hex");

  assert.equal(verifyWorkerRequest(payload, signature, timestamp), true);
  assert.equal(verifyWorkerRequest(payload + "x", signature, timestamp), false);
  assert.equal(verifyWorkerRequest(payload, staleSignature, staleTimestamp), false);
  assert.equal(verifyWorkerRequest(payload, signature, "not-a-timestamp"), false);
});
