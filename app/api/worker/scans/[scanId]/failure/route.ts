import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { WorkerFailurePayload, WorkerFailureResponse } from "../../../../../../contracts";
import { requireDb } from "../../../../../../db";
import { scans } from "../../../../../../db/schema";
import { verifyWorkerRequest } from "../../../../../../lib/server/worker-auth";

export async function POST(request: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const raw = await request.text();
  if (!verifyWorkerRequest(raw, request.headers.get("x-comment-lens-signature"), request.headers.get("x-comment-lens-timestamp"))) {
    return NextResponse.json({ schemaVersion: 1, error: { code: "invalid_signature", message: "Invalid worker signature", requestId: randomUUID() } }, { status: 401 });
  }
  try {
    const { scanId } = await params;
    const body = WorkerFailurePayload.parse(JSON.parse(raw));
    if (body.scanId !== scanId || request.headers.get("x-comment-lens-chunk-id") !== `${scanId}:failure`) {
      return NextResponse.json({ schemaVersion: 1, error: { code: "invalid_request", message: "Failure identity mismatch", requestId: randomUUID() } }, { status: 400 });
    }
    const db = requireDb();
    const [scan] = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1);
    if (!scan) return NextResponse.json({ schemaVersion: 1, error: { code: "not_found", message: "Scan not found", requestId: randomUUID() } }, { status: 404 });
    if (request.headers.get("x-comment-lens-repository-id") !== scan.repository) {
      return NextResponse.json({ schemaVersion: 1, error: { code: "invalid_request", message: "Repository identity mismatch", requestId: randomUUID() } }, { status: 400 });
    }
    if (!["queued", "running"].includes(scan.status)) {
      return NextResponse.json({ schemaVersion: 1, error: { code: "conflict", message: "Scan is already terminal", requestId: randomUUID() } }, { status: 409 });
    }
    await db.update(scans).set({ status: "failed", diagnostics: [{ code: "scan_failed", message: body.reason }], completedAt: new Date() }).where(eq(scans.id, scanId));
    return NextResponse.json(WorkerFailureResponse.parse({ schemaVersion: 1, accepted: true, status: "failed" }));
  } catch {
    return NextResponse.json({ schemaVersion: 1, error: { code: "invalid_request", message: "Invalid failure notification", requestId: randomUUID() } }, { status: 400 });
  }
}
