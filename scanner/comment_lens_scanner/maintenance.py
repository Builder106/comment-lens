"""Offline evidence for comment maintenance signals."""

from __future__ import annotations

import posixpath
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urlsplit

TASK = re.compile(r"(?im)^\s*(?:\*\s*)?(?:TODO|FIXME|HACK)\b")
ISSUE = re.compile(r"(?:#\d+\b|\b[A-Z][A-Z0-9]+-\d+\b|https?://\S+/(?:issues|tickets)/\d+)", re.I)
OWNER = re.compile(r"(?:@[-\w]+|\b(?:owner|assignee):\s*[-\w]+)", re.I)
RESOLUTION = re.compile(r"\b(?:after|when|until|once)\s+\w+|\b(?:remove|resolve|fix)\s+(?:by|before)\s+\S+", re.I)
LOCAL_LINK = re.compile(r"\[[^\]]+\]\((?:<([^>]+)>|([^\s)]+))\)")
COMMENT_PREFIX = ("#", "//", "/*", "*", "--", "<!--", "'''", '"""')


def comment_blame(comment: dict[str, object]) -> dict[str, object] | None:
    line = comment["rawSpan"]["start"]["line0"]
    return next((span for span in comment["git"]["blameSpans"] if span["startLine0"] <= line <= span["endLine0"]), None)


def _blame_at(comment: dict[str, object], line: int) -> dict[str, object] | None:
    return next((span for span in comment["git"]["blameSpans"] if span["startLine0"] <= line <= span["endLine0"]), None)


def _nearby_code_line(comment: dict[str, object]) -> int | None:
    context = comment.get("sourceContext")
    if not isinstance(context, str):
        return None
    lines = context.splitlines()
    start = comment["rawSpan"]["start"]["line0"]
    end = comment["rawSpan"]["end"]["line0"]
    if comment["rawSpan"]["end"]["columnByte0"] == 0 and end > start:
        end -= 1
    context_start = max(0, start - 5)
    candidates = [*range(end + 1, min(context_start + len(lines), end + 6)), *range(start - 1, max(context_start - 1, start - 6), -1)]
    for line in candidates:
        text = lines[line - context_start].strip()
        if text and not text.startswith(COMMENT_PREFIX) and text not in {"{", "}", "};"}:
            return line
    return None


def _missing_links(comment: dict[str, object], root: Path) -> list[dict[str, str]]:
    missing = []
    body = str(comment["bodyText"])
    for match in LOCAL_LINK.finditer(body):
        target = unquote(match.group(1) or match.group(2))
        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc or not parsed.path or parsed.path.startswith("/"):
            continue
        relative = posixpath.normpath(posixpath.join(posixpath.dirname(str(comment["path"])), parsed.path))
        if relative == ".." or relative.startswith("../"):
            continue
        destination = (root / relative).resolve()
        if destination.is_relative_to(root.resolve()) and not destination.exists():
            missing.append({"reference": target, "resolvedPath": relative})
    return missing


def signals(comment: dict[str, object], *, as_of: datetime, age_days: int, root: Path | None = None) -> list[tuple[str, dict[str, object], str]]:
    body = str(comment["bodyText"])
    found: list[tuple[str, dict[str, object], str]] = []
    blame = comment_blame(comment)
    if TASK.search(body):
        issue = bool(ISSUE.search(body))
        owner = bool(OWNER.search(body))
        resolution = bool(RESOLUTION.search(body))
        if not (issue or owner or resolution):
            found.append(("task_without_reference", {"issue": issue, "owner": owner, "resolution": resolution}, "Task comment has no issue, owner, or resolution marker."))
        if blame and blame.get("source") == "commit" and isinstance(blame.get("authoredAt"), str):
            authored = datetime.fromisoformat(blame["authoredAt"])
            days = max(0, (as_of.date() - authored.date()).days)
            if days >= age_days:
                found.append(("aged_task", {"ageDays": days, "minimumDays": age_days, "authoredAt": blame["authoredAt"], "commit": blame["commit"], "author": blame.get("authorName")}, "Task comment is older than the configured age threshold."))

    code_line = _nearby_code_line(comment)
    code_blame = _blame_at(comment, code_line) if code_line is not None else None
    if blame and code_blame and blame.get("source") == "commit" and blame.get("commit") != code_blame.get("commit"):
        comment_time = blame.get("authoredAt")
        code_time = code_blame.get("authoredAt")
        changed = code_blame.get("source") == "worktree" or (
            isinstance(comment_time, str) and isinstance(code_time, str)
            and datetime.fromisoformat(code_time) > datetime.fromisoformat(comment_time)
        )
        if changed:
            found.append(("nearby_code_changed", {"codeLine": code_line + 1, "commentCommit": blame["commit"], "codeCommit": code_blame.get("commit"), "commentAuthoredAt": comment_time, "codeAuthoredAt": code_time, "codeSource": code_blame["source"]}, "Nearby code changed after this comment."))

    if root is not None:
        links = _missing_links(comment, root)
        if links:
            found.append(("missing_local_reference", {"references": links}, "Comment links to a local path that does not exist."))
    return found
