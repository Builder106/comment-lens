import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ScanCreateRequest, ScanCreateResponse, ScanListQuery, ScanListResponse } from "../../../contracts";
import { requireDb } from "../../../db";
import { repositoryInstallations, scans } from "../../../db/schema";
import { requireSession } from "../../../lib/server/auth";
import { listOwnedScans } from "../../../lib/server/data";
import { getInstallationId, installationClient } from "../../../lib/server/github-app";
import { handleError } from "../../../lib/server/http";

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const query = ScanListQuery.parse({ schemaVersion: Number(url.searchParams.get("schemaVersion") ?? "1"), repositoryId: url.searchParams.get("repositoryId") ?? "", limit: Number(url.searchParams.get("limit") ?? "20") });
    return NextResponse.json(ScanListResponse.parse({ schemaVersion: 1, scans: await listOwnedScans(query.repositoryId, session, query.limit) }));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const input = ScanCreateRequest.parse(await request.json());
    const octokit = await installationClient(session);
    const repositories = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 });
    const repository = repositories.find((candidate) => String(candidate.id) === input.repositoryId);
    if (!repository) throw new Error("FORBIDDEN");
    const resolved = await octokit.rest.repos.getCommit({ owner: repository.owner.login, repo: repository.name, ref: input.ref });
    const installationId = await getInstallationId(session);
    const installationKey = `${installationId}:${repository.id}`;
    const db = requireDb();
    await db.insert(repositoryInstallations).values({ id: installationKey, installationId, ownerLogin: session.login, ownerId: session.githubUserId, repositoryId: String(repository.id), repository: repository.full_name, defaultBranch: repository.default_branch ?? "main", isPrivate: repository.private }).onConflictDoUpdate({ target: repositoryInstallations.id, set: { lastVerifiedAt: new Date() } });
    const scanId = randomUUID();
    await db.insert(scans).values({ id: scanId, ownerId: session.githubUserId, ownerLogin: session.login, repositoryInstallationId: installationKey, repository: repository.full_name, ref: input.ref, resolvedCommit: resolved.data.sha, headCommit: resolved.data.sha, status: "queued", retentionUntil: new Date(Date.now() + 30 * 86_400_000) });
    try {
      await octokit.rest.actions.createWorkflowDispatch({ owner: process.env.COMMENT_LENS_WORKFLOW_OWNER ?? "Builder106", repo: process.env.COMMENT_LENS_WORKFLOW_REPOSITORY ?? "code-wes-projects", workflow_id: process.env.COMMENT_LENS_WORKFLOW_ID ?? "comment-lens-scan.yml", ref: process.env.COMMENT_LENS_WORKFLOW_REF ?? "comment-lens", inputs: { repository: repository.full_name, ref: input.ref, scan_id: scanId, repository_id: String(repository.id) } });
      await db.update(scans).set({ status: "running", workflowDispatchId: scanId }).where(eq(scans.id, scanId));
    } catch (dispatchError) {
      await db.update(scans).set({ status: "failed", diagnostics: [{ code: "scan_failed", message: "Workflow dispatch failed." }], completedAt: new Date() }).where(eq(scans.id, scanId));
      throw dispatchError;
    }
    return NextResponse.json(ScanCreateResponse.parse({ schemaVersion: 1, scanId, status: "running" }), { status: 202 });
  } catch (error) {
    return handleError(error);
  }
}
