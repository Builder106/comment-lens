# Deployment runbook

## Workflow target

The scan control plane dispatches the workflow in this repository:

```text
owner: Builder106
repository: comment-lens
workflow: comment-lens-scan.yml
ref: main
upload base URL: https://comment-lens-review.vercel.app
```

The four `COMMENT_LENS_WORKFLOW_*` values are required. The application fails
closed with a 503 before creating a scan if any is missing. A workflow dispatch
failure after scan creation marks that scan as failed.

## Vercel runtime variables

Configure these in Vercel without exposing their values:

- `DATABASE_URL`
- `SESSION_SECRET`
- `ALLOWED_GITHUB_USER_ID`
- `COMMENT_LENS_API_TOKEN_SHA256` and `COMMENT_LENS_API_LOGIN` (optional, for programmatic access)
- `COMMENT_LENS_GITHUB_ORGANIZATIONS` (optional, for explicitly allowed organization installations)
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_CLIENT_SECRET`
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `WORKER_INGEST_SECRET`
- `CRON_SECRET`
- `COMMENT_LENS_WORKFLOW_OWNER`
- `COMMENT_LENS_WORKFLOW_REPOSITORY`
- `COMMENT_LENS_WORKFLOW_ID`
- `COMMENT_LENS_WORKFLOW_REF`
- `GEMINI_API_KEY_1` through `GEMINI_API_KEY_4` (optional, tried in order when a project returns HTTP 429)
- `GEMINI_API_KEY` (optional legacy single-key fallback when no numbered keys are set)
- `GEMINI_MODEL` (optional)

Set `COMMENT_LENS_UPLOAD_BASE_URL` as a GitHub Actions repository variable to
the production URL. The production workflow target values are
`Builder106`, `comment-lens`, `comment-lens-scan.yml`, and `main`.

Production is the default scan target. Set
`COMMENT_LENS_WORKFLOW_TARGET=development` in a local or preview control plane
to send scans to the development endpoint. Set the GitHub Actions variable
`COMMENT_LENS_DEV_UPLOAD_BASE_URL` to that endpoint and the secret
`COMMENT_LENS_DEV_INGESTION_SIGNING_SECRET` to its signing key. The development
deployment must use the same key as `WORKER_INGEST_SECRET` and point
`DATABASE_URL` at the development database.

## GitHub Actions variables and secrets

The `comment-lens-scan.yml` workflow requires these repository settings:

- Secret `COMMENT_LENS_GITHUB_APP_ID`
- Secret `COMMENT_LENS_GITHUB_APP_PRIVATE_KEY`
- Secret `COMMENT_LENS_INGESTION_SIGNING_SECRET`
- Variable `COMMENT_LENS_UPLOAD_BASE_URL`

The App used by the web control plane needs permission to dispatch the
`comment-lens-scan.yml` workflow in the Comment Lens repository. Its scanner
workflow token uses read-only Contents permission and must be installed on each
target repository that can be scanned. The installation account must be visible
to the authorized GitHub user. The workflow checks out the trusted scanner from
Comment Lens, then checks out the selected target repository with the App token;
it does not modify target repositories.

## Database migration

Vercel production builds apply committed Drizzle migrations before building the
app. Preview builds skip migrations. For manual migrations in another
environment, set `DATABASE_URL` to the target PostgreSQL database and run:

```bash
pnpm install --frozen-lockfile
pnpm run db:migrate
```

Do not run `db:generate` in production unless the schema change is
intentional and the resulting migration is reviewed and committed first.

## Production smoke test

After deployment and configuration verification, use an authorized account:

1. Open `/workspace`, connect GitHub, and confirm the target repository is available. The home page is a public project page and does not sign anyone in.
2. Start a scan for `Builder106/comment-lens` on `main`.
3. Confirm the `comment-lens-scan.yml` workflow run starts and completes.
4. Confirm signed chunks are accepted and the scan count matches the manifest.
5. Confirm the review queue loads, a review decision persists, and duplicate
   chunk delivery remains idempotent.
6. Request the optional Gemini assessment if a numbered Gemini key or
   `GEMINI_API_KEY` is configured.
7. Export the scan as JSON and confirm the download completes.

## Failure, retry, and retention behavior

If dispatch fails, the scan is marked failed and the workspace lets you start
another scan. If parsing or upload fails, the workflow's failure job notifies the
control plane and marks the scan failed. Review the GitHub Actions run before
retrying; retries create a new scan attempt rather than changing a completed
scan.

The daily Vercel Cron job deletes expired scans, chunks, and comments. It also
removes review decisions and identities that no retained scan references.
Gemini assessments expire with their scan. Set `CRON_SECRET` in Vercel so the
scheduled request is authenticated. GitHub Actions artifacts expire after one
day. Comment Lens stores comments and short source context only and never
modifies target repositories.
