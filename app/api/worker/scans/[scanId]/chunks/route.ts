import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { WorkerChunkPayload, WorkerChunkResponse } from "../../../../../../contracts";
import { requireTransactionalDb } from "../../../../../../db";
import { chunks, commentIdentities, comments, scans } from "../../../../../../db/schema";
import { handleError, jsonError } from "../../../../../../lib/server/http";
import { verifyWorkerRequest } from "../../../../../../lib/server/worker-auth";

export async function POST(request: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const raw = await request.text();
  if (!verifyWorkerRequest(raw, request.headers.get("x-comment-lens-signature"), request.headers.get("x-comment-lens-timestamp"))) {
    return jsonError("invalid_signature", "Invalid worker signature", 401);
  }
  let body: WorkerChunkPayload;
  try {
    body = WorkerChunkPayload.parse(JSON.parse(raw));
  } catch {
    return jsonError("invalid_request", "Invalid chunk", 400);
  }
  const { scanId } = await params;
  if (body.scanId !== scanId || request.headers.get("x-comment-lens-chunk-id") !== body.chunkId) {
    return jsonError("invalid_request", "Chunk identity mismatch", 400);
  }
  const payloadSha256 = createHash("sha256").update(raw).digest("hex");
  try {
    const db = requireTransactionalDb();
    const result = await db.transaction(async (tx) => {
      const [scan] = await tx.select().from(scans).where(eq(scans.id, scanId)).limit(1);
      if (!scan) return { kind: "not_found" as const };
      if (!["queued", "running"].includes(scan.status)) return { kind: "terminal" as const };
      if (request.headers.get("x-comment-lens-repository-id") !== scan.repository) return { kind: "repository_mismatch" as const };

      const [existing] = await tx.select({ hash: chunks.payloadSha256 }).from(chunks).where(and(eq(chunks.scanId, scanId), eq(chunks.chunkId, body.chunkId))).limit(1);
      if (existing && existing.hash !== payloadSha256) return { kind: "hash_mismatch" as const };
      if (!existing) {
        const [sequence] = await tx.select({ chunkId: chunks.chunkId }).from(chunks).where(and(eq(chunks.scanId, scanId), eq(chunks.sequence, body.sequence))).limit(1);
        if (sequence) return { kind: "sequence_conflict" as const };
        await tx.insert(chunks).values({ scanId, chunkId: body.chunkId, sequence: body.sequence, totalChunks: body.totalChunks, payloadSha256, payload: body });
      }

      for (const comment of body.comments) {
        const identityId = comment.commentId;
        const symbolAnchor = comment.symbol?.enclosing?.qualifiedName ?? null;
        const normalized = comment.bodyText.trim().toLowerCase();
        const line = comment.rawSpan.start.line0;
        const blame = comment.git.blameSpans.find((span) => span.startLine0 <= line && line <= span.endLine0);
        const todoOnly = /^(?:todo|fixme)(?:\s*[:-].*)?$/i.test(comment.bodyText.trim());
        const license = /copyright|license/i.test(normalized);
        const generated = /generated(?:\s+by|\s+file)|do not edit/i.test(normalized);
        await tx.insert(commentIdentities).values({ id: identityId, repositoryInstallationId: scan.repositoryInstallationId, path: comment.path, kind: comment.kind, normalizedBody: comment.bodyText, symbolAnchor, placement: comment.placement }).onConflictDoNothing();
        await tx.insert(comments).values({ id: comment.commentId, scanId, identityId, path: comment.path, language: comment.language, kind: comment.kind, placement: comment.placement, bodyText: comment.bodyText, rawText: comment.rawText, context: comment.sourceContext, payload: comment, priorityScore: comment.score.priorityScore, protected: comment.score.band === "protected", generated, license, todoOnly, authorName: blame?.authorName ?? null, authorEmail: blame?.authorEmail ?? null }).onConflictDoNothing();
      }
      if (scan.status === "queued") await tx.update(scans).set({ status: "running" }).where(eq(scans.id, scanId));
      return { kind: "accepted" as const, duplicate: Boolean(existing) };
    });

    if (result.kind === "not_found") return jsonError("not_found", "Scan not found", 404);
    if (result.kind === "terminal") return jsonError("conflict", "Scan is not accepting chunks", 409);
    if (result.kind === "repository_mismatch") return jsonError("invalid_request", "Repository identity mismatch", 400);
    if (result.kind === "hash_mismatch") return jsonError("conflict", "Chunk replay hash mismatch", 409);
    if (result.kind === "sequence_conflict") return jsonError("conflict", "Chunk sequence already exists", 409);
    return NextResponse.json(WorkerChunkResponse.parse({ schemaVersion: 1, accepted: true, duplicate: result.duplicate || undefined, chunkId: body.chunkId }));
  } catch (error) {
    return handleError(error);
  }
}
