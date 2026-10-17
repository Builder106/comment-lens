# Maintenance findings and history

Phase 3 adds deterministic maintenance signals to the local report. Run a
full check to keep a JSON snapshot, then summarize snapshots from local or
CI runs:

```bash
comment-lens check . --format json --output .comment-lens/first.json
comment-lens summary --report .comment-lens/first.json --report .comment-lens/second.json --format json --output .comment-lens/history.json
```

Open the hosted review workspace and choose the history JSON file in the
Maintenance history section. The browser reads that file locally. It does
not send it to the service. Hosted scan comment counts appear separately
because they are a different measure from policy findings.

The JSON history summary contains counts, repository names, paths, rule
names, author names from Git blame, finding IDs, and scan dates. It does
not contain comment text or source context. Treat paths and author names
as repository data when sharing the file.

## What the rules inspect

| Rule | Evidence | Limit |
| --- | --- | --- |
| `task_without_reference` | A TODO, FIXME, or HACK comment has no issue key, owner marker, or resolution phrase | The marker check is syntactic; it cannot know whether a task is tracked elsewhere. |
| `aged_task` | Git blame date, commit, author, and age in days | Only committed task comments with a blame date qualify. |
| `nearby_code_changed` | The nearest code line in the short source context has a newer Git commit, or an uncommitted worktree change | Proximity does not prove that the comment describes that code line. |
| `missing_local_reference` | A relative Markdown link in a comment points to a missing local path | HTTP links are not fetched or judged stale. This rule runs only against the current checkout during a check. |

Set the age threshold in `.comment-lens.toml`:

```toml
[thresholds]
age_days = 180
```

Use `[policy.rules]` to turn a rule off or change its severity. Use
`[policy.fail_on_rules]` to decide whether it blocks. The default policy
remains advisory.

Each finding includes a rule ID, location, evidence, source context when
available, language, and the blamed author when Git can identify one.
The report groups findings by repository, path, language, rule, and author.
The history summary uses the most recent full scan for each repository's
current counts. It shows partial scans and failed scans in the trend table
without treating missing findings in those scans as resolved.

The CI workflow retains a JSON report alongside Markdown and SARIF. Download
several JSON reports to make a history summary. `comment-lens render` can
produce Markdown or SARIF from one saved JSON report without rescanning.
