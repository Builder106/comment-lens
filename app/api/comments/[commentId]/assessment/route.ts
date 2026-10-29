import { NextResponse } from "next/server";
import { AssessmentRequest, AssessmentResponse, CommentRecord } from "../../../../../contracts";
import { requireDb } from "../../../../../db";
import { assessments } from "../../../../../db/schema";
import { requireSession } from "../../../../../lib/server/auth";
import { getOwnedComment, getOwnedScan } from "../../../../../lib/server/data";
import { createGeminiAssessmentClient, DEFAULT_GEMINI_MODEL, getGeminiApiKeys, requestGeminiAssessment, safeGeminiErrorMetadata, withGeminiApiKeyFallback } from "../../../../../lib/server/gemini-assessment";
import { jsonError } from "../../../../../lib/server/http";
import { sensitivePath } from "../../../../../lib/server/sensitive-path";
export async function POST(request: Request, { params }: { params: Promise<{ commentId: string }> }) {
  try {
    const session = await requireSession(request);
    const apiKeys = getGeminiApiKeys();
    if (apiKeys.length === 0) return jsonError("internal_error", "Gemini assessment is not configured", 503);
    const { commentId } = await params;
    const input = AssessmentRequest.parse(await request.json());
    const scan = await getOwnedScan(input.scanId, session);
    const comment = await getOwnedComment(commentId, input.scanId, session);
    if (sensitivePath(comment.path)) return jsonError("forbidden", "Assisted review is unavailable for sensitive paths", 403);
    const payload = comment.payload as Partial<CommentRecord>;
    const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    const assessmentInput = { commentId, comment: comment.bodyText, language: comment.language, kind: CommentRecord.shape.kind.parse(comment.kind), symbol: payload.symbol ?? null, context: input.sourceContext === "comment_only" ? null : comment.context, findings: payload.score?.findings ?? [] };
    const { result: assessment } = await withGeminiApiKeyFallback(apiKeys, 0, (apiKey) => requestGeminiAssessment(assessmentInput, createGeminiAssessmentClient(apiKey, 1), model));
    const retentionUntil = scan.retentionUntil ?? new Date(Date.now() + 30 * 86_400_000);
    const [saved] = await requireDb().insert(assessments).values({ commentId, identityId: comment.identityId, ownerId: session.githubUserId, providerId: assessment.providerId, model: assessment.modelId, promptVersion: assessment.promptVersion, contextScope: input.sourceContext, payload: assessment, createdAt: new Date(assessment.assessedAt), retentionUntil }).onConflictDoUpdate({ target: assessments.identityId, set: { commentId, ownerId: session.githubUserId, providerId: assessment.providerId, model: assessment.modelId, promptVersion: assessment.promptVersion, contextScope: input.sourceContext, payload: assessment, createdAt: new Date(assessment.assessedAt), retentionUntil } }).returning();
    return NextResponse.json(AssessmentResponse.parse({ schemaVersion: 1, assessment: saved?.payload ?? assessment }));
  } catch (error) {
    if (safeGeminiErrorMetadata(error).status === 429) return jsonError("rate_limited", "All configured Gemini keys hit a rate limit", 429);
    const message = error instanceof Error ? error.message : "Assessment failed";
    const status = message === "UNAUTHORIZED" ? 401 : message === "NOT_FOUND" ? 404 : message === "FORBIDDEN" ? 403 : message === "GEMINI_EMPTY_OUTPUT" ? 502 : 400;
    return jsonError(status === 404 ? "not_found" : status === 403 ? "forbidden" : status === 401 ? "unauthenticated" : status >= 500 ? "internal_error" : "invalid_request", status >= 500 ? "Gemini assessment failed" : message, status);
  }
}
