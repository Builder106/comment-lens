# Landing page data

The home page shows a real report. `lib/landing/report.json` holds the numbers, the exit codes and a sample of the findings. Nothing in it is typed by hand. `scripts/landing-report.py` builds it from the CLI's own JSON reports.

The files were built with `comment-lens-scanner` 0.1.1 from PyPI. The sample comes from `pwndbg/pwndbg` at commit `f6fed0cb49495f58a1dd4f972f2f610cf16b1754` (2026-10-21). The baseline was created from commit `22bec9756a9cc2aaa410829d452971be17900fac` (2026-09-14) of the same project. Findings are shown as the scanner reports them. They describe comments, not the project's quality.

## Rebuild it

Use two clean clones of the project, one at each commit. Give both the same remote URL, because the finding IDs include the repository identity and a baseline made under another name matches nothing.

```bash
git clone --no-checkout https://github.com/pwndbg/pwndbg.git old
git -C old checkout 22bec9756a9cc2aaa410829d452971be17900fac
git clone --no-checkout https://github.com/pwndbg/pwndbg.git head
git -C head checkout f6fed0cb49495f58a1dd4f972f2f610cf16b1754

(cd old && comment-lens baseline create . --output ../baseline.json)
cp baseline.json head/.comment-lens-baseline.json
```

In `head`, run each of these and record the exit status with the line `nobase <level> exit=<n>` or `base <level> exit=<n>` in `meta.txt`, for the levels `none`, `low`, `review` and `high`:

```bash
comment-lens check . --fail-on LEVEL --format json --output ../nobase-LEVEL.json
comment-lens compare . --baseline .comment-lens-baseline.json --fail-on LEVEL --format json --output ../base-LEVEL.json
```

Add `head <sha> <date>` and `old <sha> <date>` lines to `meta.txt`, then:

```bash
python3 scripts/landing-report.py <directory-with-meta.txt-and-reports> lib/landing/report.json
```

The script drops author names, keeps only snippets whose line numbers match the checked-out file, and picks a sample that covers the rules and both baseline states. `tests/server/landing-report.test.ts` checks that the on-screen gate arithmetic agrees with every recorded exit status.

## The comment history

The story at the top of the home page comes from `lib/landing/drift.json`. Build it from a full-history clone of the project at the head commit, after running the check and the baseline comparison from the recipe above in that clone:

```bash
comment-lens check . --format json --output ../check.json
comment-lens compare . --baseline .comment-lens-baseline.json --fail-on high > ../compare-high.md
echo $?
python3 scripts/landing-drift.py <clone> check.json lib/landing/drift.json compare-high.md <exit status>
```

The script finds the `nearby_code_changed` finding for `pwndbg/color/syntax_highlight.py`, then records `git blame` for eight lines around the comment at three commits: the commit that wrote the comment, the commit named as the code change in the finding's evidence, and the head commit. Dates are in UTC so they match the evidence. The terminal panel is the Markdown report trimmed to its header and one blocking finding, with the number of omitted lines recorded on each side. `tests/server/landing-drift.test.ts` checks the blame against the evidence.

## Replace the example project

Change `REPOSITORY` and the two commits, run the recipe against your own repository, and rebuild. Keep the clones under the same remote URL for the baseline and the comparison.
