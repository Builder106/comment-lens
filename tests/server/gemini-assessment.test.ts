import test from "node:test";
import assert from "node:assert/strict";
import { requestGeminiAssessment } from "../../lib/server/gemini-assessment";

const input = { commentId: "c1", comment: "Explain the value.", language: "typescript", kind: "line", symbol: { name: "value" }, context: "const value = 1;", findings: [{ ruleId: "verbosity" }] };
const client = (output: string): Parameters<typeof requestGeminiAssessment>[1] => ({ interactions: { create: async () => ({ output_text: output }) } });

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
  let received: Record<string, unknown> | undefined;
  const inspecting = { interactions: { create: async (value: Record<string, unknown>) => { received = value; return { output_text: '{"styleLabel":"ordinary","confidence":0.2,"reasons":["brief"],"suggestedRewrite":null}' }; } } };
  await requestGeminiAssessment(input, inspecting, "gemini-test");
  assert.equal(received?.store, false);
  assert.equal("priorityScore" in received!, false);
});
