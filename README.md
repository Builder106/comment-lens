# Comment Lens

Comment Lens is an intelligent code comment review dashboard and extraction workspace. It pairs an AST-driven comment scanner with a task-oriented dashboard to review, triage, and evaluate code comments, actionable TODOs, and architectural notes across repositories.

## Architecture

- **Dashboard**: Next.js App Router workspace with task-first connection, scan state handling, and queue-based comment review.
- **Scanner**: Python-based AST extractor utilizing Tree-sitter with Pygments fallback to extract comments and code context while enforcing strict retention boundaries.
- **Worker & Ingestion**: Signed ingestion pipeline and control-plane dispatch workflow for asynchronous repository analysis.
- **Database**: Drizzle ORM schema backed by PostgreSQL for scan metadata and comment records.

## Project Structure

```
├── app/                  # Next.js App Router routes and layouts
├── components/           # UI components including CommentLensDashboard
├── contracts/            # Type definitions and request/response contracts
├── db/                   # Drizzle ORM schema, migrations, and database client
├── lib/                  # Shared utilities and server helpers
├── scanner/              # Python Tree-sitter comment extraction engine
├── styles/               # CSS tokens and styling
├── tests/                # Unit, integration, and Playwright tests
└── worker/               # Ingestion upload and failure notification scripts
```

## Getting Started

### Prerequisites

- Node.js >= 24 (< 27)
- pnpm >= 11
- Python >= 3.11 (for scanner and worker scripts)

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

### Configuration

Copy `.env.example` to `.env.local` and replace every placeholder with a local
value. Keep secrets and private keys out of source control. The production
deployment uses the same variable names in Vercel; set them in the appropriate
environment instead of committing a `.env` file.

The scan control plane dispatches the workflow in this repository:

```text
owner: Builder106
repository: comment-lens
workflow: comment-lens-scan.yml
ref: main
upload base URL: https://comment-lens-sankofa-forge.vercel.app
```

The four `COMMENT_LENS_WORKFLOW_*` values are required. The application fails
closed with a 503 before creating a scan if any is missing. A workflow dispatch
failure after scan creation marks that scan as failed.

### Verification & Testing

```bash
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run test
pnpm run test:coverage
python3 -m pytest scanner/tests
python3 -m unittest discover -s worker -p 'test_*.py'
pnpm run db:migrate
pnpm run test:integration
pnpm run test:performance
pnpm exec playwright install --with-deps chromium
pnpm run test:e2e
```

The integration and performance suites require a reachable PostgreSQL database.
Set `COMMENT_LENS_TEST_DATABASE_URL` for the test fixture, or `DATABASE_URL`
when running against the application database. The performance test writes its
JSON artifact under `tests/performance/artifacts/`.

### Deployment runbook

#### Vercel runtime variables

Configure these in Vercel without exposing their values:

- `DATABASE_URL`
- `SESSION_SECRET`
- `ALLOWED_GITHUB_USER_ID`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_CLIENT_SECRET`
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `WORKER_INGEST_SECRET`
- `COMMENT_LENS_WORKFLOW_OWNER`
- `COMMENT_LENS_WORKFLOW_REPOSITORY`
- `COMMENT_LENS_WORKFLOW_ID`
- `COMMENT_LENS_WORKFLOW_REF`
- `GEMINI_API_KEY` (optional)
- `GEMINI_MODEL` (optional)

Set `COMMENT_LENS_UPLOAD_BASE_URL` as a GitHub Actions repository variable to
the production URL. The production workflow target values are
`Builder106`, `comment-lens`, `comment-lens-scan.yml`, and `main`.

#### GitHub Actions variables and secrets

The `comment-lens-scan.yml` workflow requires these repository settings:

- Secret `COMMENT_LENS_GITHUB_APP_ID`
- Secret `COMMENT_LENS_GITHUB_APP_PRIVATE_KEY`
- Secret `COMMENT_LENS_INGESTION_SIGNING_SECRET`
- Variable `COMMENT_LENS_UPLOAD_BASE_URL`

The App must have read-only Contents permission and be installed on each target
repository that can be scanned. The installation account must be visible to the
authorized GitHub user. The workflow checks out the trusted scanner from
Comment Lens, then checks out the selected target repository with the App token;
it does not modify target repositories.

#### Database migration

Set `DATABASE_URL` to the target PostgreSQL database, install dependencies, and
apply committed Drizzle migrations:

```bash
pnpm install --frozen-lockfile
pnpm run db:migrate
```

Run this before serving a deployment that depends on a new migration. Do not
run `db:generate` in production unless the schema change is intentional and the
resulting migration is reviewed and committed first.

#### Production smoke test

After deployment and configuration verification, use an authorized account:

1. Connect GitHub and confirm the target repository is available.
2. Start a scan for `Builder106/comment-lens` on `main`.
3. Confirm the `comment-lens-scan.yml` workflow run starts and completes.
4. Confirm signed chunks are accepted and the scan count matches the manifest.
5. Confirm the review queue loads, a review decision persists, and duplicate
   chunk delivery remains idempotent.
6. Request the optional Gemini assessment if `GEMINI_API_KEY` is configured.
7. Export the scan as JSON and confirm the download completes.

#### Failure, retry, and retention behavior

If dispatch fails, the scan is marked failed and the dashboard exposes a retry
action. If parsing or upload fails, the workflow's failure job notifies the
control plane and marks the scan failed. Review the GitHub Actions run before
retrying; retries create a new scan attempt rather than changing a completed
scan.

Scan records set a retention timestamp 30 days after creation. Workflow scan
artifacts are retained by GitHub Actions for one day. Comment Lens stores
comments and short source context only; it does not modify target repositories.

## License

MIT
