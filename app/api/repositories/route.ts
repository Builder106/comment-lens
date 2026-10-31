import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { listAccessibleRepositories } from "@/lib/server/github-app";
import { CONTRACT_SCHEMA_VERSION } from "@/contracts";
import { handleError } from "@/lib/server/http";
export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const result = await listAccessibleRepositories(session);
    return NextResponse.json({
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      repositories: result.map(({ repository: r }) => ({ id: String(r.id), owner: r.owner.login, name: r.name, defaultBranch: r.default_branch ?? "main", private: r.private, fork: r.fork, archived: r.archived })),
    });
  } catch (error) {
    return handleError(error);
  }
}
