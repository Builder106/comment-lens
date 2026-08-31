import { NextResponse } from "next/server";
import { ReviewDecision, ReviewDecisionRequest, ReviewDecisionResponse, CONTRACT_SCHEMA_VERSION } from "../../../../../contracts";
import { requireDb } from "../../../../../db";
import { reviewDecisions } from "../../../../../db/schema";
import { requireSession } from "../../../../../lib/server/auth";
import { getLatestOwnedComment } from "../../../../../lib/server/data";
import { handleError } from "../../../../../lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ commentId: string }> }) {
  try {
    const session = await requireSession();
    const { commentId } = await params;
    const body = ReviewDecisionRequest.parse(await request.json());
    const comment = await getLatestOwnedComment(commentId, session);
    const [row] = await requireDb().insert(reviewDecisions).values({ commentId, identityId: comment.identityId, ownerId: session.githubUserId, status: body.status, note: body.note ?? null }).onConflictDoUpdate({ target: reviewDecisions.identityId, set: { commentId, ownerId: session.githubUserId, status: body.status, note: body.note ?? null, updatedAt: new Date() } }).returning();
    const decision = ReviewDecision.parse({ commentId, status: row.status, note: row.note, updatedAt: row.updatedAt.toISOString() });
    return NextResponse.json(ReviewDecisionResponse.parse({ schemaVersion: CONTRACT_SCHEMA_VERSION, decision }));
  } catch (error) {
    return handleError(error);
  }
}
