import { and, eq, gt, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  CommentImprovement,
  CommentRecord,
  ScanImprovementBatchResponse,
  ScanImprovementRequest,
  ScanImprovementsResponse,
} from "../../../../../contracts";
import { requireDb } from "../../../../../db";
import { comments, scanImprovements } from "../../../../../db/schema";
import { requireSession } from "../../../../../lib/server/auth";
import { getOwnedScan } from "../../../../../lib/server/data";
import {
  createGeminiAssessmentClient,
  DEFAULT_GEMINI_MODEL,
  GEMINI_API_KEY_INDEX_HEADER,
  getGeminiApiKeySlots,
  getGeminiApiKeys,
  safeGeminiErrorMetadata,
  withGeminiApiKeyFallback,
} from "../../../../../lib/server/gemini-assessment";
import { requestGeminiScanImprovements, SCAN_IMPROVEMENT_PROMPT_VERSION } from "../../../../../lib/server/gemini-scan-improvements";
import { handleError, jsonError } from "../../../../../lib/server/http";
import { sensitivePath } from "../../../../../lib/server/sensitive-path";

const policyModel = "policy";

function policyOutcome(commentId: string, outcome: "leave_as_is" | "needs_human_review", reason: string) {
  return CommentImprovement.parse({
    commentId,
    outcome,
    reasons: [reason],
    suggestedRewrite: null,
    providerId: "comment-lens",
    modelId: policyModel,
    promptVersion: SCAN_IMPROVEMENT_PROMPT_VERSION,
    contextScope: "not_sent",
    assessedAt: new Date().toISOString(),
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ scanId: string }> }) {
  try {
    const session = await requireSession(request);
    const { scanId } = await params;
    await getOwnedScan(scanId, session);
    const rows = await requireDb().select({ payload: scanImprovements.payload }).from(scanImprovements).where(and(
      eq(scanImprovements.scanId, scanId),
      eq(scanImprovements.ownerId, session.githubUserId),
      eq(scanImprovements.promptVersion, SCAN_IMPROVEMENT_PROMPT_VERSION),
      gt(scanImprovements.retentionUntil, new Date()),
    ));
    return NextResponse.json(ScanImprovementsResponse.parse({
      schemaVersion: 1,
      configured: getGeminiApiKeys().length > 0,
      improvements: rows.map((row) => CommentImprovement.parse(row.payload)),
    }));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ scanId: string }> }) {
  try {
    const session = await requireSession(request);
    const { scanId } = await params;
    const input = ScanImprovementRequest.parse(await request.json());
    if (input.scanId !== scanId) throw new Error("FORBIDDEN");
    const scan = await getOwnedScan(scanId, session);
    if (scan.status !== "complete") return jsonError("conflict", "Wait for the scan to finish before reviewing comments", 409);

    const db = requireDb();
    const rows = await db.select().from(comments).where(and(eq(comments.scanId, scanId), inArray(comments.id, input.commentIds)));
    if (rows.length !== input.commentIds.length) throw new Error("NOT_FOUND");
    const byId = new Map(rows.map((row) => [row.id, row]));
    const results = new Map<string, ReturnType<typeof policyOutcome>>();
    const candidates: { row: typeof rows[number]; payload: CommentRecord }[] = [];
    let usedGeminiKeyIndex: number | null = null;

    for (const commentId of input.commentIds) {
      const row = byId.get(commentId);
      if (!row) throw new Error("NOT_FOUND");
      const payload = CommentRecord.parse(row.payload);
      if (row.protected || row.generated || row.license || row.todoOnly || payload.score.band === "protected") {
        results.set(commentId, policyOutcome(commentId, "leave_as_is", "Comment Lens skipped this protected, generated, license, or TODO-only comment."));
      } else if (sensitivePath(row.path)) {
        results.set(commentId, policyOutcome(commentId, "leave_as_is", "Comment Lens skipped this sensitive path; its comment was not sent to Gemini."));
      } else if (row.rawText.length > 4000) {
        results.set(commentId, policyOutcome(commentId, "needs_human_review", "This comment is too long for a safe batch review."));
      } else {
        candidates.push({ row, payload });
      }
    }

    if (candidates.length) {
      const apiKeys = getGeminiApiKeys();
      const apiKeySlots = getGeminiApiKeySlots();
      if (apiKeys.length === 0) return jsonError("internal_error", "Whole-scan review is not configured", 503);
      try {
        const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
        const startIndexValue = Number(request.headers.get(GEMINI_API_KEY_INDEX_HEADER));
        const startIndex = Number.isInteger(startIndexValue) && startIndexValue >= 0 && startIndexValue < apiKeys.length ? startIndexValue : 0;
        const { result: modelResults, keyIndex } = await withGeminiApiKeyFallback(apiKeys, startIndex, (apiKey) =>
          requestGeminiScanImprovements(candidates.map(({ row, payload }) => ({
            commentId: row.id,
            comment: row.rawText,
            language: row.language,
            kind: payload.kind,
            context: input.includeCodeContext ? row.context?.slice(0, 2048) ?? null : null,
          })), createGeminiAssessmentClient(apiKey, 1), model), (keyIndex, metadata) => {
            console.error("Gemini scan improvement key rate limited", {
              keySlot: apiKeySlots[keyIndex] ?? "unknown",
              ...metadata,
            });
          });
        usedGeminiKeyIndex = keyIndex;
        for (const result of modelResults) {
          results.set(result.commentId, CommentImprovement.parse({
            ...result,
            providerId: "google-gemini",
            modelId: model,
            promptVersion: SCAN_IMPROVEMENT_PROMPT_VERSION,
            contextScope: input.includeCodeContext ? "comment_and_code" : "comment_only",
            assessedAt: new Date().toISOString(),
          }));
        }
      } catch (error) {
        const metadata = safeGeminiErrorMetadata(error);
        if (metadata.status === 429) return jsonError("rate_limited", "All configured Gemini keys hit a rate limit", 429);
        console.error("Gemini scan improvement request failed", metadata);
        return jsonError("internal_error", "Whole-scan review is temporarily unavailable", 502);
      }
    }

    const retentionUntil = scan.retentionUntil ?? new Date(Date.now() + 30 * 86_400_000);
    const improvements: ReturnType<typeof policyOutcome>[] = [];
    for (const commentId of input.commentIds) {
      const improvement = results.get(commentId);
      if (!improvement) return jsonError("internal_error", "Whole-scan review returned an incomplete result", 502);
      improvements.push(improvement);
    }
    for (const improvement of improvements) {
      const row = byId.get(improvement.commentId);
      if (!row) throw new Error("NOT_FOUND");
      const values = {
        scanId,
        commentId: row.id,
        identityId: row.identityId,
        ownerId: session.githubUserId,
        providerId: improvement.providerId,
        model: improvement.modelId,
        promptVersion: improvement.promptVersion,
        contextScope: improvement.contextScope,
        payload: improvement,
        createdAt: new Date(improvement.assessedAt),
        retentionUntil,
      };
      await db.insert(scanImprovements).values(values).onConflictDoUpdate({
        target: [scanImprovements.scanId, scanImprovements.commentId],
        set: {
          ownerId: values.ownerId,
          providerId: values.providerId,
          model: values.model,
          promptVersion: values.promptVersion,
          contextScope: values.contextScope,
          payload: values.payload,
          createdAt: values.createdAt,
          retentionUntil: values.retentionUntil,
        },
      });
    }
    const response = NextResponse.json(ScanImprovementBatchResponse.parse({ schemaVersion: 1, improvements }));
    if (usedGeminiKeyIndex !== null) response.headers.set(GEMINI_API_KEY_INDEX_HEADER, String(usedGeminiKeyIndex));
    return response;
  } catch (error) {
    if (error instanceof SyntaxError) return jsonError("invalid_request", "Invalid request payload", 400);
    return handleError(error);
  }
}
