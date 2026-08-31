"""Comment extraction, provenance, and deterministic review prioritization."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

try:
    from tree_sitter import Language, Parser
except ImportError:  # pragma: no cover
    Language = Parser = None  # type: ignore[assignment]

try:
    from tree_sitter_languages import get_parser as get_tree_parser
except ImportError:  # pragma: no cover
    get_tree_parser = None

try:
    from pygments import lex
    from pygments.lexers import get_lexer_for_filename
    from pygments.token import Comment as CommentToken
except ImportError:  # pragma: no cover
    lex = get_lexer_for_filename = CommentToken = None  # type: ignore[assignment]

SCHEMA_VERSION = 1
RULES_VERSION = "1"
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_CONTEXT_BYTES = 8 * 1024
DEFAULT_EXCLUSIONS = (".git", "node_modules", ".dart_tool", "build", "dist", "coverage", "target", ".venv", "Pods", "DerivedData", "vendor", "third_party", "generated")
GENERATED_SUFFIXES = (".g.dart", ".freezed.dart")
FILENAMES = {"CMakeLists.txt", "Dockerfile", "Makefile", "Podfile"}
LANGUAGES = {
    ".js": "javascript", ".jsx": "javascript", ".ts": "typescript", ".tsx": "tsx", ".py": "python", ".dart": "dart", ".swift": "swift", ".kt": "kotlin", ".kts": "kotlin", ".c": "c", ".h": "c", ".cc": "cpp", ".cpp": "cpp", ".cxx": "cpp", ".hpp": "cpp", ".sh": "bash", ".bash": "bash", ".html": "html", ".htm": "html", ".xml": "xml", ".css": "css", ".scss": "scss", ".yaml": "yaml", ".yml": "yaml", ".jsonc": "json", ".cmake": "cmake", ".xcconfig": "ini", ".pbxproj": "javascript",
}
COMMENT_PATTERNS = (("line", re.compile(r"(?m)(?P<indent>^[ \t]*)(?P<raw>//[^\n]*|#[^\n]*|--[^\n]*)")), ("block", re.compile(r"(?s)(?P<raw>/\*.*?\*/|<!--.*?-->|'''(?:(?!''').)*'''|\"\"\"(?:(?!\"\"\").)*\"\"\")")))

@dataclass(frozen=True)
class Diagnostic:
    path: str | None
    severity: str
    code: str
    message: str

def _point(data: bytes, offset: int) -> dict[str, int]:
    before = data[:offset]
    line = before.count(b"\n")
    column = len(before.rsplit(b"\n", 1)[-1])
    return {"line0": line, "columnByte0": column}

def _span(data: bytes, start: int, end: int, precision: str = "exact") -> dict[str, Any]:
    return {"startByte": start, "endByte": end, "start": _point(data, start), "end": _point(data, end), "endExclusive": True, "precision": precision}

def _normalize(text: str) -> str:
    return "\n".join(line.strip() for line in text.replace("\r\n", "\n").splitlines()).strip()

def _language(path: str) -> str | None:
    name = Path(path).name
    return "cmake" if name == "CMakeLists.txt" else "shell" if name in {"Makefile", "Dockerfile", "Podfile"} else LANGUAGES.get(Path(path).suffix.lower())

def _git(root: Path, args: list[str]) -> tuple[str, str | None]:
    try:
        env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSCOPE": "1"}
        result = subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "-c", "diff.external=", "-c", "core.fsmonitor=false", "-C", str(root), *args], check=True, capture_output=True, text=True, timeout=30, env=env)
        return result.stdout, None
    except (OSError, subprocess.SubprocessError) as error:
        return "", str(error)

def _tracked(root: Path, include_untracked: bool) -> tuple[list[str], Diagnostic | None]:
    output, error = _git(root, ["ls-files", "-z"])
    if error:
        if include_untracked:
            paths = [str(path.relative_to(root)) for path in root.rglob("*") if path.is_file() and not path.is_symlink()]
            return sorted(paths), Diagnostic(None, "warning", "git_failed", "Git metadata unavailable; scanning explicit files.")
        return [], Diagnostic(None, "error", "git_failed", error)
    paths = [item for item in output.split("\0") if item]
    if include_untracked:
        paths.extend(str(path.relative_to(root)) for path in root.rglob("*") if path.is_file() and not path.is_symlink() and str(path.relative_to(root)) not in paths)
    return sorted(set(paths)), None

def _blame(root: Path, path: str, line_count: int) -> tuple[list[dict[str, Any]], str | None]:
    output, error = _git(root, ["blame", "--line-porcelain", "--", path])
    if not output:
        return ([{"startLine0": 0, "endLine0": max(0, line_count - 1), "commit": None, "authorName": None, "authorEmail": None, "authoredAt": None, "source": "unavailable"}], error)
    spans: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    remaining = 0
    for raw in output.splitlines():
        if raw and not raw.startswith(("\t", " ")) and len(raw.split()) >= 3 and re.fullmatch(r"[0-9a-f^]+", raw.split()[0]):
            parts = raw.split()
            start = int(parts[2])
            count = int(parts[3]) if len(parts) > 3 else 1
            current = {"startLine0": start, "endLine0": start + count - 1, "commit": parts[0], "authorName": None, "authorEmail": None, "authoredAt": None, "source": "commit"}
            spans.append(current)
            remaining = count
        elif current is not None and raw.startswith("author "):
            current["authorName"] = raw[7:]
        elif current is not None and raw.startswith("author-mail "):
            current["authorEmail"] = raw[12:].strip("<>")
        elif current is not None and raw.startswith("author-time "):
            current["authoredAt"] = datetime.fromtimestamp(int(raw[12:]), timezone.utc).isoformat()
    return spans, None

def _findings(body: str, symbol: str | None, protected: bool) -> dict[str, Any]:
    if protected:
        return {"eligible": False, "priorityScore": None, "band": "protected", "ruleSetVersion": RULES_VERSION, "findings": []}
    findings: list[dict[str, Any]] = []
    words = re.findall(r"\b\w+\b", body)
    def add(rule: str, contribution: int, evidence: dict[str, Any], explanation: str) -> None:
        findings.append({"ruleId": rule, "contribution": contribution, "evidence": evidence, "explanation": explanation})
    if re.search(r"\b(this function|this method|this class|helper function)\b", body, re.I): add("generic_template", 12, {}, "Uses a generic explanatory template.")
    if symbol and symbol.lower() in body.lower(): add("restates_symbol", 14, {"symbol": symbol}, "Repeats the enclosing symbol name.")
    if len(words) > 45: add("excessive_verbosity", 10, {"wordCount": len(words)}, "The comment is unusually long for a source comment.")
    if len(re.findall(r"\b(may|might|could|possibly|generally|typically)\b", body, re.I)) >= 3: add("hedge_stack", 8, {}, "Contains several uncertainty qualifiers.")
    if re.search(r"\b(elegant|seamless|robust|powerful|simply|beautiful)\b", body, re.I): add("promotional_or_vague_language", 8, {}, "Uses vague or promotional wording.")
    score = min(100, sum(item["contribution"] for item in findings))
    return {"eligible": True, "priorityScore": score, "band": "high" if score >= 40 else "review" if score >= 20 else "low", "ruleSetVersion": RULES_VERSION, "findings": findings}

def _protected(body: str) -> bool:
    normalized = body.strip()
    return bool(
        re.search(r"copyright|license|generated|noinspection|eslint-|fmt:|pragma|^!", normalized, re.I)
        or re.fullmatch(r"(?:TODO|FIXME)(?:\s*[:\-].*)?", normalized, re.I)
    )

def _extract_fallback(data: bytes, path: str) -> tuple[list[tuple[int, int, str, str]], str, list[Diagnostic]]:
    text = data.decode("utf-8")
    found: list[tuple[int, int, str, str]] = []
    diagnostics: list[Diagnostic] = []
    if get_tree_parser:
        try:
            language = _language(path)
            tree = get_tree_parser(language)
            tree.parse(data)
            nodes = []
            def walk(node: Any) -> None:
                if node.type == "comment": nodes.append(node)
                for child in node.children: walk(child)
            walk(tree.root_node)
            for node in nodes:
                raw = data[node.start_byte:node.end_byte].decode("utf-8", errors="replace")
                found.append((node.start_byte, node.end_byte, "block" if raw.lstrip().startswith(("/*", "<!--", "'''", '"""')) else "line", raw))
            return sorted(found), "tree-sitter", diagnostics
        except Exception as error:
            diagnostics.append(Diagnostic(path, "warning", "parse_failed", f"Tree-sitter parse failed: {error}"))
    else:
        diagnostics.append(Diagnostic(path, "warning", "grammar_missing", "Tree-sitter grammar support is unavailable."))
    if get_lexer_for_filename and lex:
        try:
            lexer = get_lexer_for_filename(path)
            cursor = 0
            for token, value in lex(text, lexer):
                start = len(text[:cursor].encode("utf-8")); cursor += len(value)
                end = len(text[:cursor].encode("utf-8"))
                if token in CommentToken or str(token).startswith("Token.Comment"):
                    found.append((start, end, "line" if "Single" in str(token) else "block", value))
            if found:
                return found, "pygments", diagnostics
        except Exception as error:
            diagnostics.append(Diagnostic(path, "warning", "parse_failed", f"Pygments parse failed: {error}"))
    return [], "tree-sitter", diagnostics

def _comment_record(root: Path, repository_id: str, scan_id: str, path: str, data: bytes, start: int, end: int, kind: str, raw: str, parser: str, blame: list[dict[str, Any]], blame_error: str | None, collision: int) -> dict[str, Any]:
    body = re.sub(r"^\s*(//|#|--|/\*+|\*+|<!--|'''|\"\"\")|(?:\*/|-->|'''|\"\"\")\s*$", "", raw, flags=re.M).strip()
    symbol = None
    before = data[:start].decode("utf-8", errors="replace")
    names = re.findall(r"(?:function|class|def|struct|fn)\s+([A-Za-z_]\w*)", before[-2000:])
    if names: symbol = names[-1]
    normalized = _normalize(body)
    identity = "\0".join((repository_id, path, kind, normalized, symbol or "", "standalone", str(collision)))
    comment_id = "cmt_" + hashlib.sha256(identity.encode()).hexdigest()
    start_line = _point(data, start)["line0"]; end_line = _point(data, end)["line0"]
    lines = data.splitlines(keepends=True); lo = max(0, start_line - 5); hi = min(len(lines), end_line + 6)
    context = b"".join(lines[lo:hi])[:MAX_CONTEXT_BYTES].decode("utf-8", errors="replace")
    protected = _protected(body)
    return {"commentId": comment_id, "scanId": scan_id, "path": path, "language": _language(path) or "unknown", "kind": kind, "placement": "standalone", "rawText": raw, "bodyText": body, "rawSpan": _span(data, start, end), "bodySpan": None, "fragments": [_span(data, start, end)], "tags": re.findall(r"\b(TODO|FIXME|NOTE|HACK)\b", body, re.I), "parser": parser, "symbol": {"enclosing": {"kind": "function", "name": symbol, "qualifiedName": symbol, "signature": None, "span": _span(data, 0, start, "approximate")} , "attachedTo": None, "resolution": "tree-sitter" if parser == "tree-sitter" else "none"} if symbol else None, "git": {"available": bool(blame and blame[0].get("commit")), "primaryCommit": blame[0].get("commit") if blame else None, "blameSpans": blame, "error": blame_error}, "sourceContext": context, "score": _findings(body, symbol, protected)}

def scan_repository(root: Path, *, include_untracked: bool = False, exclusions: Iterable[str] = DEFAULT_EXCLUSIONS, repository_id: str | None = None, scan_id: str | None = None) -> dict[str, Any]:
    root = root.resolve(); started = datetime.now(timezone.utc).isoformat(); paths, diagnostic = _tracked(root, include_untracked); diagnostics = [asdict(diagnostic)] if diagnostic else []; files = []; comments = []
    repo_identity = repository_id or os.environ.get("COMMENT_LENS_REPOSITORY_ID") or root.name
    effective_scan_id = scan_id or "scan_" + hashlib.sha256((repo_identity + started).encode()).hexdigest()[:16]
    exclusion_set = tuple(exclusions); head, _ = _git(root, ["rev-parse", "HEAD"]); head = head.strip() or None
    for path in paths:
        reason = next((f"excluded:{rule}" for rule in exclusion_set if rule and (path == rule or path.startswith(rule + "/"))), None)
        if any(path.endswith(suffix) for suffix in GENERATED_SUFFIXES): reason = "excluded:generated-pattern"
        language = _language(path)
        if reason or language is None:
            files.append({"path": path, "discovery": "tracked", "language": language, "status": "excluded", "parser": None, "sizeBytes": 0, "contentSha256": None, "encoding": None, "lineCount": None, "exclusionReason": reason or "unsupported_language", "matchedRule": reason, "parseErrorCount": 0}); continue
        file_path = root / path
        if file_path.is_symlink():
            files.append({"path": path, "discovery": "tracked", "language": language, "status": "excluded", "parser": None, "sizeBytes": 0, "contentSha256": None, "encoding": None, "lineCount": None, "exclusionReason": "symlink", "matchedRule": "symlink", "parseErrorCount": 0})
            continue
        try: data = file_path.read_bytes()
        except OSError as error:
            diagnostics.append(asdict(Diagnostic(path, "error", "permission_denied", str(error)))); continue
        if len(data) > MAX_FILE_BYTES:
            files.append({"path": path, "discovery": "tracked", "language": language, "status": "excluded", "parser": None, "sizeBytes": len(data), "contentSha256": None, "encoding": None, "lineCount": None, "exclusionReason": "file_too_large", "matchedRule": "max_file_bytes", "parseErrorCount": 0})
            diagnostics.append(asdict(Diagnostic(path, "warning", "file_too_large", "File exceeds 5 MiB."))); continue
        if b"\0" in data:
            files.append({"path": path, "discovery": "tracked", "language": language, "status": "excluded", "parser": None, "sizeBytes": len(data), "contentSha256": None, "encoding": None, "lineCount": None, "exclusionReason": "binary_file", "matchedRule": "nul_byte", "parseErrorCount": 0})
            diagnostics.append(asdict(Diagnostic(path, "warning", "binary_file", "NUL byte detected."))); continue
        try: data.decode("utf-8")
        except UnicodeDecodeError as error:
            files.append({"path": path, "discovery": "tracked", "language": language, "status": "failed", "parser": None, "sizeBytes": len(data), "contentSha256": None, "encoding": None, "lineCount": None, "exclusionReason": "decode_failed", "matchedRule": None, "parseErrorCount": 1})
            diagnostics.append(asdict(Diagnostic(path, "warning", "decode_failed", str(error)))); continue
        extracted, parser, parser_diagnostics = _extract_fallback(data, path); diagnostics.extend(asdict(item) for item in parser_diagnostics)
        blame, blame_error = _blame(root, path, data.count(b"\n") + 1)
        files.append({"path": path, "discovery": "tracked", "language": language, "status": "parsed_with_errors" if parser_diagnostics else "parsed", "parser": parser, "sizeBytes": len(data), "contentSha256": hashlib.sha256(data).hexdigest(), "encoding": "utf-8", "lineCount": data.count(b"\n") + 1, "exclusionReason": None, "matchedRule": None, "parseErrorCount": len(parser_diagnostics)})
        for index, (start, end, kind, raw) in enumerate(extracted): comments.append(_comment_record(root, repo_identity, effective_scan_id, path, data, start, end, kind, raw, parser, blame, blame_error, index))
    config_hash = hashlib.sha256(json.dumps(sorted(exclusion_set)).encode()).hexdigest()
    completed = datetime.now(timezone.utc).isoformat()
    return {"schemaVersion": SCHEMA_VERSION, "scanId": effective_scan_id, "repoId": repo_identity, "sourceMode": "worktree", "headCommit": head, "worktreeFingerprint": hashlib.sha256("\0".join(f["path"] + str(f["contentSha256"]) for f in files).encode()).hexdigest(), "configHash": config_hash, "extractorVersion": "comment-lens-scanner/0.1.0", "parserVersions": {"tree-sitter": "0.22+", "pygments": "2.17+"}, "startedAt": started, "completedAt": completed, "files": files, "diagnostics": diagnostics, "_comments": comments}

def write_output(result: dict[str, Any], manifest_path: Path, ndjson_path: Path | None = None) -> None:
    manifest = {key: value for key, value in result.items() if key != "_comments"}
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if ndjson_path:
        ndjson_path.parent.mkdir(parents=True, exist_ok=True)
        with ndjson_path.open("w", encoding="utf-8") as stream:
            for comment in result["_comments"]: stream.write(json.dumps(comment, ensure_ascii=False) + "\n")

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Inventory source comments without executing repository code.")
    parser.add_argument("root", type=Path); parser.add_argument("--include-untracked", action="store_true"); parser.add_argument("--manifest", type=Path, default=Path("scan.json")); parser.add_argument("--ndjson", type=Path, default=Path("comments.ndjson")); parser.add_argument("--output", type=Path, help="Directory for scan.json and comments.ndjson"); parser.add_argument("--repository", help="Repository identifier"); parser.add_argument("--repository-id", help="Repository identifier"); parser.add_argument("--scan-id", help="Accepted for worker compatibility"); parser.add_argument("--exclude", action="append", default=[])
    args = parser.parse_args(argv); output = args.output; manifest = output / "scan.json" if output else args.manifest; ndjson = output / "comments.ndjson" if output else args.ndjson; repository_id = args.repository_id or args.repository or os.environ.get("COMMENT_LENS_REPOSITORY_ID", args.root.name); result = scan_repository(args.root, include_untracked=args.include_untracked, exclusions=tuple(args.exclude) or DEFAULT_EXCLUSIONS, repository_id=repository_id, scan_id=args.scan_id); write_output(result, manifest, ndjson); print(json.dumps({"scanId": result["scanId"], "files": len(result["files"]), "comments": len(result["_comments"]), "diagnostics": len(result["diagnostics"]) })); return 0

if __name__ == "__main__": raise SystemExit(main())
