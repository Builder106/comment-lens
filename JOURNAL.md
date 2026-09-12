# JOURNAL — Comment Lens

> Dated log of decisions, pitches, and engineering direction. Reverse-chronological; one paragraph max per entry.

## 2026-09-12: Remove obsolete staging branch #decision #deployment

Deleted the unused `staging` branch and its Vercel deploy hook. `main` is now the only deployment branch, and the staging Actions secret was removed.

## 2026-09-03: Separate repository extraction #decision #architecture

Extracted Comment Lens out of `code-wes-projects` into an independent repository under `Builder106/comment-lens`. Preserved the full commit history from the monorepo via `git subtree split`, added standalone GitHub Actions workflows for CI checks and repository comment scanning with single-digit major action versions, and established repository baseline documentation.

## 2026-09-01: Make main the canonical production branch #decision #deployment

`main` is now the canonical repository branch and the production source for Vercel deployment. Feature branches use CI and pull-request review before merge, avoiding separate staging branch overhead while maintaining clean deployment tracking.

## 2026-08-31: Align monorepo runtime and package ownership #decision #deployment

Aligned the application runtime on Node 24 for CI and deployment environments while supporting Node 26 verification setups. Retained pnpm package management discipline across test runners and build scripts.

## 2026-08-31: Comment Lens database baseline #database #drizzle

Configured a Drizzle-generated database baseline with schema migrations and metadata for the PostgreSQL review datastore. Added `pg` for migration commands and verified direct database connectivity against Neon.

## 2026-08-31: Comment Lens task-first dashboard #design #accessibility

Replaced the initial landing-page treatment with a task-first review workspace. The dashboard presents clear action states for repository connection, scanning, and review queue management, with full keyboard navigation and accessibility coverage.

## 2026-08-30: Comment Lens production boundaries #decision #security

Kept Tree-sitter as the primary parser with Pygments fallback, retained only comments and short source context, and separated deterministic review-priority scoring from optional on-demand AI assessment. GitHub App installation tokens, signed worker chunks, and owner-scoped persistence form the security boundary without modifying any target repository files.
