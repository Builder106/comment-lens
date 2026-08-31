import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, ne, notInArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { WorkerCompletePayload, WorkerCompleteResponse } from "../../../../../../contracts";
import { requireDb } from "../../../../../../db";
import { chunks, comments, scans } from "../../../../../../db/schema";
import { verifyWorkerRequest } from "../../../../../../lib/server/worker-auth";

export async function POST(request: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const raw = await request.text();
  if (!verifyWorkerRequest(raw, request.headers.get("x-comment-lens-signature"), request.headers.get("x-comment-lens-timestamp"))) return NextResponse.json({ error: { code: "invalid_signature", message: "Invalid worker signature" } }, { status: 401 });
  try {
    const { scanId } = await params;
    const body = WorkerCompletePayload.parse(JSON.parse(raw));
    if (body.scanId !== scanId || body.manifest.scanId !== scanId || request.headers.get("x-comment-lens-repository-id") !== body.manifest.repoId) return NextResponse.json({ error: { code: "invalid_request", message: "Completion identity mismatch" } }, { status: 400 });
    const db = requireDb();
    const [scan] = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1);
    if (!scan || scan.repository !== body.manifest.repoId) return NextResponse.json({ error: { code: "not_found", message: "Scan not found" } }, { status: 404 });
    if (!["queued", "running"].includes(scan.status)) return NextResponse.json({ error: { code: "conflict", message: "Scan is already terminal" } }, { status: 409 });
    const received = await db.select().from(chunks).where(eq(chunks.scanId, scanId));
    const sequences = new Set(received.map((chunk) => chunk.sequence));
    if (received.length !== body.chunkCount || received.some((chunk) => chunk.totalChunks !== body.chunkCount) || sequences.size !== body.chunkCount || [...Array(body.chunkCount).keys()].some((sequence) => !sequences.has(sequence))) return NextResponse.json({ error: { code: "conflict", message: "Incomplete chunk set" } }, { status: 409 });
    const storedComments = await db.select({ id: comments.id }).from(comments).where(eq(comments.scanId, scanId));
    if (storedComments.length !== body.commentCount || body.fileCount !== body.manifest.files.length) return NextResponse.json({ error: { code: "conflict", message: "Reported counts do not match stored data" } }, { status: 409 });
    if (scan.resolvedCommit && body.manifest.headCommit && scan.resolvedCommit !== body.manifest.headCommit) return NextResponse.json({ error: { code: "conflict", message: "Scan commit does not match the dispatched commit" } }, { status: 409 });
    const calculated = createHash("sha256").update(received.sort((a, b) => a.sequence - b.sequence).map((chunk) => chunk.payloadSha256).join("")).digest("hex");
    if (body.contentSha256 !== calculated) return NextResponse.json({ error: { code: "conflict", message: "Artifact hash mismatch" } }, { status: 409 });
    const [previousScan] = await db.select({ id: scans.id }).from(scans).where(and(eq(scans.repository, scan.repository), eq(scans.status, "complete"), ne(scans.id, scanId))).orderBy(desc(scans.createdAt)).limit(1);
    if (previousScan) {
      const currentIdentities = await db.select({ identityId: comments.identityId }).from(comments).where(eq(comments.scanId, scanId));
      if (currentIdentities.length === 0) await db.update(comments).set({ stale: true }).where(eq(comments.scanId, previousScan.id));
      else await db.update(comments).set({ stale: true }).where(and(eq(comments.scanId, previousScan.id), notInArray(comments.identityId, currentIdentities.map((item) => item.identityId))));
    }
    await db.update(scans).set({ status: "complete", resolvedCommit: body.manifest.headCommit, commentCount: body.commentCount, fileCount: body.fileCount, chunkCount: body.chunkCount, contentSha256: body.contentSha256, completedAt: new Date() }).where(and(eq(scans.id, scanId), eq(scans.status, "running")));
    return NextResponse.json(WorkerCompleteResponse.parse({ schemaVersion: 1, accepted: true, status: "complete" }));
  } catch {
    return NextResponse.json({ schemaVersion: 1, error: { code: "invalid_request", message: "Invalid completion", requestId: randomUUID() } }, { status: 400 });
  }
}
