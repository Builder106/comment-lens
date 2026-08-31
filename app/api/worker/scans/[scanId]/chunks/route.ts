import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { WorkerChunkPayload, WorkerChunkResponse } from "../../../../../../contracts";
import { requireDb } from "../../../../../../db";
import { chunks, commentIdentities, comments, scans } from "../../../../../../db/schema";
import { jsonError } from "../../../../../../lib/server/http";
import { verifyWorkerRequest } from "../../../../../../lib/server/worker-auth";

export async function POST(request: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const raw = await request.text();
  if (!verifyWorkerRequest(raw, request.headers.get("x-comment-lens-signature"), request.headers.get("x-comment-lens-timestamp"))) {
    return jsonError("invalid_signature", "Invalid worker signature", 401);
  }
  try {
    const { scanId } = await params;
    const body = WorkerChunkPayload.parse(JSON.parse(raw));
    if (body.scanId !== scanId || request.headers.get("x-comment-lens-chunk-id") !== body.chunkId) {
      return jsonError("invalid_request", "Chunk identity mismatch", 400);
    }
    const payloadSha256 = createHash("sha256").update(raw).digest("hex");
    const db = requireDb();
    const [scan] = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1);
    if (!scan || !["queued", "running"].includes(scan.status)) return jsonError("conflict", "Scan is not accepting chunks", 409);
    if (request.headers.get("x-comment-lens-repository-id") !== scan.repository) return jsonError("invalid_request", "Repository identity mismatch", 400);
    const existing = await db.select({ hash: chunks.payloadSha256 }).from(chunks).where(and(eq(chunks.scanId, scanId), eq(chunks.chunkId, body.chunkId))).limit(1);
    if (existing[0]) {
      if (existing[0].hash !== payloadSha256) return jsonError("conflict", "Chunk replay hash mismatch", 409);
      return NextResponse.json(WorkerChunkResponse.parse({ schemaVersion: 1, accepted: true, duplicate: true, chunkId: body.chunkId }));
    }
    const sequence = await db.select({ chunkId: chunks.chunkId }).from(chunks).where(and(eq(chunks.scanId, scanId), eq(chunks.sequence, body.sequence))).limit(1);
    if (sequence[0]) return jsonError("conflict", "Chunk sequence already exists", 409);
    await db.insert(chunks).values({ scanId, chunkId: body.chunkId, sequence: body.sequence, totalChunks: body.totalChunks, payloadSha256, payload: body });
    for (const comment of body.comments) {
      const identityId = comment.commentId;
      const symbolAnchor = comment.symbol?.enclosing?.qualifiedName ?? null;
      const normalized = comment.bodyText.trim().toLowerCase();
      const blame = comment.git.blameSpans[0];
      const todoOnly = /^(?:todo|fixme)(?:\s*[:-].*)?$/i.test(comment.bodyText.trim());
      const license = /copyright|license/i.test(normalized);
      const generated = /generated(?:\s+by|\s+file)|do not edit/i.test(normalized);
      await db.insert(commentIdentities).values({ id: identityId, repositoryInstallationId: scan.repositoryInstallationId, path: comment.path, kind: comment.kind, normalizedBody: comment.bodyText, symbolAnchor, placement: comment.placement }).onConflictDoNothing();
      await db.insert(comments).values({ id: comment.commentId, scanId, identityId, path: comment.path, language: comment.language, kind: comment.kind, placement: comment.placement, bodyText: comment.bodyText, rawText: comment.rawText, context: comment.sourceContext, payload: comment, priorityScore: comment.score.priorityScore, protected: comment.score.band === "protected", generated, license, todoOnly, authorName: blame?.authorName ?? null, authorEmail: blame?.authorEmail ?? null }).onConflictDoNothing();
    }
    if (scan.status === "queued") await db.update(scans).set({ status: "running" }).where(eq(scans.id, scanId));
    return NextResponse.json(WorkerChunkResponse.parse({ schemaVersion: 1, accepted: true, chunkId: body.chunkId }));
  } catch {
    return jsonError("invalid_request", "Invalid chunk", 400);
  }
}
