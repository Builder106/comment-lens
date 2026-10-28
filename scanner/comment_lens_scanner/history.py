"""Portable, source-free summaries across saved local and CI reports."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from .policy import ConfigError

DIMENSIONS = {"repository": "repository", "path": "path", "language": "language", "rule": "ruleId", "owner": "owner"}


def load_report(path: Path, *, require_date: bool = True) -> dict[str, object]:
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ConfigError(f"cannot read report {path}: {error}") from error
    if not isinstance(report, dict) or report.get("reportVersion") != 1:
        raise ConfigError(f"unsupported report: {path}")
    if not all(isinstance(report.get(key), str) and report[key] for key in ("repository", "scanId")):
        raise ConfigError(f"report identity is invalid: {path}")
    if require_date:
        if not isinstance(report.get("generatedAt"), str):
            raise ConfigError(f"report date is missing: {path}")
        try:
            parsed_date = datetime.fromisoformat(report["generatedAt"])
        except ValueError as error:
            raise ConfigError(f"report date is invalid: {path}") from error
        if parsed_date.tzinfo is None:
            raise ConfigError(f"report date must include a timezone: {path}")
    if report.get("source", "local") not in {"local", "ci"}:
        raise ConfigError(f"report source is invalid: {path}")
    if type(report.get("scanFailed", False)) is not bool:
        raise ConfigError(f"report failure state is invalid: {path}")
    if "fullScan" in report and type(report["fullScan"]) is not bool:
        raise ConfigError(f"report coverage is invalid: {path}")
    if not isinstance(report.get("findings"), list) or not isinstance(report.get("summary"), dict):
        raise ConfigError(f"report findings are invalid: {path}")
    for finding in report["findings"]:
        if not isinstance(finding, dict) or not all(isinstance(finding.get(key), str) and finding[key] for key in ("findingId", "ruleId", "path")):
            raise ConfigError(f"report finding is invalid: {path}")
    return report


def summarize_reports(reports: list[dict[str, object]]) -> dict[str, object]:
    if not reports:
        raise ConfigError("at least one report is required")
    ordered = sorted(reports, key=lambda report: (datetime.fromisoformat(report["generatedAt"]).astimezone(UTC), report["repository"], report["scanId"]))
    seen: set[tuple[str, str]] = set()
    latest: dict[str, dict[str, object]] = {}
    latest_full: dict[str, dict[str, object]] = {}
    previous_full: dict[str, set[str]] = {}
    occurrences: dict[tuple[str, str], dict[str, object]] = {}
    trends = []
    for report in ordered:
        repository = report["repository"]
        identity = (repository, report["scanId"])
        if identity in seen:
            raise ConfigError(f"duplicate scan in history: {repository} {report['scanId']}")
        seen.add(identity)
        if report.get("scanFailed"):
            trends.append({"repository": repository, "scanId": report["scanId"], "generatedAt": report["generatedAt"], "source": report.get("source", "local"), "coverage": "failed", "findings": None, "newSincePrevious": None, "resolvedSincePrevious": None})
            continue
        findings = report["findings"]
        current = {finding["findingId"] for finding in findings}
        full_scan = report.get("fullScan", report.get("selection") == "all tracked files") is True
        prior = previous_full.get(repository) if full_scan else None
        trends.append({
            "repository": repository,
            "scanId": report["scanId"],
            "generatedAt": report["generatedAt"],
            "source": report.get("source", "local"),
            "coverage": "full" if full_scan else "partial",
            "findings": len(current),
            "newSincePrevious": len(current - prior) if prior is not None else None,
            "resolvedSincePrevious": len(prior - current) if prior is not None else None,
        })
        if full_scan:
            previous_full[repository] = current
            latest_full[repository] = report
        latest[repository] = report
        for finding in {item["findingId"]: item for item in findings}.values():
            key = (repository, finding["findingId"])
            entry = occurrences.get(key)
            if entry is None:
                occurrences[key] = {"repository": repository, "findingId": finding["findingId"], "ruleId": finding["ruleId"], "path": finding["path"], "count": 1, "firstSeen": report["generatedAt"], "lastSeen": report["generatedAt"]}
            else:
                entry["count"] += 1
                entry["lastSeen"] = report["generatedAt"]

    current_reports = {repository: latest_full.get(repository, report) for repository, report in latest.items()}
    current_findings = [finding | {"repository": repository} for repository, report in sorted(current_reports.items()) for finding in report["findings"]]
    summary_by: dict[str, list[dict[str, object]]] = {}
    for dimension, field_name in DIMENSIONS.items():
        counts: dict[str, int] = {}
        for finding in current_findings:
            value = finding.get(field_name)
            label = str(value) if value else "(unknown)"
            counts[label] = counts.get(label, 0) + 1
        summary_by[dimension] = [{"value": value, "count": count} for value, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))]
    repeated = sorted((item for item in occurrences.values() if item["count"] > 1), key=lambda item: (-item["count"], item["repository"], item["path"], item["ruleId"]))
    return {
        "historySummaryVersion": 1,
        "repositories": sorted(latest),
        "scans": len(ordered),
        "currentFindings": len(current_findings),
        "coverage": {repository: "full" if repository in latest_full else "partial" for repository in sorted(latest)},
        "repeatedFindings": repeated,
        "trends": trends,
        "summaryBy": summary_by,
    }


def render_summary(summary: dict[str, object], format_name: str) -> str:
    if format_name == "json":
        return json.dumps(summary, indent=2, ensure_ascii=False) + "\n"
    if format_name != "markdown":
        raise ConfigError(f"unsupported summary format: {format_name}")
    def cell(value: object) -> str:
        return str(value).replace("|", "\\|").replace("\n", " ").replace("\r", " ")

    lines = ["# Comment Lens maintenance summary", "", f"Scans: {summary['scans']}", f"Current findings: {summary['currentFindings']}", f"Repeated findings: {len(summary['repeatedFindings'])}", "", "## Trends", "", "| Repository | Scan | Source | Coverage | Findings | New | Resolved |", "| --- | --- | --- | --- | ---: | ---: | ---: |"]
    for trend in summary["trends"]:
        new = trend["newSincePrevious"] if trend["newSincePrevious"] is not None else "n/a"
        resolved = trend["resolvedSincePrevious"] if trend["resolvedSincePrevious"] is not None else "n/a"
        findings = trend["findings"] if trend["findings"] is not None else "n/a"
        lines.append(f"| {cell(trend['repository'])} | {cell(trend['scanId'])} | {cell(trend['source'])} | {cell(trend['coverage'])} | {findings} | {new} | {resolved} |")
    for dimension, groups in summary["summaryBy"].items():
        lines.extend(["", f"## By {dimension}", "", "| Value | Findings |", "| --- | ---: |"])
        for group in groups:
            lines.append(f"| {cell(group['value'])} | {group['count']} |")
    lines.append("")
    return "\n".join(lines)
