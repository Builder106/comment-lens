import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { requireSession, verifyApiAuthorization } from "@/lib/server/auth";
import { GET as listRepositories } from "@/app/api/repositories/route";
import { GET as listScans, POST as createScan } from "@/app/api/scans/route";
import { GET as scanStatus } from "@/app/api/scans/[scanId]/route";
import { GET as scanComments } from "@/app/api/scans/[scanId]/comments/route";
import { GET as exportScan } from "@/app/api/scans/[scanId]/export/route";
import { PATCH as reviewComment } from "@/app/api/comments/[commentId]/review/route";
import { POST as assessComment } from "@/app/api/comments/[commentId]/assessment/route";
import { POST as assistComment } from "@/app/api/comments/[commentId]/assist/route";
import { GET as improvements, POST as improve } from "@/app/api/scans/[scanId]/improvements/route";

const token = "test-only-api-token-".padEnd(64, "x");
const names = ["COMMENT_LENS_API_TOKEN_SHA256", "COMMENT_LENS_API_LOGIN", "ALLOWED_GITHUB_USER_ID"] as const;

test("API credentials resolve only the configured owner and fail closed on malformed configuration", async () => {
  const saved = names.map((name) => process.env[name]);
  try {
    process.env.COMMENT_LENS_API_TOKEN_SHA256 = createHash("sha256").update(token).digest("hex");
    process.env.COMMENT_LENS_API_LOGIN = "Builder106";
    process.env.ALLOWED_GITHUB_USER_ID = "42";
    assert.equal(verifyApiAuthorization(`Bearer ${token}`)?.githubUserId, "42");
    assert.equal(verifyApiAuthorization(`bearer ${token}`)?.login, "Builder106");
    assert.equal(verifyApiAuthorization(`Bearer ${token}x`), null);
    assert.equal(verifyApiAuthorization(`Basic ${token}`), null);
    assert.equal(verifyApiAuthorization("Bearer short"), null);
    const request = new Request("https://comment-lens.test/api/repositories", { headers: { authorization: `Bearer ${token}` } });
    assert.equal((await requireSession(request)).githubUserId, "42");
    for (const name of names) {
      const valid = process.env[name];
      delete process.env[name];
      assert.equal(verifyApiAuthorization(`Bearer ${token}`), null);
      process.env[name] = "invalid!";
      assert.equal(verifyApiAuthorization(`Bearer ${token}`), null);
      process.env[name] = valid;
    }
  } finally {
    names.forEach((name, index) => {
      if (saved[index] === undefined) delete process.env[name];
      else process.env[name] = saved[index];
    });
  }
});

test("every hosted data route rejects an invalid bearer token before accessing data or providers", async () => {
  const headers = { authorization: "Bearer invalid", cookie: "comment_lens_session=irrelevant" };
  const url = "https://comment-lens.test/api/scans";
  const request = new Request(url, { headers });
  const scanParams = { params: Promise.resolve({ scanId: "scan" }) };
  const commentParams = { params: Promise.resolve({ commentId: "comment" }) };
  for (const response of await Promise.all([
    listRepositories(request), listScans(request), createScan(request),
    scanStatus(request, scanParams), scanComments(request, scanParams), exportScan(request, scanParams),
    reviewComment(request, commentParams), assessComment(request, commentParams), assistComment(request, commentParams),
    improvements(request, scanParams), improve(request, scanParams),
  ])) {
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "unauthenticated");
  }
});
