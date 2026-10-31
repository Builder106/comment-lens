import assert from "node:assert/strict";
import test from "node:test";
import { sensitivePath } from "@/lib/server/sensitive-path";

test("sensitive files and secret-bearing directories are excluded", () => {
  assert.equal(sensitivePath(".env"), true);
  assert.equal(sensitivePath("config/.ssh/known_hosts"), true);
  assert.equal(sensitivePath("deploy/private-key.pem"), true);
  assert.equal(sensitivePath("credentials-prod.json"), true);
  assert.equal(sensitivePath("src/worker.ts"), false);
});
