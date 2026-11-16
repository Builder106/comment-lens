"""Precision of the nearby_code_changed and aged_task rules, against real git history."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest

from comment_lens_scanner import core
from comment_lens_scanner.cli import main


def _git(root: Path, *args: str, date: str | None = None) -> str:
    env = {**os.environ, "GIT_AUTHOR_DATE": date, "GIT_COMMITTER_DATE": date} if date else None
    return subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True, text=True, env=env).stdout.strip()


def _init(root: Path) -> None:
    _git(root, "init", "--quiet")
    _git(root, "config", "user.name", "Test")
    _git(root, "config", "user.email", "test@example.com")


def _commit(root: Path, files: dict[str, str], date: str, message: str = "change") -> str:
    for name, text in files.items():
        (root / name).write_text(text, encoding="utf-8")
    _git(root, "add", ".")
    _git(root, "commit", "--quiet", "-m", message, date=date)
    return _git(root, "rev-parse", "HEAD")


def _findings(root: Path, capsys: pytest.CaptureFixture[str], rule: str) -> list[dict[str, object]]:
    assert main(["check", str(root), "--format", "json"]) == 0
    return [item for item in json.loads(capsys.readouterr().out)["findings"] if item["ruleId"] == rule]


HIGHLIGHT = "def highlight(code):\n    # Skip highlighting when pygments is missing\n    if not pygments:\n        return code\n    return code\n"


def test_change_that_removes_a_word_the_comment_mentions_is_flagged(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _init(tmp_path)
    _commit(tmp_path, {"a.py": HIGHLIGHT}, "2020-01-01T00:00:00Z")
    _commit(tmp_path, {"a.py": HIGHLIGHT.replace("not pygments", "disable_colors")}, "2022-01-01T00:00:00Z")
    (found,) = _findings(tmp_path, capsys, "nearby_code_changed")
    assert "pygments" in found["evidence"]["sharedTerms"]


def test_changed_number_the_comment_states_is_flagged(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    source = "def upload():\n    # Retry up to 3 times\n    retries = 3\n    return retries\n"
    _init(tmp_path)
    _commit(tmp_path, {"a.py": source}, "2020-01-01T00:00:00Z")
    _commit(tmp_path, {"a.py": source.replace("= 3", "= 5")}, "2022-01-01T00:00:00Z")
    (found,) = _findings(tmp_path, capsys, "nearby_code_changed")
    assert found["evidence"]["sharedTerms"] == ["3"]


def test_formatting_only_change_is_not_flagged(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    before = "def build():\n    # Combine the inputs into value\n    value = join('a', 'b')\n    return value\n"
    after = before.replace("join('a', 'b')", 'join(\n        "a",\n        "b",\n    )')
    _init(tmp_path)
    _commit(tmp_path, {"a.py": before}, "2020-01-01T00:00:00Z")
    _commit(tmp_path, {"a.py": after}, "2022-01-01T00:00:00Z", "reformat")
    assert _findings(tmp_path, capsys, "nearby_code_changed") == []


def test_unrelated_change_is_not_flagged(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    source = "def upload():\n    # Retry failed uploads\n    delay = 5\n    return delay\n"
    _init(tmp_path)
    _commit(tmp_path, {"a.py": source}, "2020-01-01T00:00:00Z")
    _commit(tmp_path, {"a.py": source.replace("5", "10")}, "2022-01-01T00:00:00Z")
    assert _findings(tmp_path, capsys, "nearby_code_changed") == []


def test_banner_and_file_header_comments_are_not_flagged(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    source = "# mypy: strict\nimport os\n\n# --------------------\n# Helpers\n# --------------------\n\nvalue = os.sep\n"
    _init(tmp_path)
    _commit(tmp_path, {"a.py": source}, "2020-01-01T00:00:00Z")
    _commit(tmp_path, {"a.py": source.replace("import os", "import sys, os").replace("os.sep", "sys.platform")}, "2022-01-01T00:00:00Z")
    assert _findings(tmp_path, capsys, "nearby_code_changed") == []
    js = "/**\n * @fileoverview Parses things\n */\nconst a = 1;\n"
    _commit(tmp_path, {"b.js": js}, "2022-02-01T00:00:00Z")
    _commit(tmp_path, {"b.js": js.replace("a = 1", "b = 2")}, "2022-03-01T00:00:00Z")
    assert _findings(tmp_path, capsys, "nearby_code_changed") == []


def test_change_git_cannot_show_is_not_reported(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _init(tmp_path)
    _commit(tmp_path, {"a.py": HIGHLIGHT}, "2020-01-01T00:00:00Z")
    _commit(tmp_path, {"a.py": HIGHLIGHT.replace("not pygments", "disable_colors")}, "2022-01-01T00:00:00Z")
    with patch("comment_lens_scanner.maintenance._hunks", return_value=()):
        assert _findings(tmp_path, capsys, "nearby_code_changed") == []


def test_short_label_comments_are_skipped_unless_they_state_a_number(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    label = "def f():\n    value = 1\n    # Retry loop\n    retry = 1\n    return retry\n"
    number = "def g():\n    value = 1\n    # 5 seconds\n    timeout = 5\n    return timeout\n"
    _init(tmp_path)
    _commit(tmp_path, {"a.py": label, "b.py": number}, "2020-01-01T00:00:00Z")
    _commit(tmp_path, {"a.py": label.replace("retry = 1", "retry = 2"), "b.py": number.replace("timeout = 5", "timeout = 10")}, "2022-01-01T00:00:00Z")
    assert [item["path"] for item in _findings(tmp_path, capsys, "nearby_code_changed")] == ["b.py"]


def test_blame_ignores_whitespace_only_edits(tmp_path: Path) -> None:
    _init(tmp_path)
    first = _commit(tmp_path, {"a.py": "if True:\n    value = 1\n"}, "2020-01-01T00:00:00Z")
    _commit(tmp_path, {"a.py": "if True:\n        value = 1\n"}, "2022-01-01T00:00:00Z", "reindent")
    spans, error = core._blame(tmp_path, "a.py", 2)
    assert error is None
    assert {span["commit"] for span in spans} == {first}


def test_blame_ignore_file_keeps_task_age_from_a_reformat_commit(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _init(tmp_path)
    _commit(tmp_path, {"a.py": "# TODO handle retries later\nvalue = 1\n"}, "2020-01-01T00:00:00Z")
    reformat = _commit(tmp_path, {"a.py": "# TODO: handle retries later\nvalue = 1\n"}, "2025-06-01T00:00:00Z", "reformat")
    (found,) = _findings(tmp_path, capsys, "aged_task")
    assert found["evidence"]["authoredAt"].startswith("2025-06-01")
    (tmp_path / ".git-blame-ignore-revs").write_text(f"# reformat\n{reformat}\n", encoding="utf-8")
    (found,) = _findings(tmp_path, capsys, "aged_task")
    assert found["evidence"]["authoredAt"].startswith("2020-01-01")


def test_blame_falls_back_when_git_rejects_the_ignore_file(tmp_path: Path) -> None:
    _init(tmp_path)
    _commit(tmp_path, {"a.py": "value = 1\n"}, "2020-01-01T00:00:00Z")
    (tmp_path / ".git-blame-ignore-revs").write_text("0123456789abcdef0123456789abcdef01234567\n", encoding="utf-8")
    real = core._git

    def reject_ignore_file(root: Path, args: list[str]) -> tuple[str, str | None]:
        return ("", "invalid object name") if "--ignore-revs-file" in args else real(root, args)

    with patch.object(core, "_git", side_effect=reject_ignore_file):
        spans, error = core._blame(tmp_path, "a.py", 1)
    assert error is None
    assert spans[0]["source"] == "commit"


def test_comment_edited_in_the_same_commit_as_the_code_is_not_flagged(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    before = "def parse(text):\n    # Parse the input\n    # using the legacy parser\n    value = legacy(text)\n    return value\n"
    after = before.replace("legacy", "modern")
    _init(tmp_path)
    _commit(tmp_path, {"a.py": before}, "2020-01-01T00:00:00Z")
    _commit(tmp_path, {"a.py": after}, "2022-01-01T00:00:00Z")
    assert _findings(tmp_path, capsys, "nearby_code_changed") == []


def test_comment_lines_in_the_changed_hunk_do_not_count_as_code_changes(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    before = "def upload():\n    # Retry failed uploads\n    delay = 5\n    return delay\n"
    after = before.replace("delay = 5\n", "delay = 10\n    # Retry failed uploads again\n")
    _init(tmp_path)
    _commit(tmp_path, {"a.py": before}, "2020-01-01T00:00:00Z")
    _commit(tmp_path, {"a.py": after}, "2022-01-01T00:00:00Z")
    assert _findings(tmp_path, capsys, "nearby_code_changed") == []


def test_uncommitted_comment_edit_is_not_flagged(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _init(tmp_path)
    _commit(tmp_path, {"a.py": HIGHLIGHT}, "2020-01-01T00:00:00Z")
    (tmp_path / "a.py").write_text(HIGHLIGHT.replace("when pygments is missing", "when pygments cannot load"), encoding="utf-8")
    assert _findings(tmp_path, capsys, "nearby_code_changed") == []


def test_edit_to_a_middle_line_of_a_long_comment_counts_as_touching_it(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    before = "def parse(text):\n    # Parse the input.\n    # Use the legacy parser.\n    # Fall back to plain text.\n    value = legacy(text)\n    return value\n"
    after = before.replace("legacy", "modern")
    _init(tmp_path)
    _commit(tmp_path, {"a.py": before}, "2020-01-01T00:00:00Z")
    _commit(tmp_path, {"a.py": after}, "2022-01-01T00:00:00Z")
    assert _findings(tmp_path, capsys, "nearby_code_changed") == []


def test_restates_symbol_only_for_the_declaration_a_comment_documents(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    source = (
        "# Represents the while loop.\nclass WhileLoop:\n    pass\n\n\n"
        "# Gets the user name.\ndef get_user_name(user):\n    # Gets the user name here.\n    return user.name\n\n\n"
        "# Issue 1288: automatic options are not added when 'options' is lowercase in methods\ndef options(app):\n    return app\n"
    )
    _init(tmp_path)
    _commit(tmp_path, {"a.py": source}, "2020-01-01T00:00:00Z")
    found = _findings(tmp_path, capsys, "restates_symbol")
    assert [(item["line"], item["evidence"]["symbol"]) for item in found] == [(1, "WhileLoop"), (6, "get_user_name")]


def test_excessive_verbosity_counts_prose_not_tags_or_diagrams(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    tags = "\n".join(f"    # @param {{string}} name{i} The value that the caller passes in for item {i}" for i in range(8))
    diagram = "\n".join(f"    # s{i}[label=\"Node {i}\"]; s{i}->s{i + 1};" for i in range(30))
    prose = "    # " + " ".join(["This comment keeps explaining the same point in more words than a reader needs."] * 12)
    source = f"def a():\n{tags}\n    return 1\n\n\ndef b():\n{diagram}\n    return 2\n\n\ndef c():\n{prose}\n    return 3\n"
    _init(tmp_path)
    _commit(tmp_path, {"a.py": source}, "2020-01-01T00:00:00Z")
    found = _findings(tmp_path, capsys, "excessive_verbosity")
    assert [item["line"] for item in found] == [source.splitlines().index(prose) + 1]
