import assert from "node:assert/strict";
import test from "node:test";
import { GET as runRetention } from "@/app/api/cron/retention/route";

test("retention route requires a configured bearer secret", async () => {
  const originalSecret = process.env.CRON_SECRET;

  try {
    delete process.env.CRON_SECRET;
    const unconfigured = await runRetention(new Request("https://comment-lens.test/api/cron/retention"));
    assert.equal(unconfigured.status, 503);

    process.env.CRON_SECRET = "test-cron-secret-at-least-16";
    const unauthorized = await runRetention(new Request("https://comment-lens.test/api/cron/retention"));
    assert.equal(unauthorized.status, 401);
  } finally {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  }
});
