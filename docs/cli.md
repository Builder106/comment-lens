# Local comment checks

Install the released scanner with Python 3.12 or newer:

```bash
python3 -m pip install comment-lens-scanner
```

To run the code in this checkout instead, use `python3 -m pip install ./scanner`.

Run `comment-lens scan` from a Git repository to write compatible
`.comment-lens/scan.json` and `.comment-lens/comments.ndjson` artifacts. Run
`comment-lens check` to print a Markdown maintenance report, or use
`--format json` or `--format sarif`. Use `comment-lens export` to render
an existing local scan in any of those formats.

```bash
comment-lens scan .
comment-lens check . --changed origin/main...HEAD --fail-on high
comment-lens check . --changed HEAD --scope files --format sarif --output findings.sarif
comment-lens export . --format json
```

`--changed` accepts a Git base ref or a range ending at the checked-out
`HEAD`. By default, `check` reports only comments touching changed
lines; `--scope files` reports every comment in changed files. A single
base ref includes tracked working-tree changes. Add `--include-untracked`
for a full scan that includes untracked files. This option cannot be combined
with `--changed`. Deleted lines and files have no current comments to
report.

The CLI runs locally and makes no upload request. It uses installed Tree-sitter
grammars when available locally and otherwise uses Pygments. It does not
download grammars during a check. Source files are read, not executed.

Place a `.comment-lens.toml` file at the repository root to choose
exclusions and policy. Paths are relative to that root; the built-in
generated-file and dependency exclusions still apply.

```toml
version = 1
exclude = ["fixtures", "legacy"]

[policy]
fail_on = "none"

[policy.rules]
todo = "review"
fixme = "high"
hack = "high"
restates_symbol = "low"
excessive_verbosity = "low"
hedge_stack = "low"
promotional_or_vague_language = "low"

[thresholds]
max_words = 100
hedge_terms = 3
```

Set a rule to `off`, or override `fail_on` for one run with
`--fail-on low|review|high`. Findings are advisory by default.
Exit status `0` means the check completed without blocking findings;
`1` means findings met the chosen blocking severity; `2` means
configuration, extraction, or artifact handling failed. `check` and
`compare` also print that result on one line to stderr. The existing
`comment-lens-scan` command remains available for the hosted worker.

