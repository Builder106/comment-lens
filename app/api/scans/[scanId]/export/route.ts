import { NextResponse } from "next/server";
import { requireSession } from "../../../../../lib/server/auth";
import { getOwnedScan, listComments } from "../../../../../lib/server/data";
import { handleError } from "../../../../../lib/server/http";

export async function GET(_: Request, { params }: { params: Promise<{ scanId: string }> }) {
  try {
    const session = await requireSession();
    const { scanId } = await params;
    await getOwnedScan(scanId, session);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode("["));
          let page = 1;
          let first = true;
          while (true) {
            const result = await listComments(scanId, { page, pageSize: 500, sort: "path" }, session);
            for (const row of result.items) {
              const review = row.review ? { commentId: row.comment.id, status: row.review.status, note: row.review.note, updatedAt: row.review.updatedAt.toISOString() } : null;
              controller.enqueue(encoder.encode(`${first ? "" : ","}${JSON.stringify({ comment: row.comment.payload, review })}`));
              first = false;
            }
            if (!result.hasNextPage) break;
            page = result.nextPage ?? page + 1;
          }
          controller.enqueue(encoder.encode("]"));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return new NextResponse(stream, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="comment-lens-export.json"' } });
  } catch (error) {
    return handleError(error);
  }
}
