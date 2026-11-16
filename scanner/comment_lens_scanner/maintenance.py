"""Offline evidence for comment maintenance signals."""

from __future__ import annotations

import posixpath
import re
from collections import Counter
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from urllib.parse import unquote, urlsplit

from .core import _git

TASK = re.compile(r"(?im)^\s*(?:\*\s*)?(?:TODO|FIXME|HACK)\b")
ISSUE = re.compile(r"(?:#\d+\b|\b[A-Z][A-Z0-9]+-\d+\b|https?://\S+/(?:issues|tickets)/\d+)", re.I)
OWNER = re.compile(r"(?:@[-\w]+|\b(?:owner|assignee):\s*[-\w]+)", re.I)
RESOLUTION = re.compile(r"\b(?:after|when|until|once)\s+\w+|\b(?:remove|resolve|fix)\s+(?:by|before)\s+\S+", re.I)
LOCAL_LINK = re.compile(r"\[[^\]]+\]\((?:<([^>]+)>|([^\s)]+))\)")
COMMENT_PREFIX = ("#", "//", "/*", "*", "--", "<!--", "'''", '"""')
BANNER = re.compile(r"(?m)^\s*[^\w\s]{4,}\s*$")
FILE_TAG = re.compile(r"@(?:file|fileoverview|module)\b|^\s*(?:mypy|pylint|flake8|pyright|ruff|isort|coding)\s*[:=]", re.I | re.M)
DOC_TAG = re.compile(r"@\w+|\{[^}]*\}")
WORDS = re.compile(r"[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+")
FUNCTION_WORDS = frozenset("the and for that this with from when are not you can will which into than then its has was but all any per".split())


def comment_blame(comment: dict[str, object]) -> dict[str, object] | None:
    line = comment["rawSpan"]["start"]["line0"]
    return next((span for span in comment["git"]["blameSpans"] if span["startLine0"] <= line <= span["endLine0"]), None)


def _last_touch(comment: dict[str, object]) -> dict[str, object] | None:
    """The blame span of the comment's most recently committed line, or None while any line is uncommitted."""
    start = comment["rawSpan"]["start"]["line0"]
    end = comment["rawSpan"]["end"]["line0"]
    spans = [span for span in comment["git"]["blameSpans"] if span["startLine0"] <= end and start <= span["endLine0"]]
    if not spans or any(span.get("source") != "commit" or not isinstance(span.get("authoredAt"), str) for span in spans):
        return None
    return max(spans, key=lambda span: datetime.fromisoformat(span["authoredAt"]))


def _blame_at(comment: dict[str, object], line: int) -> dict[str, object] | None:
    return next((span for span in comment["git"]["blameSpans"] if span["startLine0"] <= line <= span["endLine0"]), None)


def _lines_after(comment: dict[str, object]) -> tuple[list[str], int, int] | None:
    """The source context lines, the line number of its first line, and the comment's last line."""
    context = comment.get("sourceContext")
    if not isinstance(context, str):
        return None
    start = comment["rawSpan"]["start"]["line0"]
    end = comment["rawSpan"]["end"]["line0"]
    if comment["rawSpan"]["end"]["columnByte0"] == 0 and end > start:
        end -= 1
    return context.splitlines(), max(0, start - 5), end


def _nearby_code_line(comment: dict[str, object]) -> tuple[int, str] | None:
    parts = _lines_after(comment)
    if parts is None:
        return None
    lines, context_start, end = parts
    start = comment["rawSpan"]["start"]["line0"]
    candidates = [*range(end + 1, min(context_start + len(lines), end + 6)), *range(start - 1, max(context_start - 1, start - 6), -1)]
    for line in candidates:
        text = lines[line - context_start].strip()
        if text and not text.startswith(COMMENT_PREFIX) and text not in {"{", "}", "};"}:
            return line, text
    return None


def _terms(text: str) -> set[str]:
    return {word.lower() for word in WORDS.findall(text) if len(word) >= 3 or word.isdigit()} - FUNCTION_WORDS


FILLER = FUNCTION_WORDS | frozenset("function method class return returns returning get gets set sets".split())


def _same_word(first: str, second: str) -> bool:
    plural = first.rstrip("s") == second.rstrip("s")
    return first == second or plural or (min(len(first), len(second)) >= 4 and (first.startswith(second) or second.startswith(first)))


DECLARATION = re.compile(
    r"^(?:(?:export|default|async|public|private|protected|static|abstract|final|pub|unsafe|extern)\s+)*"
    r"(?:(?:def|function\*?|class|interface|struct|enum|trait|fn|func|type)\s+([A-Za-z_$][\w$]*)"
    r"|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*="
    r"|([A-Za-z_$][\w$]*)\s*\()"
)
NOT_NAMES = frozenset("if for while switch return catch with else do try await yield new typeof function super".split())


def documented_symbol(comment: dict[str, object]) -> str | None:
    """The name of the declaration on the comment's next code line, if there is one."""
    parts = _lines_after(comment)
    if parts is None:
        return None
    lines, context_start, end = parts
    for line in lines[max(0, end + 1 - context_start):end + 6 - context_start]:
        text = line.strip()
        if not text or text.startswith(COMMENT_PREFIX) or text.startswith("@"):
            continue
        match = DECLARATION.match(text)
        name = next((group for group in match.groups() if group), None) if match else None
        return name if name and name not in NOT_NAMES else None
    return None


def restates_symbol(body: str, symbol: str) -> bool:
    """True when the comment uses the symbol's name and adds at most one word of its own."""
    name = {word.lower() for word in WORDS.findall(symbol)}
    words = _terms(DOC_TAG.sub(" ", body))
    covered = {word for word in words if any(_same_word(word, part) for part in name)}
    return bool(covered) and len(words - covered - FILLER) <= 1


PROSE_LINE = re.compile(r"[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){2,}")


def prose_word_count(body: str) -> int:
    """Words in lines of running text. Tag lines such as `@param`, tables and diagrams do not count."""
    return sum(len(re.findall(r"\b\w+\b", line)) for line in body.splitlines() if not line.lstrip().startswith("@") and PROSE_LINE.search(line))


def _describes_file(comment: dict[str, object]) -> bool:
    """A banner, a file tag, a tool directive or a header block at the top of a file is not about the next line of code."""
    body = str(comment["bodyText"])
    if BANNER.search(body) or FILE_TAG.search(body):
        return True
    parts = _lines_after(comment)
    if parts is None or comment["rawSpan"]["start"]["line0"] != 0:
        return False
    lines, context_start, end = parts
    following = end + 1 - context_start
    return following < len(lines) and not lines[following].strip()


def _is_label(comment: dict[str, object]) -> bool:
    """A comment of three words or fewer names a group of lines. A change nearby cannot contradict it, unless it states a number."""
    words = re.findall(r"\w+", str(comment["bodyText"]))
    return len(words) <= 3 and not any(word.isdigit() for word in words)


@lru_cache(maxsize=2048)
def _hunks(root: str, commit: str, path: str) -> tuple[tuple[tuple[str, ...], tuple[str, ...]], ...]:
    output, _ = _git(Path(root), ["show", "--format=", "--no-color", "-U0", "-w", commit, "--", path])
    hunks: list[tuple[tuple[str, ...], tuple[str, ...]]] = []
    removed: list[str] = []
    added: list[str] = []
    started = False
    for line in output.splitlines():
        if line.startswith("@@"):
            if started:
                hunks.append((tuple(removed), tuple(added)))
            started, removed, added = True, [], []
        elif started and line.startswith("-"):
            removed.append(line[1:])
        elif started and line.startswith("+"):
            added.append(line[1:])
    if started:
        hunks.append((tuple(removed), tuple(added)))
    return tuple(hunks)


def _changed_terms(root: Path, commit: str, path: str, code_text: str) -> set[str] | None:
    """Words the commit added or removed in the hunk that wrote this line, or None when that hunk cannot be found."""
    target = "".join(code_text.split())
    for removed, added in _hunks(str(root), commit, path):
        if any("".join(line.split()) == target for line in added):
            before = Counter(word for line in removed if not line.strip().startswith(COMMENT_PREFIX) for word in _terms(line))
            after = Counter(word for line in added if not line.strip().startswith(COMMENT_PREFIX) for word in _terms(line))
            return set((before - after) + (after - before))
    return None


def _shared_terms(comment_terms: set[str], changed: set[str]) -> list[str]:
    return sorted(term for term in comment_terms if any(term == other or (min(len(term), len(other)) >= 4 and (term.startswith(other) or other.startswith(term))) for other in changed))


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

    nearby = _nearby_code_line(comment)
    code_line, code_text = nearby if nearby else (None, "")
    code_blame = _blame_at(comment, code_line) if code_line is not None else None
    touched = _last_touch(comment)
    if touched and code_blame and touched.get("commit") != code_blame.get("commit"):
        comment_time = touched.get("authoredAt")
        code_time = code_blame.get("authoredAt")
        changed = code_blame.get("source") == "worktree" or (
            isinstance(comment_time, str) and isinstance(code_time, str)
            and datetime.fromisoformat(code_time) > datetime.fromisoformat(comment_time)
        )
        committed = code_blame.get("source") == "commit"
        shared: list[str] | None = None
        if changed and (_describes_file(comment) or (committed and _is_label(comment))):
            changed = False
        if changed and committed and root is not None:
            words = _changed_terms(root, str(code_blame["commit"]), str(comment["path"]), code_text)
            shared = _shared_terms(_terms(DOC_TAG.sub(" ", body)), words) if words is not None else []
            changed = bool(shared)
        if changed:
            evidence = {"codeLine": code_line + 1, "commentCommit": touched["commit"], "codeCommit": code_blame.get("commit"), "commentAuthoredAt": comment_time, "codeAuthoredAt": code_time, "codeSource": code_blame["source"]}
            if shared is not None:
                evidence["sharedTerms"] = shared[:6]
            found.append(("nearby_code_changed", evidence, "Nearby code changed after this comment."))

    if root is not None:
        links = _missing_links(comment, root)
        if links:
            found.append(("missing_local_reference", {"references": links}, "Comment links to a local path that does not exist."))
    return found
