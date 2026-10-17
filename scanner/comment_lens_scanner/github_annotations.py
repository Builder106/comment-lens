"""Turn local SARIF results into GitHub Actions workflow annotations."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import unquote

from .policy import ConfigError


def _escape(value: object, *, property_value: bool = False) -> str:
    escaped = str(value).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    if property_value:
        escaped = escaped.replace(":", "%3A").replace(",", "%2C")
    return escaped


def annotations(path: Path, *, limit: int = 50) -> str:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
        results = document["runs"][0]["results"]
    except (OSError, UnicodeError, json.JSONDecodeError, KeyError, IndexError, TypeError) as error:
        raise ConfigError(f"cannot read SARIF report {path}: {error}") from error
    if not isinstance(results, list):
        raise ConfigError("SARIF results must be a list")
    lines = []
    for result in results[:limit]:
        try:
            location = result["locations"][0]["physicalLocation"]
            filename = unquote(location["artifactLocation"]["uri"])
            region = location["region"]
            level = {"error": "error", "warning": "warning", "note": "notice"}[result["level"]]
            lines.append(
                f"::{level} file={_escape(filename, property_value=True)},"
                f"line={int(region['startLine'])},col={int(region['startColumn'])},"
                f"title={_escape('Comment Lens ' + result['ruleId'], property_value=True)}::"
                f"{_escape(result['message']['text'])}"
            )
        except (KeyError, IndexError, TypeError, ValueError) as error:
            raise ConfigError(f"SARIF contains an invalid result: {error}") from error
    if len(results) > limit:
        lines.append(f"::notice title=Comment Lens::Showing {limit} of {len(results)} annotations; see the job summary.")
    return "\n".join(lines) + ("\n" if lines else "")
