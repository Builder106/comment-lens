import { requestGeminiAssistance } from "@/lib/server/gemini-assistance";
import { createGeminiAssessmentClient, DEFAULT_GEMINI_MODEL } from "@/lib/server/gemini-assessment";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  process.stderr.write("GEMINI_API_KEY is required for the live assistance check.\n");
  process.exitCode = 2;
} else {
  try {
    const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    const result = await requestGeminiAssistance({
      commentId: "synthetic-comment",
      comment: "The rank function ranks the results.",
      language: "typescript",
      kind: "line",
      finding: { ruleId: "restates_symbol", contribution: 14, evidence: { symbol: "rank" }, explanation: "The comment repeats the function name." },
      context: null,
    }, createGeminiAssessmentClient(apiKey), model);
    process.stdout.write(JSON.stringify({ status: "passed", providerId: result.providerId, modelId: result.modelId, promptVersion: result.promptVersion, ruleId: result.ruleId, recommendation: result.recommendation }) + "\n");
  } catch {
    process.stderr.write("Live Gemini assistance request failed.\n");
    process.exitCode = 1;
  }
}
