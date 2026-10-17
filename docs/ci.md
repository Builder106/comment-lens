# CI checks and baselines

Comment Lens checks comments in a repository checkout. The workflow in
`.github/workflows/comment-lens-quality.yml` runs on pull requests and on a
weekly schedule. Pull requests inspect changed comment lines. Scheduled runs
inspect all tracked files. The workflow writes a Markdown job summary and
turns new SARIF results into pull request annotations. It retains both reports
and the underlying JSON report as workflow artifacts for seven days.

The workflow is advisory until `fail_on` or a per-rule threshold is set.
Exit code 0 means the scan completed without blocking findings. Exit code 1
means a new finding met a blocking threshold. Exit code 2 means the scan or
configuration failed. A scanner failure is never treated as a clean check.

## Create a baseline

Run a full scan on the default branch after reviewing the rule set:

```bash
comment-lens baseline create . --output .comment-lens-baseline.json
```

Review the JSON file and commit it with the policy file. It stores finding
IDs, paths, and rule names. It does not store comment text or source context.
`baseline create` refuses to replace an existing file unless `--force`
is passed. Regenerate it when the team has reviewed and accepted a new set
of existing findings.

Compare a full scan with the baseline:

```bash
comment-lens compare . --baseline .comment-lens-baseline.json --format json
```

The report labels current findings `new` or `existing`. A full scan
also lists baseline findings no longer present as `resolved`. A changed
file or changed comment check does not claim that unscanned findings are
resolved. Only new findings can block. SARIF contains new findings when a
baseline is supplied; the Markdown and JSON reports retain both groups.
Finding IDs remain stable when unrelated comments are inserted before a
finding. Edits to a comment can change its ID, so review the baseline diff
before accepting a refresh.

## Choose a blocking policy

The default policy reports every enabled rule without blocking. Use
`--fail-on high` for a one-off check, or set a repository policy:

```toml
version = 1

[baseline]
path = ".comment-lens-baseline.json"

[policy]
fail_on = "none"

[policy.fail_on_rules]
fixme = "high"
hack = "high"
todo = "none"
```

`policy.fail_on_rules` overrides the global threshold for each named
rule. `none` keeps that rule advisory. Rule severity is set separately
under `[policy.rules]`; set a rule to `off` to omit it. If a
baseline path is configured, `check` and `export` load it
automatically. `compare` requires a baseline and defaults to
`.comment-lens-baseline.json` when no path is configured.

## Run a changed check

Fetch the base branch and compare it with the checked-out HEAD:

```bash
comment-lens compare . --changed origin/main...HEAD --format markdown
comment-lens compare . --changed origin/main...HEAD --format sarif --output .comment-lens/report.sarif
comment-lens annotate --input .comment-lens/report.sarif
```

Use `--scope files` to inspect every comment in changed files. Without
it, the check selects comments touching changed lines. For a scheduled
maintenance report, leave out `--changed`:

```bash
comment-lens compare . --format markdown --output .comment-lens/report.md
```

The GitHub Actions workflow uses the same commands. Its SARIF annotation
step reads the generated file and caps annotations at 50 per run. The full
report remains in the workflow artifact.

To adopt the workflow in another repository, copy
`.github/workflows/comment-lens-quality.yml`, install the scanner from a
reviewed Comment Lens source revision, and commit that repository's baseline
and policy. The workflow in this repository installs `./scanner`
directly because the package has not been published to PyPI.
