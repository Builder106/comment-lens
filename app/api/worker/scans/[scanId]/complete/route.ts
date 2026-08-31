import { createHash } from "node:crypto";
import { and, desc, eq, ne, notInArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { WorkerCompletePayload, WorkerCompleteResponse } from "../../../../../../contracts";
import { requireDb } from "../../../../../../db";
import { chunks, comments, scans } from "../../../../../../db/schema";
import { jsonError } from "../../../../../../lib/server/http";
import { verifyWorkerRequest } from "../../../../../../lib/server/worker-auth";

export async function POST(request: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const raw = await request.text();
  if (!verifyWorkerRequest(raw, request.headers.get("x-comment-lens-signature"), request.headers.get("x-comment-lens-timestamp"))) return jsonError("invalid_signature", "Invalid worker signature", 401);
  try {
    const { scanId } = await params;
    const body = WorkerCompletePayload.parse(JSON.parse(raw));
    if (body.scanId !== scanId || body.manifest.scanId !== scanId || request.headers.get("x-comment-lens-repository-id") !== body.manifest.repoId) return jsonError("invalid_request", "Completion identity mismatch", 400);
    const db = requireDb();
    const [scan] = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1);
    if (!scan || scan.repository !== body.manifest.repoId) return jsonError("not_found", "Scan not found", 404);
    if (!["queued", "running"].includes(scan.status)) return jsonError("conflict", "Scan is already terminal", 409);
    const received = await db.select().from(chunks).where(eq(chunks.scanId, scanId));
    const sequences = new Set(received.map((chunk) => chunk.sequence));
    if (received.length !== body.chunkCount || received.some((chunk) => chunk.totalChunks !== body.chunkCount) || sequences.size !== body.chunkCount || [...Array(body.chunkCount).keys()].some((sequence) => !sequences.has(sequence))) return jsonError("conflict", "Incomplete chunk set", 409);
    const storedComments = await db.select({ id: comments.id }).from(comments).where(eq(comments.scanId, scanId));
    if (storedComments.length !== body.commentCount || body.fileCount !== body.manifest.files.length) return jsonError("conflict", "Reported counts do not match stored data", 409);
    if (scan.resolvedCommit && body.manifest.headCommit && scan.resolvedCommit !== body.manifest.headCommit) return jsonError("conflict", "Scan commit does not match the dispatched commit", 409);
    const calculated = createHash("sha256").update(received.sort((a, b) => a.sequence - b.sequence).map((chunk) => chunk.payloadSha256).join("")).digest("hex");
    if (body.contentSha256 !== calculated) return jsonError("conflict", "Artifact hash mismatch", 409);
    const [previousScan] = await db.select({ id: scans.id }).from(scans).where(and(eq(scans.repository, scan.repository), eq(scans.status, "complete"), ne(scans.id, scanId))).orderBy(desc(scans.createdAt)).limit(1);
    if (previousScan) {
      const currentIdentities = await db.select({ identityId: comments.identityId }).from(comments).where(eq(comments.scanId, scanId));
      if (currentIdentities.length === 0) await db.update(comments).set({ stale: true }).where(eq(comments.scanId, previousScan.id));
      else await db.update(comments).set({ stale: true }).where(and(eq(comments.scanId, previousScan.id), notInArray(comments.identityId, currentIdentities.map((item) => item.identityId))));
    }
    await db.update(scans).set({ status: "complete", resolvedCommit: body.manifest.headCommit, commentCount: body.commentCount, fileCount: body.fileCount, chunkCount: body.chunkCount, contentSha256: body.contentSha256, completedAt: new Date() }).where(and(eq(scans.id, scanId), eq(scans.status, "running")));
    return NextResponse.json(WorkerCompleteResponse.parse({ schemaVersion: 1, accepted: true, status: "complete" }));
  } catch {
    return jsonError("invalid_request", "Invalid completion", 400);
  }
}
