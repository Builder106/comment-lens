# Comment Lens journal

> Dated log of decisions, pitches, and engineering direction. Reverse-chronological; one paragraph max per entry.

## 2026-10-20: Review comments for maintainers #decision #gemini

Scan-wide Gemini review now asks whether a developer can understand each comment beside its code. It leaves clear comments alone, keeps informal wording, and uses lowercase openings for suggested edits. The server rejects emoji in suggested text and routes existing emoji to a person when removal may change meaning.

## 2026-10-19: Add whole-scan review batches #feature #review

The workspace can prepare retained suggestions in five-comment Gemini batches, default to unchanged, skip protected and sensitive comments before sending, and resume from saved outcomes. Comment text is always disclosed before start; source excerpts stay opt-in. Suggestions remain review-only and do not modify repository files.

## 2026-10-19: Group adjacent line comments for review #decision #scanner

The scanner groups adjacent standalone line comments into one review item. Inline comments, TODO/FIXME directives, and blocks separated by blank lines stay separate.

## 2026-10-19: Add a cautious whole-scan improvement path #direction #review

Keep one-comment-at-a-time review and add an opt-in whole-scan workflow that can leave comments unchanged, suggest narrow wording edits, or route uncertain cases to a person. Show a summary and diff, and require an explicit action before creating a patch or pull request; never merge generated edits automatically.

## 2026-10-18: Use neutral surfaces in the redesigned UI #decision #design

Replace the warm cream backgrounds with neutral gray-white surfaces and cool gray rules. Keep graphite text, cobalt accents, and the existing page composition.

## 2026-10-18: Build the evidence-first review workspace #decision #design

The replacement frontend keeps the repository and scan visible above a filterable comment queue and selected evidence. Rule contributions shape a small evidence trace drawn from scan data. Review decisions, JSON export, browser-local maintenance history, and opt-in Gemini requests stay beside the relevant comment or scan. The interface uses the existing hosted API contracts and keeps scan, error, empty, protected, and mobile detail states explicit. Browser coverage should now be written for these journeys before a release gate is restored.

## 2026-10-18: Retire provisional dashboard UI tests #decision #testing

The dashboard is a temporary frontend, so its browser tests do not describe the intended product. Removed the Playwright suite and CI gate while keeping typecheck, lint, build, unit and coverage, database, scanner, worker, and secret checks. Browser tests can return when the replacement journeys are defined.

## 2026-10-17: Separate scan upload targets #decision #security

Scan dispatches include a target. Development scans use their own upload URL and signing key. The local app uses a schema-only Neon branch and must select `development` before hosted scans are enabled.

## 2026-10-17: Reuse local findings in the editor #decision #editor

Phase 5 adds a VS Code workspace extension that invokes the installed local CLI for one saved file and renders its JSON findings as native diagnostics. The CLI accepts repeatable repository-relative `--path` selections and labels these reports partial for baseline comparisons. The extension preserves scanner finding IDs, evidence, and UTF-8 source positions, clears stale results on edits or failures, and leaves parsing, policy, and uploads outside the editor adapter.

## 2026-10-16: Bound assisted review to one finding #decision #review

Phase 4 adds a separate opt-in Gemini request for one selected hosted deterministic finding. It sends the comment and that rule's evidence by default; short stored code context requires a separate checkbox. The server verifies ownership and rule membership, refuses sensitive paths, and returns advisory explanation, comment-code relationship, and keep/rewrite/remove/investigate guidance without saving it or changing scores, CI policy, review decisions, or repository files. The existing style assessment remains separate.

## 2026-10-16: Add offline maintenance history #decision #scanner

Phase 3 adds evidence-backed task age, missing task reference, nearby code change, and missing local link signals to portable JSON reports. Git blame is associated with the comment's line rather than the first line of its file. Saved full reports can be compared for repeated findings and trends, while partial or failed scans do not imply resolution. The dashboard reads a source-free history summary through an explicit browser file selection and displays it beside hosted scan counts; it does not persist or upload imported reports. External URL checks and inferred team ownership remain outside this offline slice.

## 2026-10-16: Add CI baselines and advisory reports #decision #ci

Phase 2 uses a small repository-owned JSON baseline with finding IDs, rule names, and paths. Full comparisons can report resolved findings; changed-scope comparisons only classify scanned findings as new or existing. Existing findings do not block or appear in baseline-aware SARIF annotations. A separate per-rule blocking threshold can override the global threshold. The repository workflow checks changed comments on pull requests and all tracked comments on a schedule, writes a Markdown job summary, and emits annotations from SARIF. It stays advisory until a policy opts into blocking.

## 2026-10-16: Define the local CLI policy #decision #cli

Phase 1 ships as a repository-installed Python package, with PyPI publication deferred. The new `comment-lens` CLI scans locally, checks changed comments or files, and exports JSON, Markdown, or SARIF. Local checks use `low`, `review`, and `high` severities and remain advisory unless a threshold is selected. `.comment-lens.toml` holds exclusions, rule severities, and thresholds without credentials; command options override it. Offline checks use locally available grammars or Pygments. Phase 2 baselines will be repository-owned files, and GitHub Actions is the first CI target. The existing hosted scan command and artifact contract remain compatible.

## 2026-10-16: Install complete scanner grammar support #decision #scanner

The scan workflow installs the trusted scanner in an isolated virtual environment and uses the maintained Tree-sitter language pack. Added extension mappings for the repository's JavaScript modules, SQL migrations, and TOML configuration so tracked source languages use their grammars.

## 2026-10-15: Specify review workspace and evidence ledger layout #decision

Authored DESIGN.md to define the changed-comment review workspace, three workspace modes (local, CI, team history), and adjacent evidence ledger before implementing the prototype.

## 2026-10-13: Enforce scan retention and recover signed ingestion #retention #security

Worker timestamp validation now uses Unix seconds, as the uploader does. Signed chunk writes and scan completion use PostgreSQL transactions, and matching completion retries are safe. A daily Vercel Cron job deletes expired scan data and orphaned review records; Gemini assessments follow the scan's retention window. Completed scans keep the manifest's parser and extractor versions.

## 2026-10-13: Apply migrations before production builds #migration #deployment

Vercel production builds now apply committed Drizzle migrations before the Next.js build. Preview builds skip migrations so they cannot change the production database.

## 2026-09-19: Fail closed on scan workflow configuration #decision #security

Scan creation requires explicit workflow owner, repository, workflow ID, and ref configuration. Missing values return a configuration error before a scan row is created; a dispatch failure after creation marks the scan failed. Production targets `Builder106/comment-lens`, workflow `comment-lens-scan.yml`, ref `main`, with uploads sent to the production deployment.

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
