import { readFile } from "node:fs/promises";
import type { CommentKind } from "@/contracts";
import { createGeminiAssessmentClient, DEFAULT_GEMINI_MODEL } from "@/lib/server/gemini-assessment";
import { requestGeminiScanImprovements, SCAN_IMPROVEMENT_PROMPT_VERSION } from "@/lib/server/gemini-scan-improvements";

interface HistoricalCommentCase {
  id: string;
  repository: string;
  commit: string;
  path: string;
  category: string;
  comment: string;
  historicalEdit: string;
}

const cases = JSON.parse(await readFile(new URL("../fixtures/comment-voice-historical.json", import.meta.url), "utf8")) as HistoricalCommentCase[];
const args = process.argv.slice(2);

if (args.length !== 1 || args[0] !== "--confirm-live") {
  process.stderr.write("Usage: node --import tsx tests/live/comment-voice-evaluation.ts --confirm-live\n");
  process.exitCode = 2;
} else {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    process.stderr.write("GEMINI_API_KEY is required for the live comment voice evaluation.\n");
    process.exitCode = 2;
  } else {
    try {
      const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
      const client = createGeminiAssessmentClient(apiKey);
      const results = [];

      for (let offset = 0; offset < cases.length; offset += 5) {
        const batch = cases.slice(offset, offset + 5);
        const improvements = await requestGeminiScanImprovements(batch.map((item) => ({
          commentId: item.id,
          comment: item.comment,
          language: "javascript",
          kind: "block" as CommentKind,
          context: null,
        })), client, model);
        const byId = new Map(improvements.map((item) => [item.commentId, item]));
        for (const item of batch) {
          const assessment = byId.get(item.id);
          if (!assessment) throw new Error("EVALUATION_RESULT_MISSING");
          results.push({
            id: item.id,
            repository: item.repository,
            commit: item.commit,
            path: item.path,
            category: item.category,
            before: item.comment,
            historicalEdit: item.historicalEdit,
            assessment,
          });
        }
      }

      process.stdout.write(`${JSON.stringify({
        promptVersion: SCAN_IMPROVEMENT_PROMPT_VERSION,
        model,
        contextScope: "comment_only",
        caseCount: cases.length,
        requestCount: Math.ceil(cases.length / 5),
        results,
      }, null, 2)}\n`);
    } catch (error) {
      process.stderr.write(`Live comment voice evaluation failed (${error instanceof Error ? error.name : "unknown error"}).\n`);
      process.exitCode = 1;
    }
  }
}
