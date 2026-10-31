import assert from "node:assert/strict";
import test from "node:test";
import { requestGeminiAssistance } from "@/lib/server/gemini-assistance";

const input = {
  commentId: "comment-1",
  comment: "The rank function ranks results.",
  language: "typescript",
  kind: "line" as const,
  finding: { ruleId: "restates_symbol", contribution: 14, evidence: { symbol: "rank" }, explanation: "Repeats the symbol name." },
  context: null,
};

test("assistance sends only the selected finding without code context", async () => {
  let request: { input?: unknown; store?: boolean } | undefined;
  const client = { interactions: { create: async (value: { input?: unknown; store?: boolean }) => {
    request = value;
    return { output_text: JSON.stringify({ whyItMatters: "It repeats the name.", relationship: "Code context was not provided.", recommendation: "investigate", suggestedRewrite: null }) };
  } } };
  const result = await requestGeminiAssistance(input, client as Parameters<typeof requestGeminiAssistance>[1], "gemini-test");
  assert.equal(request?.store, false);
  assert.match(String(request?.input), /restates_symbol/);
  assert.match(String(request?.input), /"context":null/);
  assert.equal(result.ruleId, "restates_symbol");
  assert.equal(result.recommendation, "investigate");
  assert.equal("priorityScore" in result, false);
});

test("assistance rejects a rewrite attached to a non-rewrite recommendation", async () => {
  const client = { interactions: { create: async () => ({ output_text: JSON.stringify({ whyItMatters: "It repeats the name.", relationship: "The comment restates the function.", recommendation: "keep", suggestedRewrite: "// Replacement" }) }) } };
  await assert.rejects(requestGeminiAssistance(input, client, "gemini-test"), /GEMINI_INVALID_OUTPUT/);
});

test("assistance rejects malformed provider output", async () => {
  const client = { interactions: { create: async () => ({ output_text: "not json" }) } };
  await assert.rejects(requestGeminiAssistance(input, client, "gemini-test"));
});
