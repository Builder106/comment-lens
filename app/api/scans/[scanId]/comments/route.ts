import { NextResponse } from "next/server";
import { z } from "zod";
import { CommentPageResponse, CommentQuery, CONTRACT_SCHEMA_VERSION, ReviewDecision } from "../../../../../contracts";
import { listComments } from "../../../../../lib/server/data";
import { requireSession } from "../../../../../lib/server/auth";
import { handleError } from "../../../../../lib/server/http";

function optionalBoolean(value: string | null) {
  if (value === null) return undefined;
  return z.enum(["true", "false"]).parse(value) === "true";
}

export async function GET(request: Request, { params }: { params: Promise<{ scanId: string }> }) {
  try {
    const session = await requireSession();
    const { scanId } = await params;
    const url = new URL(request.url);
    const query = CommentQuery.parse({
      schemaVersion: Number(url.searchParams.get("schemaVersion") ?? CONTRACT_SCHEMA_VERSION),
      scanId: url.searchParams.get("scanId") ?? scanId,
      q: url.searchParams.get("q") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      language: url.searchParams.get("language") ?? undefined,
      kind: url.searchParams.get("kind") ?? undefined,
      path: url.searchParams.get("path") ?? undefined,
      minScore: url.searchParams.has("minScore") ? Number(url.searchParams.get("minScore")) : undefined,
      maxScore: url.searchParams.has("maxScore") ? Number(url.searchParams.get("maxScore")) : undefined,
      author: url.searchParams.get("author") ?? undefined,
      protected: optionalBoolean(url.searchParams.get("protected")),
      generated: optionalBoolean(url.searchParams.get("generated")),
      license: optionalBoolean(url.searchParams.get("license")),
      todo: optionalBoolean(url.searchParams.get("todo")),
      sort: url.searchParams.get("sort") ?? undefined,
      page: url.searchParams.has("page") ? Number(url.searchParams.get("page")) : undefined,
      pageSize: url.searchParams.has("pageSize") ? Number(url.searchParams.get("pageSize")) : undefined,
    });
    if (query.scanId !== scanId) throw new Error("FORBIDDEN");
    const result = await listComments(scanId, query, session);
    const response = CommentPageResponse.parse({
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      items: result.items.map((row) => row.comment.payload),
      decisions: result.items.flatMap((row) => row.review ? [ReviewDecision.parse({ commentId: row.comment.id, status: row.review.status, note: row.review.note, updatedAt: row.review.updatedAt.toISOString() })] : []),
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      hasNextPage: result.hasNextPage,
      nextPage: result.nextPage,
    });
    return NextResponse.json(response);
  } catch (error) {
    return handleError(error);
  }
}
