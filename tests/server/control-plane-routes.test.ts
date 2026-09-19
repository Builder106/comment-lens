import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { getWorkflowConfig, WorkflowConfigurationError } from "../../lib/server/workflow-config";

const root = new URL("../../app/api/", import.meta.url);

test("control-plane routes use installation-scoped access", async () => {
  const repositories = await readFile(new URL("repositories/route.ts", root), "utf8");
  const scans = await readFile(new URL("scans/route.ts", root), "utf8");
  assert.match(repositories, /installationClient/);
  assert.match(scans, /createWorkflowDispatch/);
  assert.doesNotMatch(repositories, /GITHUB_TOKEN/);
});

test("workflow configuration is required and has no stale defaults", async () => {
  const names = ["COMMENT_LENS_WORKFLOW_OWNER", "COMMENT_LENS_WORKFLOW_REPOSITORY", "COMMENT_LENS_WORKFLOW_ID", "COMMENT_LENS_WORKFLOW_REF"] as const;
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    assert.throws(() => getWorkflowConfig(), WorkflowConfigurationError);
    const scans = await readFile(new URL("scans/route.ts", root), "utf8");
    assert.doesNotMatch(scans, /code-wes-projects|\?\? \"comment-lens\"/);
    assert.ok(scans.indexOf("getWorkflowConfig()") < scans.indexOf("installationClient(session)"));
    assert.ok(scans.indexOf("getWorkflowConfig()") < scans.indexOf("requireDb()"));
  } finally {
    for (const name of names) {
      const value = saved[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("workflow configuration supplies the explicit dispatch target", () => {
  const names = { owner: "Builder106", repository: "comment-lens", workflowId: "comment-lens-scan.yml", ref: "main" } as const;
  const saved = Object.fromEntries(Object.keys(names).map((key) => [`COMMENT_LENS_WORKFLOW_${key === "workflowId" ? "ID" : key.toUpperCase()}`, process.env[`COMMENT_LENS_WORKFLOW_${key === "workflowId" ? "ID" : key.toUpperCase()}`]]));
  try {
    process.env.COMMENT_LENS_WORKFLOW_OWNER = names.owner;
    process.env.COMMENT_LENS_WORKFLOW_REPOSITORY = names.repository;
    process.env.COMMENT_LENS_WORKFLOW_ID = names.workflowId;
    process.env.COMMENT_LENS_WORKFLOW_REF = names.ref;
    assert.deepEqual(getWorkflowConfig(), names);
    assert.doesNotThrow(() => getWorkflowConfig());
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
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
