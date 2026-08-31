import { NextResponse } from "next/server";
import { requireSession } from "../../../lib/server/auth";
import { installationClient } from "../../../lib/server/github-app";
import { CONTRACT_SCHEMA_VERSION } from "../../../contracts";
import { handleError } from "../../../lib/server/http";
export async function GET() { try { const session = await requireSession(); const octokit = await installationClient(session); const result = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 }); return NextResponse.json({ schemaVersion: CONTRACT_SCHEMA_VERSION, repositories: result.map((r) => ({ id: String(r.id), owner: r.owner.login, name: r.name, defaultBranch: r.default_branch ?? "main", private: r.private })) }); } catch (error) { return handleError(error); } }
