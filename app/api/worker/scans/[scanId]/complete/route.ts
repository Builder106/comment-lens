import { createHash } from "node:crypto";
import { and, desc, eq, ne, notInArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { WorkerCompletePayload, WorkerCompleteResponse } from "../../../../../../contracts";
import { requireTransactionalDb } from "../../../../../../db";
import { chunks, comments, scans } from "../../../../../../db/schema";
import { handleError, jsonError } from "../../../../../../lib/server/http";
import { verifyWorkerRequest } from "../../../../../../lib/server/worker-auth";

function sameParserVersions(stored: unknown, incoming: Record<string, string>) {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return false;
  const values = stored as Record<string, unknown>;
  const entries = Object.entries(incoming);
  return Object.keys(values).length === entries.length && entries.every(([name, version]) => values[name] === version);
}

export async function POST(request: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const raw = await request.text();
  if (!verifyWorkerRequest(raw, request.headers.get("x-comment-lens-signature"), request.headers.get("x-comment-lens-timestamp"))) return jsonError("invalid_signature", "Invalid worker signature", 401);
  let body: WorkerCompletePayload;
  try {
    body = WorkerCompletePayload.parse(JSON.parse(raw));
  } catch {
    return jsonError("invalid_request", "Invalid completion", 400);
  }

  const { scanId } = await params;
  if (body.scanId !== scanId || body.manifest.scanId !== scanId || request.headers.get("x-comment-lens-repository-id") !== body.manifest.repoId) return jsonError("invalid_request", "Completion identity mismatch", 400);

  try {
    const db = requireTransactionalDb();
    const result = await db.transaction(async (tx) => {
      const [scan] = await tx.select().from(scans).where(eq(scans.id, scanId)).limit(1);
      if (!scan || scan.repository !== body.manifest.repoId) return { kind: "not_found" as const };
      if (scan.status === "complete") {
        const sameCompletion = scan.contentSha256 === body.contentSha256
          && scan.commentCount === body.commentCount
          && scan.fileCount === body.fileCount
          && scan.chunkCount === body.chunkCount
          && scan.resolvedCommit === body.manifest.headCommit
          && scan.configHash === body.manifest.configHash
          && scan.extractorVersion === body.manifest.extractorVersion
          && sameParserVersions(scan.parserVersions, body.manifest.parserVersions);
        return sameCompletion ? { kind: "accepted" as const } : { kind: "terminal" as const };
      }
      if (!["queued", "running"].includes(scan.status)) return { kind: "terminal" as const };

      const received = await tx.select().from(chunks).where(eq(chunks.scanId, scanId));
      const sequences = new Set(received.map((chunk) => chunk.sequence));
      if (received.length !== body.chunkCount || received.some((chunk) => chunk.totalChunks !== body.chunkCount) || sequences.size !== body.chunkCount || [...Array(body.chunkCount).keys()].some((sequence) => !sequences.has(sequence))) return { kind: "incomplete" as const };
      const storedComments = await tx.select({ id: comments.id }).from(comments).where(eq(comments.scanId, scanId));
      if (storedComments.length !== body.commentCount || body.fileCount !== body.manifest.files.length) return { kind: "count_mismatch" as const };
      if (scan.resolvedCommit && body.manifest.headCommit && scan.resolvedCommit !== body.manifest.headCommit) return { kind: "commit_mismatch" as const };
      const calculated = createHash("sha256").update(received.sort((a, b) => a.sequence - b.sequence).map((chunk) => chunk.payloadSha256).join("")).digest("hex");
      if (body.contentSha256 !== calculated) return { kind: "hash_mismatch" as const };

      const [previousScan] = await tx.select({ id: scans.id }).from(scans).where(and(eq(scans.repository, scan.repository), eq(scans.status, "complete"), ne(scans.id, scanId))).orderBy(desc(scans.createdAt)).limit(1);
      if (previousScan) {
        const currentIdentities = await tx.select({ identityId: comments.identityId }).from(comments).where(eq(comments.scanId, scanId));
        if (currentIdentities.length === 0) await tx.update(comments).set({ stale: true }).where(eq(comments.scanId, previousScan.id));
        else await tx.update(comments).set({ stale: true }).where(and(eq(comments.scanId, previousScan.id), notInArray(comments.identityId, currentIdentities.map((item) => item.identityId))));
      }

      const [updated] = await tx.update(scans).set({ status: "complete", headCommit: body.manifest.headCommit, resolvedCommit: body.manifest.headCommit, configHash: body.manifest.configHash, extractorVersion: body.manifest.extractorVersion, parserVersions: body.manifest.parserVersions, diagnostics: body.manifest.diagnostics, commentCount: body.commentCount, fileCount: body.fileCount, chunkCount: body.chunkCount, contentSha256: body.contentSha256, completedAt: new Date() }).where(and(eq(scans.id, scanId), eq(scans.status, scan.status))).returning({ id: scans.id });
      return updated ? { kind: "accepted" as const } : { kind: "terminal" as const };
    });

    if (result.kind === "not_found") return jsonError("not_found", "Scan not found", 404);
    if (result.kind === "terminal") return jsonError("conflict", "Scan is already terminal", 409);
    if (result.kind === "incomplete") return jsonError("conflict", "Incomplete chunk set", 409);
    if (result.kind === "count_mismatch") return jsonError("conflict", "Reported counts do not match stored data", 409);
    if (result.kind === "commit_mismatch") return jsonError("conflict", "Scan commit does not match the dispatched commit", 409);
    if (result.kind === "hash_mismatch") return jsonError("conflict", "Artifact hash mismatch", 409);
    return NextResponse.json(WorkerCompleteResponse.parse({ schemaVersion: 1, accepted: true, status: "complete" }));
  } catch (error) {
    return handleError(error);
  }
}
