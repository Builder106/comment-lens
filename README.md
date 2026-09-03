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

### Verification & Testing

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run test:coverage
```

## License

MIT
