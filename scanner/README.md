# Comment Lens Scanner

Comment Lens extracts code comments for review. The local command-line interface flags comments that may need attention, explains each finding with deterministic rule evidence, and leaves repository files unchanged.

## Features

- **Parsing**: Uses Tree-sitter grammars, with a Pygments fallback, to distinguish docstrings, line comments, inline notes, and header blocks across major languages.
- **Maintenance signals**: Flags unresolved `TODO`/`FIXME`/`HACK` directives, symbol duplication, comments near changed code, and broken local file links.
- **Git checks**: Uses `--changed` to focus pre-commit and CI checks on comments added or modified in the current branch.
- **Export**: Produces JSON, NDJSON, Markdown, and SARIF for GitHub Actions PR annotations.
- **Local by default**: Inspects code without executing it or transmitting it to external servers.

## Installation

From the repository root, install the scanner from this checkout:

```bash
python3 -m pip install ./scanner
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
