import { NextResponse } from "next/server";
import { CommentRecord, FindingAssistanceRequest, FindingAssistanceResponse } from "../../../../../contracts";
import { requireSession } from "../../../../../lib/server/auth";
import { getOwnedComment } from "../../../../../lib/server/data";
import { requestGeminiAssistance } from "../../../../../lib/server/gemini-assistance";
import { createGeminiAssessmentClient, DEFAULT_GEMINI_MODEL } from "../../../../../lib/server/gemini-assessment";
import { handleError, jsonError } from "../../../../../lib/server/http";
import { sensitivePath } from "../../../../../lib/server/sensitive-path";

export async function POST(request: Request, { params }: { params: Promise<{ commentId: string }> }) {
  try {
    const session = await requireSession();
    const { commentId } = await params;
    const input = FindingAssistanceRequest.parse(await request.json());
    const comment = await getOwnedComment(commentId, input.scanId, session);
    if (sensitivePath(comment.path)) return jsonError("forbidden", "Assisted review is unavailable for sensitive paths", 403);
    const payload = CommentRecord.parse(comment.payload);
    const finding = payload.score.findings.find((item) => item.ruleId === input.ruleId);
    if (!finding) return jsonError("not_found", "Finding is not present on this comment", 404);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return jsonError("internal_error", "Assisted review is not configured", 503);
    try {
      const assistance = await requestGeminiAssistance({
        commentId,
        comment: comment.bodyText,
        language: comment.language,
        kind: payload.kind,
        finding,
        context: input.includeCodeContext ? comment.context?.slice(0, 8192) ?? null : null,
      }, createGeminiAssessmentClient(apiKey), process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL);
      return NextResponse.json(FindingAssistanceResponse.parse({ schemaVersion: 1, assistance }));
    } catch {
      return jsonError("internal_error", "Assisted review is unavailable", 502);
    }
  } catch (error) {
    if (error instanceof SyntaxError) return jsonError("invalid_request", "Invalid request payload", 400);
    return handleError(error);
  }
}
