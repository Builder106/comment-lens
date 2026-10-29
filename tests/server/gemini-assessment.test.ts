import test from "node:test";
import assert from "node:assert/strict";
import { getGeminiApiKeys, requestGeminiAssessment, safeGeminiErrorMetadata, withGeminiApiKeyFallback } from "../../lib/server/gemini-assessment";
import type { Finding, SymbolContext } from "../../contracts";

const input = { commentId: "c1", comment: "Explain the value.", language: "typescript", kind: "line" as const, symbol: null as SymbolContext | null, context: "const value = 1;", findings: [{ ruleId: "verbosity", contribution: 1, evidence: { length: 20 }, explanation: "The comment is verbose." }] satisfies Finding[] };
const client = (output: string): Parameters<typeof requestGeminiAssessment>[1] => ({ interactions: { create: async () => ({ output_text: output }) } });

test("numbered Gemini project keys take precedence and keep their configured order", () => {
  assert.deepEqual(getGeminiApiKeys({
    GEMINI_API_KEY: "legacy-key",
    GEMINI_API_KEY_1: " first-key ",
    GEMINI_API_KEY_2: "second-key",
    GEMINI_API_KEY_3: "",
    GEMINI_API_KEY_4: "fourth-key",
  }), ["first-key", "second-key", "fourth-key"]);
});

test("the legacy Gemini key remains a fallback", () => {
  assert.deepEqual(getGeminiApiKeys({ GEMINI_API_KEY: " legacy-key " }), ["legacy-key"]);
});

test("Gemini key fallback starts at the active project and advances on HTTP 429", async () => {
  const tried: string[] = [];
  const result = await withGeminiApiKeyFallback(["key-1", "key-2", "key-3"], 1, async (apiKey) => {
    tried.push(apiKey);
    if (apiKey === "key-2") throw Object.assign(new Error("limited"), { status: 429 });
    return "ok";
  });

  assert.deepEqual(tried, ["key-2", "key-3"]);
  assert.deepEqual(result, { result: "ok", keyIndex: 2 });
});

test("Gemini key fallback stops on errors other than HTTP 429", async () => {
  const tried: string[] = [];
  await assert.rejects(withGeminiApiKeyFallback(["key-1", "key-2"], 0, async (apiKey) => {
    tried.push(apiKey);
    throw Object.assign(new Error("invalid key"), { status: 403 });
  }), /invalid key/);
  assert.deepEqual(tried, ["key-1"]);
});

test("Gemini key fallback returns the final 429 when every project is limited", async () => {
  const tried: string[] = [];
  await assert.rejects(withGeminiApiKeyFallback(["key-1", "key-2"], 0, async (apiKey) => {
    tried.push(apiKey);
    throw Object.assign(new Error(`${apiKey} limited`), { status: 429 });
  }), /key-2 limited/);
  assert.deepEqual(tried, ["key-1", "key-2"]);
});

test("valid output is enriched with provenance without a score", async () => {
  const result = await requestGeminiAssessment(input, client('{"styleLabel":"ordinary","confidence":0.4,"reasons":["It is concise."],"suggestedRewrite":null}'), "gemini-test");
  assert.equal(result.commentId, "c1");
  assert.equal(result.modelId, "gemini-test");
  assert.equal(result.providerId, "google-gemini");
  assert.equal("priorityScore" in result, false);
});

test("malformed output is rejected", async () => {
  await assert.rejects(requestGeminiAssessment(input, client("not json"), "gemini-test"));
});

test("invalid label and confidence are rejected", async () => {
  await assert.rejects(requestGeminiAssessment(input, client('{"styleLabel":"authored","confidence":1.5,"reasons":["bad"],"suggestedRewrite":null}'), "gemini-test"));
});

test("provider failures are propagated", async () => {
  const failing = { interactions: { create: async () => { throw new Error("provider unavailable"); } } };
  await assert.rejects(requestGeminiAssessment(input, failing, "gemini-test"), /provider unavailable/);
});

test("the request contains only bounded assessment inputs", async () => {
  type AssessmentRequest = Parameters<Parameters<typeof requestGeminiAssessment>[1]["interactions"]["create"]>[0];
  let received: AssessmentRequest | undefined;
  const inspecting = { interactions: { create: async (value: AssessmentRequest) => { received = value; return { output_text: '{"styleLabel":"ordinary","confidence":0.2,"reasons":["brief"],"suggestedRewrite":null}' }; } } };
  await requestGeminiAssessment(input, inspecting, "gemini-test");
  assert.equal(received?.store, false);
  assert.equal("priorityScore" in received!, false);
  assert.match(String(received?.input), /suggestedRewrite/);
});

test("valid output with suggested rewrite is returned with v2 prompt version", async () => {
  const result = await requestGeminiAssessment(
    input,
    client('{"styleLabel":"template_like","confidence":0.85,"reasons":["Boilerplate phrasing."],"suggestedRewrite":"// Concise replacement"}'),
    "gemini-test"
  );
  assert.equal(result.suggestedRewrite, "// Concise replacement");
  assert.equal(result.styleLabel, "template_like");
  assert.equal(result.promptVersion, "comment-style-v2");
});

test("safe Gemini error metadata omits unstructured messages and arbitrary fields", () => {
  const error = Object.assign(new Error("private comment text"), {
    status: 503,
    code: "SERVICE_UNAVAILABLE",
    requestBody: "private request data",
  });

  assert.deepEqual(safeGeminiErrorMetadata(error), {
    name: "Error",
    status: 503,
    code: "SERVICE_UNAVAILABLE",
  });
});

test("safe Gemini error metadata records provider quota code and message", () => {
  const error = Object.assign(new Error("The project has exceeded its daily quota."), {
    statusCode: 429,
    error: {
    code: "quota_exceeded",
    message: "The project has exceeded its daily quota.",
    },
    body: JSON.stringify({ error: {
      code: "quota_exceeded",
      message: "The project has exceeded its daily quota.",
    } }),
  });

  assert.deepEqual(safeGeminiErrorMetadata(error), {
    name: "Error",
    status: 429,
    providerCode: "quota_exceeded",
    providerMessage: "The project has exceeded its daily quota.",
  });
});

test("safe Gemini error metadata reads the provider error from the SDK body", () => {
  const error = Object.assign(new Error("429 Too Many Requests"), {
    statusCode: 429,
    body: JSON.stringify({ error: {
      code: "too_many_requests",
      message: "Too many requests in a short period.",
    } }),
  });

  assert.deepEqual(safeGeminiErrorMetadata(error), {
    name: "Error",
    status: 429,
    providerCode: "too_many_requests",
    providerMessage: "Too many requests in a short period.",
  });
});

test("safe Gemini error metadata redacts key parameters and bounds 429 messages", () => {
  const error = Object.assign(new Error("429 Too Many Requests"), {
    status: 429,
    error: { error: {
    code: "rate_limit_exceeded",
    message: `Wait here?key=do-not-log ${"x".repeat(400)}`,
    } },
  });
  const metadata = safeGeminiErrorMetadata(error);

  assert.equal(metadata.providerMessage?.includes("do-not-log"), false);
  assert.equal(metadata.providerMessage?.length, 320);
});

test("safe Gemini error metadata rejects unbounded labels and invalid statuses", () => {
  const error = { name: "Comment text", status: 999, code: "private error detail" };

  assert.deepEqual(safeGeminiErrorMetadata(error), { name: "UnknownError" });
});
