"""Local comment-maintenance policy and report formats."""

from __future__ import annotations

import hashlib
import json
import re
import tomllib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from .maintenance import comment_blame, signals

SEVERITY_ORDER = {"low": 0, "review": 1, "high": 2}
DEFAULT_RULES = {
    "todo": "review",
    "fixme": "high",
    "hack": "high",
    "restates_symbol": "review",
    "excessive_verbosity": "review",
    "hedge_stack": "low",
    "promotional_or_vague_language": "low",
    "task_without_reference": "review",
    "aged_task": "review",
    "nearby_code_changed": "review",
    "missing_local_reference": "high",
}
HEDGE_WORDS = re.compile(r"\b(may|might|could|possibly|generally|typically)\b", re.I)
VAGUE_WORDS = re.compile(r"\b(elegant|seamless|robust|powerful|simply|beautiful)\b", re.I)
TASK_MARKERS = re.compile(r"(?m)^\s*(?:\*\s*)?(TODO|FIXME|HACK)\b", re.I)
PROTECTED_MARKERS = re.compile(r"(?im)^\s*(?:copyright\b|license\b|generated\b|noinspection\b|eslint-|fmt:|pragma\b|!)")


class ConfigError(ValueError):
    """A local policy file or command option is invalid."""


@dataclass(frozen=True)
class Policy:
    exclusions: tuple[str, ...] = ()
    fail_on: str | None = None
    max_words: int = 45
    hedge_terms: int = 3
    rules: dict[str, str] = field(default_factory=lambda: DEFAULT_RULES.copy())
    fail_on_rules: dict[str, str | None] = field(default_factory=dict)
    baseline_path: str | None = None
    age_days: int = 180


def _table(value: object, name: str, allowed: set[str]) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ConfigError(f"{name} must be a TOML table")
    unknown = set(value) - allowed
    if unknown:
        raise ConfigError(f"unknown {name} setting: {sorted(unknown)[0]}")
    return value


def _exclusion(value: str) -> str:
    normalized = value.removeprefix("./").rstrip("/")
    if not normalized or normalized.startswith("/") or "\\" in normalized or ".." in normalized.split("/"):
        raise ConfigError(f"invalid exclusion path: {value}")
    return normalized


def load_policy(root: Path, config_path: Path | None = None, *, excludes: tuple[str, ...] = (), fail_on: str | None = None) -> Policy:
    path = config_path or root / ".comment-lens.toml"
    if not path.is_absolute():
        path = root / path
    if config_path is not None and not path.is_file():
        raise ConfigError(f"configuration file does not exist: {path}")
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    except (OSError, UnicodeError, tomllib.TOMLDecodeError) as error:
        raise ConfigError(f"cannot read configuration: {error}") from error
    top = _table(data, "configuration", {"version", "exclude", "policy", "thresholds", "baseline"})
    if type(top.get("version", 1)) is not int or top.get("version", 1) != 1:
        raise ConfigError("configuration version must be 1")

    raw_exclusions = top.get("exclude", [])
    if not isinstance(raw_exclusions, list) or any(not isinstance(item, str) for item in raw_exclusions):
        raise ConfigError("exclude must be a list of relative paths")
    exclusions = tuple(_exclusion(item) for item in [*raw_exclusions, *excludes])

    policy_table = _table(top.get("policy", {}), "policy", {"fail_on", "rules", "fail_on_rules"})
    configured_fail_on = policy_table.get("fail_on", "none")
    if not isinstance(configured_fail_on, str) or configured_fail_on not in {"none", *SEVERITY_ORDER}:
        raise ConfigError("policy.fail_on must be none, low, review, or high")
    chosen_fail_on = fail_on if fail_on is not None else configured_fail_on
    if not isinstance(chosen_fail_on, str) or chosen_fail_on not in {"none", *SEVERITY_ORDER}:
        raise ConfigError("fail-on must be none, low, review, or high")

    rule_table = _table(policy_table.get("rules", {}), "policy.rules", set(DEFAULT_RULES))
    rules = DEFAULT_RULES.copy()
    for rule, severity in rule_table.items():
        if not isinstance(severity, str) or severity not in {"off", *SEVERITY_ORDER}:
            raise ConfigError(f"invalid severity for {rule}")
        rules[rule] = severity

    blocking_table = _table(policy_table.get("fail_on_rules", {}), "policy.fail_on_rules", set(DEFAULT_RULES))
    fail_on_rules: dict[str, str | None] = {}
    for rule, threshold in blocking_table.items():
        if not isinstance(threshold, str) or threshold not in {"none", *SEVERITY_ORDER}:
            raise ConfigError(f"invalid blocking threshold for {rule}")
        fail_on_rules[rule] = None if threshold == "none" else threshold

    baseline_table = _table(top.get("baseline", {}), "baseline", {"path"})
    baseline_path = baseline_table.get("path")
    if baseline_path is not None:
        if not isinstance(baseline_path, str):
            raise ConfigError("baseline.path must be a relative path")
        baseline_path = _exclusion(baseline_path)

    thresholds = _table(top.get("thresholds", {}), "thresholds", {"max_words", "hedge_terms", "age_days"})
    max_words = thresholds.get("max_words", 45)
    hedge_terms = thresholds.get("hedge_terms", 3)
    age_days = thresholds.get("age_days", 180)
    if type(max_words) is not int or max_words < 1:
        raise ConfigError("thresholds.max_words must be a positive integer")
    if type(hedge_terms) is not int or hedge_terms < 1:
        raise ConfigError("thresholds.hedge_terms must be a positive integer")
    if type(age_days) is not int or age_days < 1:
        raise ConfigError("thresholds.age_days must be a positive integer")
    return Policy(exclusions, None if chosen_fail_on == "none" else chosen_fail_on, max_words, hedge_terms, rules, fail_on_rules, baseline_path, age_days)


def _location(comment: dict[str, object]) -> tuple[int, int, int]:
    span = comment["rawSpan"]
    start = span["start"]
    end = span["end"]
    start_line = start["line0"] + 1
    end_line = end["line0"] + (1 if end["columnByte0"] else 0)
    return start_line, start["columnByte0"] + 1, max(start_line, end_line)


def _selected(comment: dict[str, object], ranges: dict[str, list[tuple[int, int]]]) -> bool:
    start, _, end = _location(comment)
    return any(first <= end and start <= last for first, last in ranges.get(comment["path"], []))


def findings_for_comment(comment: dict[str, object], policy: Policy, *, as_of: datetime | None = None, root: Path | None = None) -> list[dict[str, object]]:
    body = str(comment["bodyText"])
    if PROTECTED_MARKERS.search(body.strip()):
        return []
    symbol_context = comment.get("symbol")
    enclosing = symbol_context.get("enclosing") if isinstance(symbol_context, dict) else None
    symbol = enclosing.get("name") if isinstance(enclosing, dict) else None
    line, column, _ = _location(comment)
    blame = comment_blame(comment) if "git" in comment else None
    findings: list[dict[str, object]] = []

    def add(rule: str, evidence: dict[str, object], message: str) -> None:
        severity = policy.rules[rule]
        if severity == "off":
            return
        identity = f"{comment['commentId']}\0{rule}"
        findings.append({
            "findingId": "fnd_" + hashlib.sha256(identity.encode()).hexdigest(),
            "commentId": comment["commentId"],
            "ruleId": rule,
            "severity": severity,
            "message": message,
            "path": comment["path"],
            "language": comment.get("language", "unknown"),
            "owner": blame.get("authorName") if blame and blame.get("source") == "commit" else None,
            "authoredAt": blame.get("authoredAt") if blame and blame.get("source") == "commit" else None,
            "line": line,
            "column": column,
            "evidence": evidence,
            "sourceContext": comment.get("sourceContext"),
        })

    for marker in sorted({match.upper() for match in TASK_MARKERS.findall(body)}):
        add(marker.lower(), {"marker": marker}, f"{marker} marker needs a resolution path.")
    if isinstance(symbol, str) and re.search(rf"\b{re.escape(symbol)}\b", body, re.I):
        add("restates_symbol", {"symbol": symbol}, "Comment repeats the enclosing symbol name.")
    word_count = len(re.findall(r"\b\w+\b", body))
    if word_count > policy.max_words:
        add("excessive_verbosity", {"wordCount": word_count, "maxWords": policy.max_words}, "Comment exceeds the configured word limit.")
    hedge_count = len(HEDGE_WORDS.findall(body))
    if hedge_count >= policy.hedge_terms:
        add("hedge_stack", {"hedgeCount": hedge_count, "minimum": policy.hedge_terms}, "Comment uses repeated uncertainty terms.")
    vague_terms = sorted({match.lower() for match in VAGUE_WORDS.findall(body)})
    if vague_terms:
        add("promotional_or_vague_language", {"terms": vague_terms}, "Comment uses vague or promotional wording.")
    if "git" in comment:
        for rule, evidence, message in signals(comment, as_of=as_of or datetime.now(timezone.utc), age_days=policy.age_days, root=root):
            add(rule, evidence, message)
    return findings


def _group_counts(findings: list[dict[str, object]], key: str) -> list[dict[str, object]]:
    counts: dict[str, int] = {}
    for finding in findings:
        value = finding.get(key)
        label = str(value) if value else "(unknown)"
        counts[label] = counts.get(label, 0) + 1
    return [{"value": value, "count": count} for value, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))]


def build_report(scan: dict[str, object], policy: Policy, *, selection: str = "all tracked files", ranges: dict[str, list[tuple[int, int]]] | None = None, baseline: dict[str, object] | None = None, full_scan: bool = True, root: Path | None = None, source: str = "local") -> dict[str, object]:
    comments = [comment for comment in scan["_comments"] if ranges is None or _selected(comment, ranges)]
    as_of = datetime.fromisoformat(scan["completedAt"])
    findings = [finding for comment in comments for finding in findings_for_comment(comment, policy, as_of=as_of, root=root)]
    for finding in findings:
        finding["repository"] = scan["repoId"]
    findings.sort(key=lambda item: (item["path"], item["line"], item["column"], item["ruleId"]))
    existing_ids = {item["findingId"] for item in baseline["findings"]} if baseline is not None else set()
    for finding in findings:
        finding["baselineState"] = "existing" if finding["findingId"] in existing_ids else "new"
    current_ids = {item["findingId"] for item in findings}
    resolved = (
        [item for item in baseline["findings"] if item["findingId"] not in current_ids]
        if baseline is not None and full_scan else []
    )
    blocking = sum(
        1 for finding in findings
        if finding["baselineState"] == "new"
        and (threshold := policy.fail_on_rules.get(finding["ruleId"], policy.fail_on)) is not None
        and SEVERITY_ORDER[finding["severity"]] >= SEVERITY_ORDER[threshold]
    )
    files = [item for item in scan["files"] if item["status"] != "excluded"]
    return {
        "reportVersion": 1,
        "scanId": scan["scanId"],
        "repository": scan["repoId"],
        "headCommit": scan["headCommit"],
        "generatedAt": scan["completedAt"],
        "source": source,
        "fullScan": full_scan,
        "selection": selection,
        "failOn": policy.fail_on,
        "summary": {"files": len(files), "comments": len(comments), "findings": len(findings), "new": sum(item["baselineState"] == "new" for item in findings), "existing": sum(item["baselineState"] == "existing" for item in findings), "resolved": len(resolved), "resolvedEvaluated": baseline is not None and full_scan, "blocking": blocking},
        "baseline": baseline is not None,
        "scanFailed": any(item["severity"] == "error" for item in scan["diagnostics"]) or any(item["status"] == "failed" for item in scan["files"]),
        "resolved": resolved,
        "summaryBy": {
            "repository": _group_counts(findings, "repository"),
            "path": _group_counts(findings, "path"),
            "language": _group_counts(findings, "language"),
            "rule": _group_counts(findings, "ruleId"),
            "owner": _group_counts(findings, "owner"),
        },
        "diagnostics": scan["diagnostics"],
        "findings": findings,
    }


def _markdown(report: dict[str, object]) -> str:
    summary = report["summary"]
    tick = chr(96)
    lines = [
        "# Comment Lens report",
        "",
        f"Repository: {tick}{report['repository']}{tick}",
        f"Selection: {report['selection']}",
        f"Comments: {summary['comments']}, New: {summary['new']}, Existing: {summary['existing']}, Blocking: {summary['blocking']}",
        "",
    ]
    if report["baseline"]:
        lines.extend([f"Resolved: {summary['resolved']}" if summary["resolvedEvaluated"] else "Resolved: not evaluated for partial scans", ""])
    if report["scanFailed"]:
        lines.extend(["Scanner failure: see diagnostics in JSON output.", ""])
    if not report["findings"]:
        lines.extend(["No findings.", ""])
    for finding in report["findings"]:
        lines.extend([
            f"## {finding['path']}:{finding['line']}: {finding['ruleId']} ({finding['severity']}, {finding['baselineState']})",
            "",
            finding["message"],
            "",
            f"Evidence: {tick}{json.dumps(finding['evidence'], ensure_ascii=False)}{tick}",
            "",
        ])
        context = finding.get("sourceContext")
        if context:
            longest = max((len(match.group()) for match in re.finditer(re.escape(tick) + r"+", context)), default=0)
            fence = tick * max(3, longest + 1)
            lines.extend([f"{fence}text", context.rstrip(), fence, ""])
    if report["resolved"]:
        lines.extend(["## Resolved since baseline", ""])
        for finding in report["resolved"]:
            lines.append(f"- {tick}{finding['path']}{tick}: {finding['ruleId']}")
        lines.append("")
    return "\n".join(lines)


def _sarif(report: dict[str, object]) -> str:
    rules = sorted({item["ruleId"] for item in report["findings"]})
    results = []
    for finding in report["findings"]:
        if report["baseline"] and finding["baselineState"] == "existing":
            continue
        level = {"low": "note", "review": "warning", "high": "error"}[finding["severity"]]
        results.append({
            "ruleId": finding["ruleId"],
            "baselineState": "new" if finding["baselineState"] == "new" else "unchanged",
            "level": level,
            "message": {"text": finding["message"]},
            "locations": [{
                "physicalLocation": {
                    "artifactLocation": {"uri": quote(finding["path"], safe="/")},
                    "region": {"startLine": finding["line"], "startColumn": finding["column"]},
                }
            }],
            "properties": {
                "findingId": finding["findingId"],
                "commentId": finding["commentId"],
                "evidence": finding["evidence"],
                "sourceContext": finding["sourceContext"],
            },
        })
    sarif = {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [{"tool": {"driver": {
            "name": "Comment Lens",
            "version": "0.1.0",
            "rules": [{"id": rule, "shortDescription": {"text": rule.replace("_", " ")}} for rule in rules],
        }}, "results": results}],
    }
    return json.dumps(sarif, indent=2, ensure_ascii=False) + "\n"


def render_report(report: dict[str, object], format_name: str) -> str:
    if format_name == "json":
        return json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if format_name == "markdown":
        return _markdown(report)
    if format_name == "sarif":
        return _sarif(report)
    raise ConfigError(f"unsupported format: {format_name}")
