import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { authorizedInstallations, installationClient, listAccessibleRepositories, type Installation } from "../../lib/server/github-app";

test("organization access requires explicit configuration and the authorized numeric owner", () => {
  const savedOrganizations = process.env.COMMENT_LENS_GITHUB_ORGANIZATIONS;
  const savedOwner = process.env.ALLOWED_GITHUB_USER_ID;
  const session = { login: "Builder106", githubUserId: "42", exp: Date.now() + 1000 };
  const installations: Installation[] = [
    { id: 1, account: { id: 42, login: "Builder106", type: "User" } },
    { id: 2, account: { id: 43, login: "SankofaForge", type: "Organization" } },
    { id: 3, account: { id: 44, login: "OtherOrg", type: "Organization" } },
    { id: 4, account: { id: 45, login: "Builder106", type: "User" } },
    { id: 5, account: { id: 46, login: "SankofaForge", type: "User" } },
    { id: 6, account: null },
    { id: 7, account: { id: 42 }, suspended_at: "2026-10-01T00:00:00Z" },
  ];
  try {
    process.env.ALLOWED_GITHUB_USER_ID = "42";
    delete process.env.COMMENT_LENS_GITHUB_ORGANIZATIONS;
    assert.deepEqual(authorizedInstallations(installations, session).map((item) => item.id), [1]);
    process.env.COMMENT_LENS_GITHUB_ORGANIZATIONS = " sankofaforge, ";
    assert.deepEqual(authorizedInstallations(installations, session).map((item) => item.id), [1, 2]);
    assert.throws(() => authorizedInstallations(installations, { ...session, githubUserId: "99" }), /FORBIDDEN/);
    delete process.env.ALLOWED_GITHUB_USER_ID;
    assert.throws(() => authorizedInstallations(installations, session), /FORBIDDEN/);
  } finally {
    if (savedOrganizations === undefined) delete process.env.COMMENT_LENS_GITHUB_ORGANIZATIONS;
    else process.env.COMMENT_LENS_GITHUB_ORGANIZATIONS = savedOrganizations;
    if (savedOwner === undefined) delete process.env.ALLOWED_GITHUB_USER_ID;
    else process.env.ALLOWED_GITHUB_USER_ID = savedOwner;
  }
});

test("GitHub access paginates installations, lists private repositories, and separates target reads from dispatch", async (context) => {
  const names = ["ALLOWED_GITHUB_USER_ID", "COMMENT_LENS_GITHUB_ORGANIZATIONS", "GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY"] as const;
  const saved = names.map((name) => process.env[name]);
  const calls: { path: string; token: string | null }[] = [];
  try {
    process.env.ALLOWED_GITHUB_USER_ID = "42";
    process.env.COMMENT_LENS_GITHUB_ORGANIZATIONS = "SankofaForge";
    process.env.GITHUB_APP_ID = "123";
    process.env.GITHUB_APP_PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const token = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get("authorization");
      calls.push({ path: url.pathname + url.search, token });
      let body: unknown;
      if (url.pathname === "/app/installations") {
        body = url.searchParams.get("page") === "1"
          ? Array.from({ length: 100 }, (_, index) => ({ id: 100 + index, account: { id: 100 + index, login: `unrelated-${index}`, type: "User" } }))
          : [{ id: 1, account: { id: 42, login: "Builder106", type: "User" } }, { id: 2, account: { id: 43, login: "SankofaForge", type: "Organization" } }];
      } else if (url.pathname === "/app/installations/1/access_tokens") body = { token: "personal-token" };
      else if (url.pathname === "/app/installations/2/access_tokens") body = { token: "organization-token" };
      else if (url.pathname === "/installation/repositories") {
        const org = token?.includes("organization-token");
        body = { total_count: 1, repositories: [{ id: org ? 20 : 10, name: "repo", full_name: `${org ? "SankofaForge" : "Builder106"}/repo`, owner: { login: org ? "SankofaForge" : "Builder106" }, private: true, fork: false, default_branch: "main" }] };
      } else if (url.pathname === "/repos/SankofaForge/repo/commits/main") {
        assert.match(token ?? "", /organization-token/);
        body = { sha: "resolved-commit" };
      } else if (url.pathname === "/repos/Builder106/comment-lens/actions/workflows/comment-lens-scan.yml/dispatches") {
        assert.match(token ?? "", /personal-token/);
        return new Response(null, { status: 204 });
      } else throw new Error(`Unexpected request path ${url.pathname}`);
      const response = Response.json(body);
      Object.defineProperty(response, "url", { value: url.href });
      return response;
    });
    const session = { login: "Builder106", githubUserId: "42", exp: Date.now() + 1000 };
    const repositories = await listAccessibleRepositories(session);
    assert.deepEqual(repositories.map((item) => [item.installationId, item.repository.full_name, item.repository.private]), [[1, "Builder106/repo", true], [2, "SankofaForge/repo", true]]);
    const target = await installationClient(session, "SankofaForge");
    assert.equal((await target.rest.repos.getCommit({ owner: "SankofaForge", repo: "repo", ref: "main" })).data.sha, "resolved-commit");
    const dispatcher = await installationClient(session, "Builder106");
    await dispatcher.rest.actions.createWorkflowDispatch({ owner: "Builder106", repo: "comment-lens", workflow_id: "comment-lens-scan.yml", ref: "main" });
    await assert.rejects(() => installationClient(session, "OtherOrg"), /FORBIDDEN/);
    assert(calls.some((call) => call.path.includes("page=2")));
    assert(!calls.some((call) => /\/app\/installations\/1\d\d\/access_tokens/.test(call.path)));
  } finally {
    names.forEach((name, index) => {
      if (saved[index] === undefined) delete process.env[name];
      else process.env[name] = saved[index];
    });
  }
});
