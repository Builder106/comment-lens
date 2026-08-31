import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWorkerRequest } from "../../lib/server/worker-auth";
test("worker signatures require the timestamped payload", () => { process.env.WORKER_INGEST_SECRET = "test-secret"; const timestamp = String(Date.now()); const payload = '{"schemaVersion":1}'; const signature = "sha256=" + createHmac("sha256", "test-secret").update(timestamp + "." + payload).digest("hex"); assert.equal(verifyWorkerRequest(payload, signature, timestamp), true); assert.equal(verifyWorkerRequest(payload + "x", signature, timestamp), false); });
