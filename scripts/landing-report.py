#!/usr/bin/env python3
"""Build lib/landing/report.json from real comment-lens runs.

Input directory layout (written by the run described in docs/landing-data.md):

    meta.txt                lines "head <sha> <date>", "old <sha> <date>", "<mode> <level> exit=<n>"
    nobase-<level>.json     comment-lens check . --fail-on <level> --format json
    base-<level>.json       comment-lens compare . --baseline ... --fail-on <level> --format json
    head/                   the clean checkout of the scanned commit

Usage: landing-report.py <input-dir> <output-json>

The page ships a sample of the findings. Author names are dropped.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

LEVELS = ("none", "low", "review", "high")
REPOSITORY = "pwndbg/pwndbg"
WANTED = [
    ("fixme", "new", 2),
    ("fixme", "existing", 2),
    ("hack", None, 1),
    ("aged_task", "existing", 1),
    ("aged_task", "new", 1),
    ("task_without_reference", "new", 1),
    ("todo", "existing", 1),
    ("restates_symbol", "existing", 1),
    ("excessive_verbosity", "new", 1),
    ("promotional_or_vague_language", None, 1),
    ("hedge_stack", None, 1),
    ("nearby_code_changed", "existing", 1),
    ("nearby_code_changed", "new", 1),
]
MAX_COLUMNS = 100
MAX_CONTEXT_LINES = 11


def read_meta(path: Path) -> tuple[dict[str, tuple[str, str]], dict[tuple[str, str], int]]:
    commits: dict[str, tuple[str, str]] = {}
    exits: dict[tuple[str, str], int] = {}
    for line in path.read_text().splitlines():
        parts = line.split()
        if len(parts) == 3 and parts[0] in {"head", "old"}:
            commits[parts[0]] = (parts[1], parts[2])
        match = re.fullmatch(r"(nobase|base) (\w+) exit=(\d+)", line)
        if match:
            exits[(match.group(1), match.group(2))] = int(match.group(3))
    return commits, exits


def clean_context(text: str, line: int, repo: Path, path: str) -> tuple[str, int] | None:
    """Trim blank edges, return the text and its first line number.

    The scanner starts a comment's context five lines above the comment. The
    first line number is checked against the checked-out file, and the snippet
    is dropped when the two disagree.
    """
    lines = text.split("\n")
    first = max(0, line - 1 - 5) + 1
    while lines and not lines[0].strip():
        lines.pop(0)
        first += 1
    while lines and not lines[-1].strip():
        lines.pop()
    if not lines or len(lines) > MAX_CONTEXT_LINES or any(len(item) > MAX_COLUMNS for item in lines):
        return None
    actual = (repo / path).read_text(encoding="utf-8", errors="replace").split("\n")
    if actual[first - 1 : first - 1 + len(lines)] != lines:
        return None
    return "\n".join(lines), first


def pick_sample(findings: list[dict], commit: str, repo: Path) -> list[dict]:
    chosen: list[dict] = []
    used_comments: set[str] = set()
    for rule, state, count in WANTED:
        pool = []
        for finding in findings:
            if finding["ruleId"] != rule or (state and finding["baselineState"] != state):
                continue
            if finding["commentId"] in used_comments or finding["language"] != "python":
                continue
            cleaned = clean_context(finding.get("sourceContext") or "", finding["line"], repo, finding["path"])
            if cleaned is None:
                continue
            pool.append((len(cleaned[0]), finding["path"], finding["line"], finding, cleaned))
        pool.sort(key=lambda item: item[:3])
        for _, _, _, finding, (context, first_line) in pool[:count]:
            used_comments.add(finding["commentId"])
            evidence = {key: value for key, value in finding["evidence"].items() if key != "author"}
            chosen.append(
                {
                    "id": finding["findingId"][4:16],
                    "rule": finding["ruleId"],
                    "severity": finding["severity"],
                    "state": finding["baselineState"],
                    "path": finding["path"],
                    "line": finding["line"],
                    "message": finding["message"],
                    "evidence": evidence,
                    "context": context,
                    "startLine": first_line,
                    "permalink": f"https://github.com/{REPOSITORY}/blob/{commit}/{finding['path']}#L{finding['line']}",
                }
            )
    chosen.sort(key=lambda item: (item["path"], item["line"], item["rule"]))
    return chosen


def main() -> int:
    source, target = Path(sys.argv[1]), Path(sys.argv[2])
    commits, exits = read_meta(source / "meta.txt")
    head_sha, head_date = commits["head"]
    old_sha, old_date = commits["old"]

    gate = []
    for baseline in (False, True):
        for level in LEVELS:
            mode = "base" if baseline else "nobase"
            report = json.loads((source / f"{mode}-{level}.json").read_text())
            summary = report["summary"]
            gate.append(
                {
                    "baseline": baseline,
                    "failOn": level,
                    "exit": exits[(mode, level)],
                    "findings": summary["findings"],
                    "new": summary["new"],
                    "existing": summary["existing"],
                    "resolved": summary.get("resolved", 0),
                    "blocking": summary["blocking"],
                }
            )

    full = json.loads((source / "base-none.json").read_text())
    findings = full["findings"]
    by_rule = Counter((item["ruleId"], item["severity"], item["baselineState"]) for item in findings)
    rules = sorted({(rule, severity) for rule, severity, _ in by_rule})
    rule_rows = [
        {
            "rule": rule,
            "severity": severity,
            "new": by_rule[(rule, severity, "new")],
            "existing": by_rule[(rule, severity, "existing")],
        }
        for rule, severity in rules
    ]
    rule_rows.sort(key=lambda row: -(row["new"] + row["existing"]))

    data = {
        "repository": REPOSITORY,
        "url": f"https://github.com/{REPOSITORY}",
        "commit": head_sha,
        "commitDate": head_date,
        "baselineCommit": old_sha,
        "baselineDate": old_date,
        "selection": full["selection"],
        "files": full["summary"]["files"],
        "comments": full["summary"]["comments"],
        "gate": gate,
        "byRule": rule_rows,
        "sample": pick_sample(findings, head_sha, source / "head"),
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"gate rows: {len(gate)}; rules: {len(rule_rows)}; sample: {len(data['sample'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
