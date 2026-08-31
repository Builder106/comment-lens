import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../app/api/", import.meta.url);

test("control-plane routes use installation-scoped access", async () => {
  const repositories = await readFile(new URL("repositories/route.ts", root), "utf8");
  const scans = await readFile(new URL("scans/route.ts", root), "utf8");
  assert.match(repositories, /installationClient/);
  assert.match(scans, /createWorkflowDispatch/);
  assert.doesNotMatch(repositories, /GITHUB_TOKEN/);
});

test("scan and review routes require the authenticated owner", async () => {
  const scan = await readFile(new URL("scans/[scanId]/route.ts", root), "utf8");
  const review = await readFile(new URL("comments/[commentId]/review/route.ts", root), "utf8");
  assert.match(scan, /requireSession/);
  assert.match(scan, /getOwnedScan/);
  assert.match(review, /getLatestOwnedComment|scans\.ownerId/);
  assert.match(review, /identityId/);
});

test("OAuth callback stores numeric identity without placing the token in session state", async () => {
  const callback = await readFile(new URL("auth/github/callback/route.ts", root), "utf8");
  assert.match(callback, /profile\.id/);
  assert.match(callback, /setSession\(profile\.login, String\(profile\.id\)\)/);
  assert.doesNotMatch(callback, /setSession\([^,]+\)/);
});
