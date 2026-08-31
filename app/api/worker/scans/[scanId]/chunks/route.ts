import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { WorkerChunkPayload, WorkerChunkResponse } from "../../../../../../contracts";
import { requireDb } from "../../../../../../db";
import { chunks, commentIdentities, comments, scans } from "../../../../../../db/schema";
import { verifyWorkerRequest } from "../../../../../../lib/server/worker-auth";

export async function POST(request: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const raw = await request.text();
  if (!verifyWorkerRequest(raw, request.headers.get("x-comment-lens-signature"), request.headers.get("x-comment-lens-timestamp"))) {
    return NextResponse.json({ error: { code: "invalid_signature", message: "Invalid worker signature" } }, { status: 401 });
  }
  try {
    const { scanId } = await params;
    const body = WorkerChunkPayload.parse(JSON.parse(raw));
    if (body.scanId !== scanId || request.headers.get("x-comment-lens-chunk-id") !== body.chunkId) {
      return NextResponse.json({ error: { code: "invalid_request", message: "Chunk identity mismatch" } }, { status: 400 });
    }
    const payloadSha256 = createHash("sha256").update(raw).digest("hex");
    const db = requireDb();
    const [scan] = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1);
    if (!scan || !["queued", "running"].includes(scan.status)) return NextResponse.json({ error: { code: "conflict", message: "Scan is not accepting chunks" } }, { status: 409 });
    if (request.headers.get("x-comment-lens-repository-id") !== scan.repository) return NextResponse.json({ error: { code: "invalid_request", message: "Repository identity mismatch" } }, { status: 400 });
    const existing = await db.select({ hash: chunks.payloadSha256 }).from(chunks).where(and(eq(chunks.scanId, scanId), eq(chunks.chunkId, body.chunkId))).limit(1);
    if (existing[0]) {
      if (existing[0].hash !== payloadSha256) return NextResponse.json({ error: { code: "conflict", message: "Chunk replay hash mismatch" } }, { status: 409 });
      return NextResponse.json(WorkerChunkResponse.parse({ schemaVersion: 1, accepted: true, duplicate: true, chunkId: body.chunkId }));
    }
    const sequence = await db.select({ chunkId: chunks.chunkId }).from(chunks).where(and(eq(chunks.scanId, scanId), eq(chunks.sequence, body.sequence))).limit(1);
    if (sequence[0]) return NextResponse.json({ error: { code: "conflict", message: "Chunk sequence already exists" } }, { status: 409 });
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
    return NextResponse.json({ schemaVersion: 1, error: { code: "invalid_request", message: "Invalid chunk", requestId: randomUUID() } }, { status: 400 });
  }
}
