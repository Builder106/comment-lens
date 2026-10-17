"""Local CLI policy, selection, and artifact behavior."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest

from comment_lens_scanner import core
from comment_lens_scanner.cli import changed_selection, main
from comment_lens_scanner.policy import ConfigError, Policy, findings_for_comment, load_policy


def _git(root: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True, text=True)
    return result.stdout.strip()


def _repo(root: Path) -> None:
    _git(root, "init", "--quiet")
    _git(root, "config", "user.name", "Test")
    _git(root, "config", "user.email", "test@example.com")
    (root / "a.py").write_text("# TODO: resolve this\nvalue = 1\n", encoding="utf-8")
    (root / "b.py").write_text("# Copyright 2026\nvalue = 2\n", encoding="utf-8")
    _git(root, "add", ".")
    _git(root, "commit", "--quiet", "-m", "initial")


def test_policy_config_and_protected_comments(tmp_path: Path) -> None:
    config = tmp_path / ".comment-lens.toml"
    config.write_text('[policy]\nfail_on = "high"\n[policy.rules]\ntodo = "low"\n[thresholds]\nmax_words = 5\n', encoding="utf-8")
    policy = load_policy(tmp_path)
    assert policy.fail_on == "high"
    assert policy.rules["todo"] == "low"
    assert policy.max_words == 5
    config.write_text('[policy]\nfail_on = ["high"]\n', encoding="utf-8")
    with pytest.raises(ConfigError, match="policy.fail_on"):
        load_policy(tmp_path)
    comment = {
        "bodyText": "TODO: update license checks",
        "commentId": "cmt_1",
        "path": "a.py",
        "rawSpan": {"start": {"line0": 0, "columnByte0": 0}, "end": {"line0": 0, "columnByte0": 29}},
    }
    assert any(item["ruleId"] == "todo" for item in findings_for_comment(comment, Policy()))
    comment["bodyText"] = "Copyright 2026"
    assert findings_for_comment(comment, Policy()) == []


def test_changed_comment_selection_and_exit_codes(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _repo(tmp_path)
    (tmp_path / "a.py").write_text("# TODO: resolve this\nvalue = 2\n# FIXME: broken\n", encoding="utf-8")
    paths, ranges = changed_selection(tmp_path, "HEAD")
    assert paths == {"a.py"}
    assert ranges["a.py"] == [(2, 3)]
    assert main(["check", str(tmp_path), "--changed", "HEAD", "--format", "json"]) == 0
    report = json.loads(capsys.readouterr().out)
    assert {item["ruleId"] for item in report["findings"]} == {"fixme", "task_without_reference"}
    assert main(["check", str(tmp_path), "--changed", "HEAD", "--fail-on", "high", "--format", "json"]) == 1
    assert json.loads(capsys.readouterr().out)["summary"]["blocking"] == 1
    assert main(["check", str(tmp_path), "--changed", "HEAD", "--scope", "files", "--format", "json"]) == 0
    assert {item["ruleId"] for item in json.loads(capsys.readouterr().out)["findings"]} == {"todo", "fixme", "task_without_reference", "nearby_code_changed"}


def test_scan_export_formats_and_failure(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _repo(tmp_path)
    assert main(["scan", str(tmp_path)]) == 0
    capsys.readouterr()
    directory = tmp_path / ".comment-lens"
    assert (directory / "scan.json").is_file()
    assert (directory / "comments.ndjson").is_file()
    assert main(["export", str(tmp_path), "--format", "sarif"]) == 0
    sarif = json.loads(capsys.readouterr().out)
    assert sarif["version"] == "2.1.0"
    assert {item["ruleId"] for item in sarif["runs"][0]["results"]} == {"todo", "task_without_reference"}
    assert main(["export", str(tmp_path), "--format", "markdown"]) == 0
    assert "TODO marker" in capsys.readouterr().out
    assert main(["check", str(tmp_path), "--config", "missing.toml"]) == 2


def test_offline_scan_never_requests_missing_parser(tmp_path: Path) -> None:
    _repo(tmp_path)
    with patch.object(core, "_has_offline_parser", return_value=False), patch.object(core, "get_tree_parser") as parser:
        result = core.scan_repository(tmp_path, offline=True)
    parser.assert_not_called()
    assert any(item["status"] == "fallback" for item in result["files"])


def test_baseline_compare_new_existing_and_resolved(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _repo(tmp_path)
    (tmp_path / ".comment-lens.toml").write_text(
        '[baseline]\npath = ".comment-lens-baseline.json"\n[policy.fail_on_rules]\ntodo = "review"\nfixme = "high"\n',
        encoding="utf-8",
    )
    assert main(["baseline", "create", str(tmp_path)]) == 0
    capsys.readouterr()
    baseline = json.loads((tmp_path / ".comment-lens-baseline.json").read_text(encoding="utf-8"))
    assert {item["ruleId"] for item in baseline["findings"]} == {"todo", "task_without_reference"}
    assert all(set(item) == {"findingId", "ruleId", "path"} for item in baseline["findings"])
    assert main(["baseline", "create", str(tmp_path)]) == 2
    capsys.readouterr()
    assert main(["compare", str(tmp_path), "--format", "json"]) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["summary"]["existing"] == 2
    assert report["summary"]["new"] == 0
    assert report["summary"]["blocking"] == 0

    (tmp_path / "a.py").write_text("# TODO: resolve this\nvalue = 2\n# FIXME: broken\n", encoding="utf-8")
    assert main(["compare", str(tmp_path), "--changed", "HEAD", "--format", "json"]) == 1
    report = json.loads(capsys.readouterr().out)
    assert report["summary"]["new"] == 2
    assert report["summary"]["existing"] == 0
    assert report["summary"]["resolvedEvaluated"] is False
    assert {item["ruleId"] for item in report["findings"]} == {"fixme", "task_without_reference"}

    (tmp_path / "a.py").write_text("# resolved\nvalue = 2\n", encoding="utf-8")
    assert main(["compare", str(tmp_path), "--format", "json"]) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["summary"]["resolved"] == 2
    assert report["summary"]["resolvedEvaluated"] is True


def test_baseline_sarif_annotations_and_scanner_failure(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _repo(tmp_path)
    assert main(["baseline", "create", str(tmp_path)]) == 0
    capsys.readouterr()
    (tmp_path / "a.py").write_text("# TODO: resolve this\n# FIXME: broken\n", encoding="utf-8")
    sarif_path = tmp_path / "report.sarif"
    assert main(["compare", str(tmp_path), "--format", "sarif", "--output", str(sarif_path)]) == 0
    results = json.loads(sarif_path.read_text(encoding="utf-8"))["runs"][0]["results"]
    assert {item["ruleId"] for item in results} == {"fixme", "task_without_reference"}
    assert results[0]["baselineState"] == "new"
    assert main(["annotate", "--input", str(sarif_path)]) == 0
    assert "::error file=a.py,line=2" in capsys.readouterr().out

    (tmp_path / "a.py").write_bytes(b"# \xff")
    assert main(["compare", str(tmp_path), "--format", "json"]) == 2
    report = json.loads(capsys.readouterr().out)
    assert report["scanFailed"] is True


def test_comment_ids_survive_unrelated_insertion(tmp_path: Path) -> None:
    _repo(tmp_path)
    before = core.scan_repository(tmp_path, offline=True)
    original = next(item["commentId"] for item in before["_comments"] if item["bodyText"].startswith("TODO"))
    (tmp_path / "a.py").write_text("# unrelated\n# TODO: resolve this\nvalue = 1\n", encoding="utf-8")
    after = core.scan_repository(tmp_path, offline=True)
    current = next(item["commentId"] for item in after["_comments"] if item["bodyText"].startswith("TODO"))
    assert current == original
