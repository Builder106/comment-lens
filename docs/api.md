# Hosted API

The hosted API lists repositories, starts scans, reads results, and records review decisions. Scripts use a bearer token with the same owner checks as the review workspace. Browser sessions continue to use the GitHub login cookie.

## Configure access

Create a random token with at least 32 bytes of entropy in a password manager. Use 64 hexadecimal characters or 43 to 256 base64url characters. Store it as `COMMENT_LENS_API_TOKEN` in the calling process or its secret store. Keep it out of source control and command arguments.

Calculate its SHA-256 digest from the environment:

```bash
python3 -c 'import hashlib, os; print(hashlib.sha256(os.environ["COMMENT_LENS_API_TOKEN"].encode()).hexdigest())'
```

Set these server variables in the deployment settings:

| Variable | Value |
| --- | --- |
| `COMMENT_LENS_API_TOKEN_SHA256` | The token's 64-character SHA-256 digest. Store only the digest on the server. |
| `COMMENT_LENS_API_LOGIN` | The login of the existing authorized owner, such as `Builder106`. |
| `ALLOWED_GITHUB_USER_ID` | The same numeric GitHub user ID used by browser authentication. |
| `COMMENT_LENS_GITHUB_ORGANIZATIONS` | Optional comma-separated organization logins, such as `SankofaForge`. |

Install the GitHub App on each selected repository. Organization access is an explicit grant to the one authorized owner. Other App installations remain inaccessible. Listing includes private repositories available to the App and paginates GitHub responses. It returns `fork` and `archived` metadata for client selection.

API credentials grant the authorized owner's hosted API access, including review mutations and optional AI requests. Worker ingestion and retention endpoints keep their separate signing and cron credentials. API authentication is disabled until all required API settings are valid. An invalid Authorization header returns 401, even when a browser cookie is also present.

Set `GEMINI_API_KEY_1` through `GEMINI_API_KEY_4` in the order to use them. The client can send the current key index in `x-comment-lens-gemini-key-index`. Comment Lens tries that key first and moves to the next configured key after HTTP 429. A successful response returns the index for the next batch. If you set no numbered keys, the app uses `GEMINI_API_KEY`. Do not send key values in API requests or commit them.

The API token has no automatic expiry. Replace or remove `COMMENT_LENS_API_TOKEN_SHA256` and redeploy to rotate or revoke it. Changing the API digest leaves browser sessions valid.

For this deployment, set the GitHub Actions variable `COMMENT_LENS_UPLOAD_BASE_URL` to `https://comment-lens-review.vercel.app`. Set the GitHub App callback URL to `https://comment-lens-review.vercel.app/api/auth/github/callback`. Worker ingestion routes must be reachable without an interactive Vercel login. Deployment protection can block workers even when an authenticated browser can open the dashboard.

## Use the client

The client uses Node.js 24 or newer and has no package dependencies. Configure `COMMENT_LENS_API_TOKEN` in its environment. Set `COMMENT_LENS_API_URL` to override the default `https://comment-lens-review.vercel.app`. HTTP is accepted only for a loopback host. The client refuses redirects and requests to other origins.

```bash
node scripts/hosted-api.mjs GET /api/repositories
node scripts/hosted-api.mjs POST /api/scans '{"schemaVersion":1,"repositoryId":"REPOSITORY_ID","ref":"main"}'
node scripts/hosted-api.mjs GET /api/scans/SCAN_ID
node scripts/hosted-api.mjs GET '/api/scans/SCAN_ID/comments?page=1&pageSize=100'
node scripts/hosted-api.mjs GET /api/scans/SCAN_ID/export > scan-export.json
node scripts/hosted-api.mjs PATCH /api/comments/COMMENT_ID/review '{"schemaVersion":1,"status":"keep","note":"Checked against the implementation"}'
```

Substitute IDs returned by the API. For comments, follow `nextPage` while `hasNextPage` is true. Scan creation returns HTTP 202 with `scanId` and `status`. Poll `GET /api/scans/{scanId}` until `status` is `complete` or `failed`. Read `diagnostics` on failure. A request timeout can occur after a scan was created, so inspect recent scans before retrying a POST.

## Scan both accounts

Preview the repository selection:

```bash
node scripts/hosted-api.mjs fleet Builder106 SankofaForge
```

Queue the selected repositories:

```bash
node scripts/hosted-api.mjs fleet Builder106 SankofaForge --execute
```

Fleet mode includes private original repositories, excludes forks, `Builder106/Builder106`, and repositories named `.github`, and uses each repository's default branch. An owner with no visible repositories stops the operation before any scan is queued. Missing fork metadata also stops it. The preview covers repositories visible to the App; compare it with your GitHub inventory to check for omissions caused by App permissions.

Execution submits one scan at a time and prints newline-delimited JSON with each scan ID or request error. It continues after a repository fails and exits with status 1 if any request failed. It does not retry requests or wait for scan completion. Repeating `--execute` creates new scans. Fleet mode does not call Gemini or change repository files.

## Endpoint reference

Send `Authorization: Bearer TOKEN` on every request and `Content-Type: application/json` for JSON bodies. Successful object responses include `schemaVersion: 1`; export returns an array of `{comment, review}` records. Request and response schemas are in [`contracts/index.ts`](../contracts/index.ts).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/repositories` | List repositories from authorized App installations. |
| POST | `/api/scans` | Start a scan with `schemaVersion`, `repositoryId`, and `ref`. |
| GET | `/api/scans?repositoryId=ID&limit=20` | List recent owned scans for a repository. Maximum limit: 50. |
| GET | `/api/scans/{scanId}` | Read status, counts, diagnostics, and the resolved commit. |
| GET | `/api/scans/{scanId}/comments` | Read comments and decisions. Maximum page size: 100. |
| GET | `/api/scans/{scanId}/export` | Stream comments and review decisions as JSON. |
| PATCH | `/api/comments/{commentId}/review` | Record `keep`, `rewrite`, `delete`, or `unsure`, with an optional note. |
| GET | `/api/scans/{scanId}/improvements` | Read stored AI suggestions without a provider request. |
| POST | `/api/scans/{scanId}/improvements` | Explicitly request AI suggestions for 1 to 5 comment IDs. |
| POST | `/api/comments/{commentId}/assist` | Explicitly request help for one finding. |
| POST | `/api/comments/{commentId}/assessment` | Explicitly request an AI style assessment. |

AI POST endpoints can incur provider costs and send comment data to Gemini. They retain their existing context controls and ownership checks; see [assisted review](assisted-review.md). API errors use `{schemaVersion: 1, error: {code, message, requestId}}`. Typical statuses are 400 for invalid input, 401 for authentication failure, 403 for denied access, 404 for an unavailable owned resource, 429 when every configured Gemini project is rate-limited, and 503 for missing scan configuration. Worker failures appear in the scan record after dispatch.
