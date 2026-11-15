#!/usr/bin/env python3
"""Build lib/landing/drift.json: one real comment, shown at three commits.

Usage: landing-drift.py <clone> <check.json> <output.json> [<compare.md> <exit status>]

compare.md is the Markdown output of `comment-lens compare --fail-on high` in the
same clone, and exit status is the status that command returned.

The clone must be a full-history clone of the project at the head commit of the
check report. Every line, date and commit in the output comes from git blame in
that clone, with dates in UTC so they match the finding's evidence.
"""

import json
import os
import subprocess
import sys

PATH = "pwndbg/color/syntax_highlight.py"
COMMENT = "# No syntax highlight if pygment is not installed"
CHANGE = "13e1608ecd"
ROWS = 8
ABOVE = 1


def git(clone: str, *args: str) -> str:
    env = {**os.environ, "TZ": "UTC"}
    return subprocess.run(["git", "-C", clone, *args], check=True, capture_output=True, text=True, env=env).stdout


def blame(clone: str, rev: str) -> list[dict[str, object]]:
    source = git(clone, "show", f"{rev}:{PATH}").split("\n")
    start = next(i for i, line in enumerate(source) if line.strip() == COMMENT) + 1 - ABOVE
    out = git(clone, "blame", "--porcelain", "-L", f"{start},{start + ROWS - 1}", rev, "--", PATH)
    rows: list[dict[str, object]] = []
    times: dict[str, int] = {}
    sha = ""
    for line in out.split("\n"):
        parts = line.split(" ")
        if len(parts) >= 3 and len(parts[0]) == 40:
            sha = parts[0]
            number = int(parts[2])
        elif line.startswith("author-time "):
            times[sha] = int(parts[1])
        elif line.startswith("\t"):
            when = subprocess.run(["date", "-u", "-d", f"@{times[sha]}", "+%Y-%m-%d"], check=True, capture_output=True, text=True).stdout.strip()
            rows.append({"n": number, "commit": sha[:7], "date": when, "text": line[1:]})
    return rows


def commit(clone: str, rev: str) -> dict[str, str]:
    sha, date, subject = git(clone, "log", "-1", "--date=short-local", "--format=%H%x00%ad%x00%s", rev).strip().split("\x00")
    return {"sha": sha, "short": sha[:7], "date": date, "subject": subject}


def terminal(markdown_path: str, exit_status: int) -> dict[str, object]:
    """Slice the real `compare` report: its header and one blocking finding."""
    lines = open(markdown_path).read().rstrip("\n").split("\n")
    header_end = next(i for i, line in enumerate(lines) if line.startswith("## "))
    while header_end and not lines[header_end - 1].strip():
        header_end -= 1
    start = lines.index(SECTION)
    end = next(i for i in range(start + 1, len(lines)) if lines[i].startswith("Evidence:")) + 1
    return {
        "command": "comment-lens compare . --baseline .comment-lens-baseline.json --fail-on high",
        "header": lines[:header_end],
        "skippedBefore": start - header_end,
        "section": lines[start:end],
        "skippedAfter": len(lines) - end,
        "exit": exit_status,
    }


SECTION = "## pwndbg/aglib/auxv.py:186: fixme (high, new)"


def main() -> None:
    clone, check_path, output = sys.argv[1:4]
    markdown_path, exit_status = (sys.argv[4], int(sys.argv[5])) if len(sys.argv) > 5 else (None, 0)
    report = json.load(open(check_path))
    head = report["headCommit"]
    finding = next(f for f in report["findings"] if f["path"] == PATH and f["ruleId"] == "nearby_code_changed")
    written = finding["evidence"]["commentCommit"]
    states = [
        {"commit": commit(clone, written), "lines": blame(clone, written)},
        {"commit": commit(clone, CHANGE), "lines": blame(clone, CHANGE)},
        {"commit": commit(clone, head), "lines": blame(clone, head)},
    ]
    later = int(git(clone, "rev-list", "--count", f"{CHANGE}..{head}", "--", PATH).strip())
    data = {
        "repository": report["repository"],
        "path": PATH,
        "states": states,
        "commitsSinceChange": later,
        "finding": {
            "rule": finding["ruleId"],
            "severity": finding["severity"],
            "message": finding["message"],
            "line": finding["line"],
            "evidence": finding["evidence"],
            "permalink": f"https://github.com/{report['repository']}/blob/{head}/{PATH}#L{finding['line']}",
        },
    }
    if markdown_path:
        data["terminal"] = terminal(markdown_path, exit_status)
    with open(output, "w") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")


if __name__ == "__main__":
    main()
