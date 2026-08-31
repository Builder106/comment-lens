import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { WorkerFailurePayload, WorkerFailureResponse } from "../../../../../../contracts";
import { requireDb } from "../../../../../../db";
import { scans } from "../../../../../../db/schema";
import { jsonError } from "../../../../../../lib/server/http";
import { verifyWorkerRequest } from "../../../../../../lib/server/worker-auth";

export async function POST(request: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const raw = await request.text();
  if (!verifyWorkerRequest(raw, request.headers.get("x-comment-lens-signature"), request.headers.get("x-comment-lens-timestamp"))) {
    return jsonError("invalid_signature", "Invalid worker signature", 401);
  }
  try {
    const { scanId } = await params;
    const body = WorkerFailurePayload.parse(JSON.parse(raw));
    if (body.scanId !== scanId || request.headers.get("x-comment-lens-chunk-id") !== `${scanId}:failure`) {
      return jsonError("invalid_request", "Failure identity mismatch", 400);
    }
    const db = requireDb();
    const [scan] = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1);
    if (!scan) return jsonError("not_found", "Scan not found", 404);
    if (request.headers.get("x-comment-lens-repository-id") !== scan.repository) {
      return jsonError("invalid_request", "Repository identity mismatch", 400);
    }
    if (!["queued", "running"].includes(scan.status)) {
      return jsonError("conflict", "Scan is already terminal", 409);
    }
    await db.update(scans).set({ status: "failed", diagnostics: [{ code: "scan_failed", message: body.reason }], completedAt: new Date() }).where(eq(scans.id, scanId));
    return NextResponse.json(WorkerFailureResponse.parse({ schemaVersion: 1, accepted: true, status: "failed" }));
  } catch {
    return jsonError("invalid_request", "Invalid failure notification", 400);
  }
}
