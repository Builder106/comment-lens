import assert from "node:assert/strict";
import test from "node:test";
import { apiRequest, runFleet, selectFleetRepositories } from "../../scripts/hosted-api.mjs";

const repositories = [
  { id: "1", owner: "Builder106", name: "comment-lens", defaultBranch: "main", fork: false, private: false },
  { id: "2", owner: "Builder106", name: "lease-lookout", defaultBranch: "main", fork: false, private: true },
  { id: "3", owner: "Builder106", name: "Builder106", fork: false },
  { id: "4", owner: "Builder106", name: "fork", fork: true },
  { id: "5", owner: "SankofaForge", name: ".github", fork: false },
  { id: "6", owner: "SankofaForge", name: "agent-infrastructure", defaultBranch: "release", fork: false },
  { id: "7", owner: "Other", name: "project", fork: false },
];

test("fleet selection includes private originals and excludes forks, profile, configuration, and other owners", () => {
  assert.deepEqual(selectFleetRepositories(repositories, ["builder106", "SankofaForge"]).map((repository) => repository.id), ["1", "2", "6"]);
  assert.throws(() => selectFleetRepositories(repositories, []));
  assert.throws(() => selectFleetRepositories(repositories, ["Missing"]));
});

test("fleet preview makes no writes; execution uses default branches and reports individual failures", async () => {
  const calls = [];
  const records = [];
  const request = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === "GET") return { repositories };
    if (body.repositoryId === "2") throw new Error("API request failed with HTTP 503");
    return { scanId: `scan-${body.repositoryId}`, status: "running" };
  };
  assert.equal(await runFleet(["Builder106", "SankofaForge"], false, request, (record) => records.push(record)), 0);
  assert.equal(calls.length, 1);
  assert.equal(records[0].mode, "preview");
  assert.equal(await runFleet(["Builder106", "SankofaForge"], true, request, (record) => records.push(record)), 1);
  assert.deepEqual(calls.filter((call) => call.method === "POST").map((call) => call.body), [
    { schemaVersion: 1, repositoryId: "1", ref: "main" },
    { schemaVersion: 1, repositoryId: "2", ref: "main" },
    { schemaVersion: 1, repositoryId: "6", ref: "release" },
  ]);
  assert.equal(records.at(-1).scanId, "scan-6");
  await assert.rejects(() => runFleet(["Builder106"], true, async () => ({ repositories: [{ owner: "Builder106", name: "unknown" }] })), /fork metadata/);
});

test("API transport sends bearer credentials only to the chosen origin and refuses redirects", async (context) => {
  const config = { COMMENT_LENS_API_URL: "https://comment-lens.test", COMMENT_LENS_API_TOKEN: "test-token-".padEnd(64, "x") };
  const calls = [];
  context.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return Response.json({ schemaVersion: 1 });
  });
  assert.deepEqual(await apiRequest("POST", "/api/scans", { repositoryId: "1" }, config), { schemaVersion: 1 });
  assert.equal(calls[0].options.headers.authorization, `Bearer ${config.COMMENT_LENS_API_TOKEN}`);
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.body, '{"repositoryId":"1"}');
  for (const path of ["https://other.test/api/scans", "//other.test/api/scans", "/settings"]) {
    await assert.rejects(() => apiRequest("GET", path, undefined, config));
  }
  await assert.rejects(() => apiRequest("GET", "/api/scans", undefined, { ...config, COMMENT_LENS_API_URL: "http://other.test" }));
  await assert.rejects(() => apiRequest("GET", "/api/scans", undefined, { ...config, COMMENT_LENS_API_TOKEN: "" }));
  assert.equal(calls.length, 1);
  context.mock.method(globalThis, "fetch", async () => new Response("private response", { status: 403 }));
  await assert.rejects(() => apiRequest("GET", "/api/scans", undefined, config), /^Error: API request failed with HTTP 403$/);
});
