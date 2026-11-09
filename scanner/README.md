# Comment Lens Scanner

Comment Lens extracts code comments and keeps them useful over time. The local command-line interface finds comments that deserve attention before they become maintenance debt, explains why with deterministic rule evidence, and helps teams maintain high comment quality without modifying repository files.

## Features

- **AST-Aware Parsing**: Uses Tree-sitter grammars (with Pygments fallback) to distinguish docstrings, line comments, inline notes, and header blocks across major languages.
- **Maintenance Signals**: Flags unresolved `TODO`/`FIXME`/`HACK` directives, symbol duplication, stale comments on changed code, and broken local file links.
- **Git Differential Checks**: Fast pre-commit and CI checks using `--changed` to focus only on comments added or modified in the current branch.
- **Multi-Format Export**: Emits findings in JSON, NDJSON, Markdown, and SARIF for GitHub Actions PR annotations.
- **Zero-Network Default**: Fully local execution; code is inspected without being executed or transmitted to external servers.

## Installation

```bash
pip install comment-lens-scanner
```

Requires Python 3.12 or newer.

## Usage

### Scan a Repository

Scan the current repository and generate local finding manifests (`.comment-lens/scan.json` and `.comment-lens/comments.ndjson`):

```bash
comment-lens scan .
```

### Check Changed Comments (Pre-Commit or CI)

Check only comments touching lines changed between `origin/main` and `HEAD`, failing if any high-severity findings are introduced:

```bash
comment-lens check . --changed origin/main...HEAD --fail-on high
```

Generate SARIF output for CI integration:

```bash
comment-lens check . --changed HEAD --scope files --format sarif --output findings.sarif
```

### Export an Existing Scan

Convert an existing scan artifact into Markdown or JSON:

```bash
comment-lens export . --format markdown
comment-lens export . --format json
```

## Configuration

Place a `.comment-lens.toml` file at your repository root to configure exclusions and rule policies:

```toml
version = 1
exclude = ["fixtures", "legacy"]

[policy]
fail_on = "none"

[policy.rules]
todo = "review"
fixme = "high"
symbol_duplication = "review"
missing_local_reference = "high"
```

## License

MIT License. See [LICENSE](https://github.com/Builder106/comment-lens/blob/main/LICENSE) for details.
