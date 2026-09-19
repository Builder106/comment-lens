# Evolve Comment Lens into a developer utility

Comment Lens will evolve into a local-first developer utility for keeping code comments useful over time. It will identify comments that deserve attention, explain why, and let teams enforce selected maintenance rules without executing or modifying target repositories.

**Content type**: Conceptual roadmap

**Goal**: Define the path from a hosted comment review dashboard to a local, CI, and team maintenance utility

**Audience**: Developers, repository maintainers, and contributors planning Comment Lens work

## Product direction

The core promise is: Comment Lens tells developers which comments deserve attention before they become maintenance debt.

Comment Lens should not become a general artificial intelligence code reviewer. Its durable advantage is explainable comment maintenance built on repository structure, source context, Git history, and deterministic rules. Artificial intelligence can explain or suggest changes for selected findings, but it should not decide whether a change blocks Continuous Integration (CI).

## Current foundation

The repository already supports the main parts of this direction:

- An Abstract Syntax Tree (AST)-aware scanner with a Pygments fallback
- Deterministic priority scoring with rule evidence and protected-comment handling
- Git blame, source context, parser metadata, and stable comment identities
- JSON and newline-delimited JSON (NDJSON) scan manifests
- A read-only GitHub Actions workflow with signed ingestion
- A hosted dashboard with repository connection, scan progress, filtering, review decisions, and export
- Optional Gemini assessment that remains separate from deterministic scoring

The existing hosted workflow remains the team aggregation layer. The next product slice should make the scanner useful without GitHub, PostgreSQL, or the dashboard.

## Product surfaces

Comment Lens should support three related surfaces:

| Surface | Primary audience | Required dependency |
| --- | --- | --- |
| Local command-line interface | Individual developers | The repository and the scanner package |
| CI check | Engineering teams | A CI runner and the repository checkout |
| Hosted dashboard | Maintainers and technical leads | GitHub App, PostgreSQL, and the deployed service |

The local command-line interface must remain useful when the hosted service is unavailable. Uploading results should require an explicit action.

## Phase 1: local command-line utility

Make the scanner useful during development and before a commit. Preserve `comment-lens-scan` as a compatibility alias for the current workflow, then add a broader `comment-lens` command with subcommands.

The first useful command is:

```bash
comment-lens check --changed origin/main...HEAD --fail-on high
```

Phase 1 should deliver:

- A `comment-lens` command with `scan`, `check`, and `export` entry points
- Changed-file and changed-comment selection based on Git revisions
- Stable exit codes for clean results, policy findings, and scanner failures
- A repository configuration file for exclusions, rule thresholds, and policy choices
- Static Analysis Results Interchange Format (SARIF), Markdown, and JSON output
- Evidence for each finding, including the rule, source location, and relevant context
- A local-only default that does not require an account, database, or network connection

Initial rules should focus on maintenance risk rather than prose style:

- Unresolved `TODO`, `FIXME`, and `HACK` comments
- Comments that duplicate an enclosing symbol
- Comments that exceed a configured length threshold
- Comments with repeated uncertainty or promotional language
- Protected, generated, or excluded comments that must not receive normal findings

The first release should report findings by default. It should block only when a repository explicitly selects a rule or severity threshold.

## Phase 2: CI adoption and baselines

Let teams adopt Comment Lens without fixing every historical comment at once. A baseline separates existing maintenance debt from findings introduced by a new change.

Phase 2 should deliver:

- A documented GitHub Actions integration for pull requests and scheduled scans
- Pull Request annotations and job summaries from SARIF and Markdown output
- Baseline creation and comparison commands
- Advisory and blocking modes with per-rule thresholds
- Examples for changed-file checks, full scans, and scheduled maintenance reports
- A clear distinction between a new finding, an existing baseline finding, and a scanner failure

The default CI policy should remain advisory. Repositories should opt into blocking behavior after reviewing their baseline and rule set.

## Phase 3: comment maintenance intelligence

Extend deterministic analysis from comment quality signals to repository maintenance signals. Each new finding must include evidence that a developer can inspect without trusting an opaque model.

Candidate capabilities include:

- Comment age and the author or team associated with the relevant lines
- Comments whose referenced symbol or surrounding implementation changed
- TODO comments without an issue, owner, or expected resolution path
- Stale links or references in comments
- Repeated findings across scans and repositories
- Historical comparison and comment-debt trends in the dashboard
- A maintenance summary grouped by repository, path, language, rule, and owner

The dashboard should aggregate local and CI results without making the CLI depend on the dashboard database.

## Phase 4: optional assisted review

Add artificial intelligence only where it improves a selected finding and preserves user control. The existing optional Gemini integration can support this phase.

Potential capabilities include:

- Explaining why a finding may matter
- Summarizing the code and comment relationship
- Suggesting a replacement or removal for a selected comment
- Grouping related findings for a maintainer review session

Assisted review must remain opt-in, non-blocking, server-side, and bounded to the selected finding and its required context. Comment Lens must never rewrite or delete repository content automatically in the first assisted-review release.

## Phase 5: editor integration

Add an editor integration after the command-line interface and CI behavior are stable. A Visual Studio Code extension could display findings beside comments and invoke the same scanner and policy engine used by local and CI commands.

The extension should not implement a second parser, scoring system, or upload path. It should consume local command output and preserve the same finding identifiers and evidence.

## Architecture direction

Keep the scanner core independent from Next.js, PostgreSQL, GitHub authentication, and artificial intelligence providers. Add policy and output layers around the existing extraction engine:

```text
repository
    -> extraction and provenance
    -> deterministic findings
    -> policy evaluation
    -> JSON, NDJSON, SARIF, or Markdown
    -> optional CI or dashboard upload
```

The Python package should become the canonical local engine. The current `scan.json` and `comments.ndjson` outputs should remain compatible while new fields are added as optional data. Do not bump the contract schema until a breaking change requires it.

The Next.js application should continue to own authentication, scan orchestration, persistence, review decisions, and exports. The hosted application should consume the same scanner outputs that local and CI users receive.

Configuration should live in a repository-owned file such as `.comment-lens.toml`, with command-line overrides for one-off checks. The configuration must support exclusions, rule thresholds, baseline paths, and upload preferences without containing credentials.

## Safety and product boundaries

Comment Lens should preserve these boundaries as it expands:

- Never execute code from a target repository
- Never modify a target repository by default
- Never upload source context unless the developer explicitly requests it
- Add sensitive-path exclusions and optional context redaction before expanding uploads
- Keep deterministic findings reproducible without an artificial intelligence provider
- Keep optional assisted review separate from blocking policy evaluation
- Avoid becoming a general code reviewer, issue tracker, or autonomous refactoring tool

## Verification gates

Each roadmap phase must add the cheapest test tier that protects its changed boundary:

| Capability | Invariant | Required gate |
| --- | --- | --- |
| Rules and exit codes | The same input produces the same finding and status | Unit tests |
| Git revision selection | Only the requested files or comments enter the check | Temporary Git repository integration tests |
| Configuration and baselines | Invalid policy fails clearly and old findings do not become new findings | Configuration and integration tests |
| SARIF and other output | Output remains valid and preserves finding evidence | Contract tests |
| CI integration | A clean, advisory, blocking, or scanner-failure result reaches the job correctly | Workflow validation and one end-to-end CI path |
| Dashboard history | Results remain owner-scoped and review decisions persist | PostgreSQL integration and browser tests |
| Large repository scans | Runtime, memory, and output size stay within measured limits | Performance regression tests |

Performance gates should define the workload, warm-up, sample size, percentile, and allowed variance before they become blocking checks. The existing large-comment fixture can provide the first baseline.

## Success criteria

Comment Lens reaches the next maturity level when:

- A developer can run a useful changed-comment check without hosted services
- A team can introduce CI checks without fixing historical findings first
- Every blocking finding includes deterministic evidence and a source location
- Local, CI, and dashboard results use compatible identifiers and meanings
- The dashboard shows maintenance trends rather than only a single scan result
- Optional artificial intelligence improves selected reviews without becoming a required dependency

## Decisions before Phase 1

Before implementation begins, record decisions for:

- Package distribution: repository installation, Python Package Index (PyPI), or both
- The default rule set and severity names
- The `.comment-lens.toml` configuration shape
- Whether baseline files belong in repositories or CI artifacts
- The first CI systems beyond GitHub Actions, if any
