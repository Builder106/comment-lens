import { and, asc, count, desc, eq, exists, gt, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { requireDb } from "@/db";
import { assessments, chunks, commentIdentities, comments, repositoryInstallations, reviewDecisions, scanImprovements, scans } from "@/db/schema";
import { ScanRecord as ScanRecordSchema, type CommentQuery } from "@/contracts";
import type { SessionPayload } from "./auth";
import { SCAN_IMPROVEMENT_PROMPT_VERSION } from "./scan-improvement-version";

type GeminiReviewFilter = "candidates" | "suggest_rewrite" | "needs_human_review";

export type CommentListOptions = Partial<Pick<CommentQuery, "q" | "status" | "language" | "kind" | "path" | "minScore" | "maxScore" | "author" | "protected" | "generated" | "license" | "todo" | "sort">> & {
  page: number;
  pageSize: number;
  geminiReview?: GeminiReviewFilter;
};

export function assertScanOwner(scan: { ownerId: string }, session: SessionPayload) {
  if (scan.ownerId !== session.githubUserId) throw new Error("FORBIDDEN");
}

export async function getOwnedScan(scanId: string, session: SessionPayload) {
  const db = requireDb();
  const [scan] = await db.select().from(scans).where(and(eq(scans.id, scanId), eq(scans.ownerId, session.githubUserId))).limit(1);
  if (!scan) throw new Error("NOT_FOUND");
  return scan;
}

export function scanResponse(scan: typeof scans.$inferSelect) {
  return ScanRecordSchema.parse({
    schemaVersion: 1,
    scanId: scan.id,
    repository: scan.repository,
    ref: scan.ref,
    resolvedCommit: scan.resolvedCommit,
    status: scan.status,
    commentCount: scan.commentCount,
    fileCount: scan.fileCount,
    chunkCount: scan.chunkCount,
    diagnostics: Array.isArray(scan.diagnostics) ? scan.diagnostics : [],
    createdAt: scan.createdAt.toISOString(),
    completedAt: scan.completedAt?.toISOString() ?? null,
  });
}

export async function listOwnedScans(repositoryId: string, session: SessionPayload, limit: number) {
  const db = requireDb();
  const rows = await db.select({ scan: scans }).from(scans).innerJoin(repositoryInstallations, eq(repositoryInstallations.id, scans.repositoryInstallationId)).where(and(eq(scans.ownerId, session.githubUserId), eq(repositoryInstallations.ownerId, session.githubUserId), eq(repositoryInstallations.repositoryId, repositoryId))).orderBy(desc(scans.createdAt), desc(scans.id)).limit(limit);
  return rows.map(({ scan }) => scanResponse(scan));
}

export async function getOwnedComment(commentId: string, scanId: string, session: SessionPayload) {
  await getOwnedScan(scanId, session);
  const db = requireDb();
  const [comment] = await db.select().from(comments).where(and(eq(comments.id, commentId), eq(comments.scanId, scanId))).limit(1);
  if (!comment) throw new Error("NOT_FOUND");
  return comment;
}

export async function getLatestOwnedComment(commentId: string, session: SessionPayload) {
  const db = requireDb();
  const [row] = await db.select({ comment: comments }).from(comments).innerJoin(scans, eq(scans.id, comments.scanId)).where(and(eq(comments.id, commentId), eq(scans.ownerId, session.githubUserId))).orderBy(desc(scans.createdAt)).limit(1);
  if (!row) throw new Error("NOT_FOUND");
  return row.comment;
}

function commentConditions(scanId: string, options: CommentListOptions, db: ReturnType<typeof requireDb>, ownerId?: string) {
  const conditions = [eq(comments.scanId, scanId)];
  if (options.q) {
    const term = `%${options.q}%`;
    conditions.push(or(ilike(comments.bodyText, term), ilike(comments.path, term), ilike(comments.authorName, term), ilike(comments.authorEmail, term), sql`${comments.payload}->'symbol'->'enclosing'->>'name' ILIKE ${term}`)!);
  }
  if (options.status === "unreviewed") conditions.push(isNull(reviewDecisions.status));
  if (options.status && options.status !== "unreviewed") conditions.push(eq(reviewDecisions.status, options.status));
  if (options.language) conditions.push(eq(comments.language, options.language));
  if (options.kind) conditions.push(eq(comments.kind, options.kind));
  if (options.path) conditions.push(ilike(comments.path, `%${options.path}%`));
  if (options.minScore !== undefined) conditions.push(gte(comments.priorityScore, options.minScore));
  if (options.maxScore !== undefined) conditions.push(lte(comments.priorityScore, options.maxScore));
  if (options.author) conditions.push(or(ilike(comments.authorName, `%${options.author}%`), ilike(comments.authorEmail, `%${options.author}%`))!);
  if (options.protected !== undefined) conditions.push(eq(comments.protected, options.protected));
  if (options.generated !== undefined) conditions.push(eq(comments.generated, options.generated));
  if (options.license !== undefined) conditions.push(eq(comments.license, options.license));
  if (options.todo !== undefined) conditions.push(eq(comments.todoOnly, options.todo));
  if (options.geminiReview) {
    const outcome = sql<string>`${scanImprovements.payload}->>'outcome'`;
    const outcomeCondition = options.geminiReview === "candidates"
      ? inArray(outcome, ["suggest_rewrite", "needs_human_review"])
      : eq(outcome, options.geminiReview);
    const improvementConditions = [
      eq(scanImprovements.scanId, scanId),
      eq(scanImprovements.commentId, comments.id),
      eq(scanImprovements.promptVersion, SCAN_IMPROVEMENT_PROMPT_VERSION),
      gt(scanImprovements.retentionUntil, new Date()),
      outcomeCondition,
    ];
    if (ownerId) improvementConditions.push(eq(scanImprovements.ownerId, ownerId));
    conditions.push(exists(db.select({ commentId: scanImprovements.commentId }).from(scanImprovements).where(and(...improvementConditions))));
  }
  return conditions;
}

function orderByFor(sort: CommentListOptions["sort"]) {
  if (sort === "path") return [asc(comments.path), sql`CAST(${comments.payload}->'rawSpan'->'start'->>'line0' AS INTEGER) ASC`, asc(comments.id)];
  if (sort === "age") return [desc(comments.createdAt), desc(comments.id)];
  if (sort === "status") return [sql`CASE WHEN ${reviewDecisions.status} IS NULL THEN 0 ELSE 1 END ASC`, asc(reviewDecisions.status), asc(comments.path), asc(comments.id)];
  return [sql`${comments.priorityScore} DESC NULLS LAST`, asc(comments.path), asc(comments.id)];
}

export async function listComments(scanId: string, options: CommentListOptions, session?: SessionPayload) {
  const db = requireDb();
  if (session) await getOwnedScan(scanId, session);
  const conditions = commentConditions(scanId, options, db, session?.githubUserId);
  const offset = (options.page - 1) * options.pageSize;
  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(comments).leftJoin(reviewDecisions, eq(reviewDecisions.identityId, comments.identityId)).where(and(...conditions)),
    db.select({ comment: comments, review: reviewDecisions }).from(comments).leftJoin(reviewDecisions, eq(reviewDecisions.identityId, comments.identityId)).where(and(...conditions)).orderBy(...orderByFor(options.sort)).limit(options.pageSize).offset(offset),
  ]);
  const total = Number(totalRow[0]?.value ?? 0);
  return { items: rows, total, page: options.page, pageSize: options.pageSize, hasNextPage: offset + rows.length < total, nextPage: offset + rows.length < total ? options.page + 1 : null };
}

export { assessments, chunks, commentIdentities, comments, repositoryInstallations, reviewDecisions, scans };
