import { count, eq, inArray, lte, notExists } from "drizzle-orm";
import { requireTransactionalDb } from "../../db";
import { assessments, chunks, commentIdentities, comments, reviewDecisions, scans } from "../../db/schema";

export async function purgeExpiredData(now = new Date()) {
  const db = requireTransactionalDb();

  return db.transaction(async (tx) => {
    const expiredScanIds = tx.select({ id: scans.id }).from(scans).where(lte(scans.retentionUntil, now));
    const [expiredScanCount] = await tx.select({ value: count() }).from(scans).where(lte(scans.retentionUntil, now));

    await tx.delete(chunks).where(inArray(chunks.scanId, expiredScanIds));
    await tx.delete(comments).where(inArray(comments.scanId, expiredScanIds));
    await tx.delete(scans).where(inArray(scans.id, expiredScanIds));

    const expiredAssessments = await tx.delete(assessments).where(lte(assessments.retentionUntil, now)).returning({ id: assessments.identityId });
    const orphanIdentityIds = tx.select({ id: commentIdentities.id }).from(commentIdentities).where(
      notExists(tx.select({ id: comments.id }).from(comments).where(eq(comments.identityId, commentIdentities.id))),
    );

    await tx.delete(reviewDecisions).where(inArray(reviewDecisions.identityId, orphanIdentityIds));
    await tx.delete(assessments).where(inArray(assessments.identityId, orphanIdentityIds));
    const removedIdentities = await tx.delete(commentIdentities).where(inArray(commentIdentities.id, orphanIdentityIds)).returning({ id: commentIdentities.id });

    return {
      expiredScans: Number(expiredScanCount?.value ?? 0),
      expiredAssessments: expiredAssessments.length,
      removedIdentities: removedIdentities.length,
    };
  });
}
