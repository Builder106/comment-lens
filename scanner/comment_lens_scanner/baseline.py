"""Minimal repository-owned baselines for deterministic findings."""

from __future__ import annotations

import json
from pathlib import Path

from .policy import ConfigError

BASELINE_VERSION = 1


def create_baseline(report: dict[str, object]) -> dict[str, object]:
    return {
        "baselineVersion": BASELINE_VERSION,
        "repository": report["repository"],
        "findings": [
            {"findingId": item["findingId"], "ruleId": item["ruleId"], "path": item["path"]}
            for item in sorted(report["findings"], key=lambda finding: finding["findingId"])
        ],
    }


def load_baseline(path: Path, repository: str) -> dict[str, object]:
    try:
        baseline = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ConfigError(f"cannot read baseline {path}: {error}") from error
    if not isinstance(baseline, dict) or type(baseline.get("baselineVersion")) is not int or baseline["baselineVersion"] != BASELINE_VERSION:
        raise ConfigError("unsupported baseline version")
    if baseline.get("repository") != repository:
        raise ConfigError("baseline repository does not match this scan")
    findings = baseline.get("findings")
    if not isinstance(findings, list):
        raise ConfigError("baseline findings must be a list")
    seen: set[str] = set()
    for item in findings:
        if not isinstance(item, dict) or set(item) != {"findingId", "ruleId", "path"}:
            raise ConfigError("baseline contains an invalid finding")
        if any(not isinstance(item[key], str) or not item[key] for key in ("findingId", "ruleId", "path")):
            raise ConfigError("baseline contains an invalid finding")
        if item["findingId"] in seen:
            raise ConfigError("baseline contains duplicate finding IDs")
        seen.add(item["findingId"])
    return baseline


def write_baseline(path: Path, baseline: dict[str, object], *, force: bool = False) -> None:
    if path.exists() and not force:
        raise ConfigError(f"baseline already exists: {path}; pass --force to replace it")
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = "w" if force else "x"
    with path.open(mode, encoding="utf-8") as stream:
        json.dump(baseline, stream, indent=2, ensure_ascii=False)
        stream.write("\n")
