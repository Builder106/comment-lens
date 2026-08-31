import { NextResponse } from "next/server";
import { AssessmentRequest, AssessmentResponse } from "../../../../../contracts";
import { requireDb } from "../../../../../db";
import { assessments } from "../../../../../db/schema";
import { requireSession } from "../../../../../lib/server/auth";
import { getOwnedComment } from "../../../../../lib/server/data";
import { createGeminiAssessmentClient, DEFAULT_GEMINI_MODEL, requestGeminiAssessment } from "../../../../../lib/server/gemini-assessment";
import { jsonError } from "../../../../../lib/server/http";
export async function POST(request: Request, { params }: { params: Promise<{ commentId: string }> }) {
  try {
    const session = await requireSession();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return jsonError("internal_error", "Gemini assessment is not configured", 503);
    const { commentId } = await params;
    const input = AssessmentRequest.parse(await request.json());
    const comment = await getOwnedComment(commentId, input.scanId, session);
    const payload = comment.payload as { symbol?: unknown; score?: { findings?: unknown } };
    const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    const assessment = await requestGeminiAssessment({ commentId, comment: comment.bodyText, language: comment.language, kind: comment.kind, symbol: payload.symbol ?? null, context: input.sourceContext === "comment_only" ? null : comment.context, findings: payload.score?.findings ?? [] }, createGeminiAssessmentClient(apiKey), model);
    const [saved] = await requireDb().insert(assessments).values({ commentId, identityId: comment.identityId, ownerId: session.githubUserId, providerId: assessment.providerId, model: assessment.modelId, promptVersion: assessment.promptVersion, contextScope: input.sourceContext, payload: assessment, createdAt: new Date(assessment.assessedAt) }).onConflictDoUpdate({ target: assessments.identityId, set: { commentId, ownerId: session.githubUserId, providerId: assessment.providerId, model: assessment.modelId, promptVersion: assessment.promptVersion, contextScope: input.sourceContext, payload: assessment, createdAt: new Date(assessment.assessedAt) } }).returning();
    return NextResponse.json(AssessmentResponse.parse({ schemaVersion: 1, assessment: saved?.payload ?? assessment }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Assessment failed";
    const status = message === "UNAUTHORIZED" ? 401 : message === "NOT_FOUND" ? 404 : message === "FORBIDDEN" ? 403 : message === "GEMINI_EMPTY_OUTPUT" ? 502 : 400;
    return jsonError(status === 404 ? "not_found" : status === 403 ? "forbidden" : status === 401 ? "unauthenticated" : status >= 500 ? "internal_error" : "invalid_request", status >= 500 ? "Gemini assessment failed" : message, status);
  }
}
