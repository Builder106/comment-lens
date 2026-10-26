import { createPrivateKey, createSign } from "node:crypto";
import { Octokit } from "octokit";
import type { SessionPayload } from "./auth";
function required(name: string) { const value = process.env[name]?.replace(/\\n/g, "\n"); if (!value) throw new Error(`${name} is not configured`); return value; }
function appJwt() { const now = Math.floor(Date.now() / 1000); const unsigned = `${Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: required("GITHUB_APP_ID") })).toString("base64url")}`; const signer = createSign("RSA-SHA256"); signer.update(unsigned); return `${unsigned}.${signer.sign(createPrivateKey(required("GITHUB_APP_PRIVATE_KEY"))).toString("base64url")}`; }
export interface Installation { id: number; account: { login?: string; id?: number; type?: string } | null; suspended_at?: string | null }
async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> { const response = await fetch(`https://api.github.com${path}`, { ...init, headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28", ...init?.headers }, cache: "no-store" }); if (!response.ok) throw new Error(`GitHub API request failed with status ${response.status}`); return (await response.json()) as T; }

export function authorizedInstallations(installations: Installation[], session: SessionPayload): Installation[] {
  if (session.githubUserId !== process.env.ALLOWED_GITHUB_USER_ID) throw new Error("FORBIDDEN");
  const organizations = new Set((process.env.COMMENT_LENS_GITHUB_ORGANIZATIONS ?? "").split(",").map((name) => name.trim().toLowerCase()).filter(Boolean));
  return installations.filter((item) => !item.suspended_at && (
    item.account?.id?.toString() === session.githubUserId
    || (item.account?.type === "Organization" && organizations.has(item.account.login?.toLowerCase() ?? ""))
  ));
}

async function listInstallations(session: SessionPayload): Promise<Installation[]> {
  const installations: Installation[] = [];
  for (let page = 1; ; page++) {
    const batch = await api<Installation[]>(`/app/installations?per_page=100&page=${page}`, appJwt());
    installations.push(...batch);
    if (batch.length < 100) break;
  }
  return authorizedInstallations(installations, session);
}

async function clientForInstallation(installation: Installation): Promise<Octokit> {
  const result = await api<{ token: string }>(`/app/installations/${installation.id}/access_tokens`, appJwt(), { method: "POST" });
  return new Octokit({ auth: result.token });
}

export async function installationClient(session: SessionPayload, owner = session.login): Promise<Octokit> {
  const installation = (await listInstallations(session)).find((item) => item.account?.login?.toLowerCase() === owner.toLowerCase());
  if (!installation) throw new Error("FORBIDDEN");
  return clientForInstallation(installation);
}

export async function listAccessibleRepositories(session: SessionPayload) {
  const installations = await listInstallations(session);
  const batches = await Promise.all(installations.map(async (installation) => {
    const octokit = await clientForInstallation(installation);
    const repositories = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 });
    return repositories.map((repository) => ({ repository, installationId: installation.id }));
  }));
  return batches.flat();
}
