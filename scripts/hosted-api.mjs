import { pathToFileURL } from "node:url";

export function selectFleetRepositories(repositories, owners) {
  if (!owners.length) throw new Error("Specify at least one repository owner");
  const selectedOwners = new Set(owners.map((owner) => owner.toLowerCase()));
  for (const owner of selectedOwners) {
    if (!repositories.some((repository) => repository.owner.toLowerCase() === owner)) {
      throw new Error(`No accessible repositories for ${owner}; check the App installation and organization configuration`);
    }
  }
  return repositories.filter((repository) => selectedOwners.has(repository.owner.toLowerCase())
    && repository.fork === false
    && repository.name !== ".github"
    && `${repository.owner}/${repository.name}`.toLowerCase() !== "builder106/builder106");
}

export async function apiRequest(method, path, body, config = process.env) {
  const base = new URL(config.COMMENT_LENS_API_URL ?? "https://comment-lens-review.vercel.app");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (base.username || base.password || (base.protocol !== "https:" && !(base.protocol === "http:" && loopback))) {
    throw new Error("Use an HTTPS API URL, or HTTP on localhost");
  }
  const url = new URL(path, base);
  if (url.origin !== base.origin || !url.pathname.startsWith("/api/")) throw new Error("Use a same-origin /api/ path");
  const token = config.COMMENT_LENS_API_TOKEN;
  if (!token || !/^[A-Za-z0-9_-]{43,256}$/.test(token)) throw new Error("Set COMMENT_LENS_API_TOKEN to a valid API token");
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`API request failed with HTTP ${response.status}`);
  return response.json();
}

export async function runFleet(owners, execute, request = apiRequest, write = (record) => console.log(JSON.stringify(record))) {
  const result = await request("GET", "/api/repositories");
  if (result.repositories.some((repository) => typeof repository.fork !== "boolean")) {
    throw new Error("The server must expose repository fork metadata before a fleet scan");
  }
  const repositories = selectFleetRepositories(result.repositories, owners);
  write({ mode: execute ? "execute" : "preview", repositoryCount: repositories.length, repositories: repositories.map((repository) => `${repository.owner}/${repository.name}`) });
  if (!execute) return 0;
  let failures = 0;
  for (const repository of repositories) {
    const name = `${repository.owner}/${repository.name}`;
    try {
      const scan = await request("POST", "/api/scans", { schemaVersion: 1, repositoryId: repository.id, ref: repository.defaultBranch });
      write({ repository: name, ...scan });
    } catch (error) {
      failures++;
      write({ repository: name, error: error instanceof Error ? error.message : "Scan request failed" });
    }
  }
  return failures ? 1 : 0;
}

async function main(args) {
  if (args[0] === "fleet") {
    process.exitCode = await runFleet(args.slice(1).filter((arg) => arg !== "--execute"), args.includes("--execute"));
    return;
  }
  const [method, path, json] = args;
  if (!method || !path || args.length > 3 || !["GET", "POST", "PATCH"].includes(method)) {
    throw new Error("Usage: node scripts/hosted-api.mjs GET|POST|PATCH /api/path [json], or fleet OWNER... [--execute]");
  }
  console.log(JSON.stringify(await apiRequest(method, path, json === undefined ? undefined : JSON.parse(json))));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : "API request failed");
    process.exitCode = 1;
  });
}
