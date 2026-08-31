from pathlib import Path
import json
import subprocess
import os
import sys
import runpy
from unittest.mock import MagicMock, patch
import pytest

import comment_lens_scanner.core as core
from comment_lens_scanner.core import (
    Diagnostic,
    SCHEMA_VERSION,
    RULES_VERSION,
    _point,
    _span,
    _normalize,
    _language,
    _git,
    _tracked,
    _blame,
    _findings,
    _protected,
    _extract_fallback,
    _comment_record,
    scan_repository,
    write_output,
    main,
)


FIXTURES = Path(__file__).parent / "fixtures"


def test_point_and_span() -> None:
    data = b"line 1\nline 2\nline 3"
    pt = _point(data, 7)
    assert pt["line0"] == 1
    assert pt["columnByte0"] == 0

    sp = _span(data, 0, 6)
    assert sp["startByte"] == 0
    assert sp["endByte"] == 6
    assert sp["precision"] == "exact"
    assert sp["endExclusive"] is True


def test_normalize() -> None:
    assert _normalize("  hello  \r\n  world  ") == "hello\nworld"


def test_language_detection() -> None:
    assert _language("CMakeLists.txt") == "cmake"
    assert _language("Makefile") == "shell"
    assert _language("Dockerfile") == "shell"
    assert _language("Podfile") == "shell"
    assert _language("main.py") == "python"
    assert _language("index.ts") == "typescript"
    assert _language("unknown.xyz") is None


def test_git_error_handling(tmp_path: Path) -> None:
    stdout, error = _git(tmp_path, ["invalid-git-command-xyz"])
    assert stdout == ""
    assert error is not None


def test_tracked_git_failure(tmp_path: Path) -> None:
    # Non-git directory
    paths, diag = _tracked(tmp_path, include_untracked=False)
    assert paths == []
    assert diag is not None
    assert diag.code == "git_failed"

    dummy_file = tmp_path / "test.py"
    dummy_file.write_text("# hello")
    paths_untracked, diag_untracked = _tracked(tmp_path, include_untracked=True)
    assert "test.py" in paths_untracked
    assert diag_untracked is not None
    assert diag_untracked.severity == "warning"


def test_tracked_git_success_with_untracked(tmp_path: Path) -> None:
    subprocess.run(["git", "init", "--quiet", str(tmp_path)], check=True)
    (tmp_path / "tracked.py").write_text("# tracked\n")
    subprocess.run(["git", "-C", str(tmp_path), "add", "tracked.py"], check=True)
    (tmp_path / "untracked.py").write_text("# untracked\n")

    paths, diag = _tracked(tmp_path, include_untracked=True)
    assert diag is None
    assert "tracked.py" in paths
    assert "untracked.py" in paths


def test_blame_handling(tmp_path: Path) -> None:
    spans, error = _blame(tmp_path, "nonexistent.py", 5)
    assert spans[0]["source"] == "unavailable"
    assert spans[0]["endLine0"] == 4

    # Blame output parsing simulation
    fake_porcelain = (
        "deadbeef0123456789 1 1 2\n"
        "author Test Author\n"
        "author-mail <author@example.com>\n"
        "author-time 1700000000\n"
        "\tsome code\n"
    )
    with patch.object(core, "_git", return_value=(fake_porcelain, None)):
        spans, err = _blame(tmp_path, "file.py", 2)
        assert err is None
        assert len(spans) == 1
        assert spans[0]["commit"] == "deadbeef0123456789"
        assert spans[0]["authorName"] == "Test Author"
        assert spans[0]["authorEmail"] == "author@example.com"
        assert spans[0]["authoredAt"] is not None


def test_findings_scoring() -> None:
    # Protected comment
    prot = _findings("/* copyright 2026 */", None, True)
    assert prot["band"] == "protected"
    assert prot["eligible"] is False
    assert prot["priorityScore"] is None

    # Low score
    low = _findings("Normal short comment", None, False)
    assert low["band"] == "low"
    assert low["eligible"] is True

    # High score triggering multiple rules: generic_template, restates_symbol, excessive_verbosity, hedge_stack, promotional_or_vague_language
    long_text = (
        "This function is a helper function for calculateTotal which may might possibly generally calculate things. "
        "It provides an elegant, seamless, robust, powerful, and beautiful mechanism to handle numbers. "
        + "word " * 45
    )
    high = _findings(long_text, "calculateTotal", False)
    assert high["band"] == "high"
    assert high["priorityScore"] >= 40
    assert len(high["findings"]) >= 4

    # Review score band (between 20 and 39)
    med_text = "This method performs calculations for calculateTotal."
    med = _findings(med_text, "calculateTotal", False)
    assert med["band"] == "review"


def test_protected_patterns() -> None:
    assert _protected("Copyright (c) 2026") is True
    assert _protected("eslint-disable-next-line") is True
    assert _protected("TODO: fix later") is True
    assert _protected("FIXME - broken") is True
    assert _protected("pragma: no cover") is True
    assert _protected("! preserved banner") is True
    assert _protected("standard developer note") is False


def test_extract_fallback_tree_sitter_and_pygments() -> None:
    data = b"# Single line comment\n'''\nBlock comment\n'''\ndef test():\n    pass\n"

    # Test with tree-sitter mock
    mock_tree = MagicMock()
    mock_comment_node = MagicMock()
    mock_comment_node.type = "comment"
    mock_comment_node.start_byte = 0
    mock_comment_node.end_byte = 21
    mock_comment_node.children = []
    mock_root = MagicMock()
    mock_root.type = "module"
    mock_root.children = [mock_comment_node]
    mock_tree.root_node = mock_root

    mock_parser = MagicMock()
    mock_parser.parse.return_value = None
    mock_tree_parser = MagicMock(return_value=mock_tree)

    with patch.object(core, "get_tree_parser", mock_tree_parser):
        results, parser, diags = _extract_fallback(data, "test.py")
        assert len(results) >= 1
        assert parser == "tree-sitter"

    # Test tree-sitter parse failure handling
    mock_bad_tree = MagicMock()
    mock_bad_tree.parse.side_effect = Exception("Parse crash")
    with patch.object(core, "get_tree_parser", MagicMock(return_value=mock_bad_tree)):
        res, p_name, p_diags = _extract_fallback(data, "test.py")
        assert any(d.code == "parse_failed" for d in p_diags)

    # Test pygments extraction
    with patch.object(core, "get_tree_parser", None):
        results_pyg, parser_pyg, diags_pyg = _extract_fallback(data, "test.py")
        assert len(results_pyg) >= 1
        assert parser_pyg == "pygments"

    # Test pygments failure handling
    with patch.object(core, "get_tree_parser", None):
        with patch.object(core, "lex", side_effect=Exception("Lex crash")):
            res_fail, p_name_fail, p_diags_fail = _extract_fallback(data, "test.py")
            assert any(d.code == "parse_failed" for d in p_diags_fail)

    # Test when neither is available
    with patch.object(core, "get_tree_parser", None):
        with patch.object(core, "get_lexer_for_filename", None):
            res_none, _, diags_none = _extract_fallback(data, "test.py")
            assert res_none == []


def test_comment_record_construction(tmp_path: Path) -> None:
    code = b"def calculateSum(a, b):\n    # helper comment\n    return a + b\n"
    record = _comment_record(
        root=tmp_path,
        repository_id="test-repo",
        scan_id="scan-123",
        path="sum.py",
        data=code,
        start=29,
        end=45,
        kind="line",
        raw="# helper comment",
        parser="tree-sitter",
        blame=[{"commit": "123456"}],
        blame_error=None,
        collision=0,
    )
    assert record["commentId"].startswith("cmt_")
    assert record["symbol"]["enclosing"]["name"] == "calculateSum"
    assert record["git"]["available"] is True
    assert record["git"]["primaryCommit"] == "123456"


def test_scan_repository_various_file_conditions(tmp_path: Path) -> None:
    # 1. Setup git repo
    subprocess.run(["git", "init", "--quiet", str(tmp_path)], check=True)
    subprocess.run(["git", "-C", str(tmp_path), "config", "user.name", "Test"], check=True)
    subprocess.run(["git", "-C", str(tmp_path), "config", "user.email", "test@example.com"], check=True)

    # 2. Add valid python file
    valid_file = tmp_path / "valid.py"
    valid_file.write_text("# Normal comment\ndef foo(): pass\n")

    # 3. Add generated file
    gen_file = tmp_path / "model.freezed.dart"
    gen_file.write_text("// generated code")

    # 4. Add unsupported file
    unsupported_file = tmp_path / "doc.unknownext"
    unsupported_file.write_text("plain text")

    # 5. Add binary file
    bin_file = tmp_path / "binary.py"
    bin_file.write_bytes(b"# python comment\x00with null byte")

    # 6. Add non-utf8 decode failed file
    non_utf8_file = tmp_path / "non_utf8.py"
    non_utf8_file.write_bytes(b"# \xff\xfe\xfd invalid utf8")

    # 7. Add oversized file
    oversized_file = tmp_path / "large.py"
    oversized_file.write_bytes(b"# comment\n" + b"x" * (5 * 1024 * 1024 + 10))

    # 8. Add symlink
    link_file = tmp_path / "sym.py"
    link_file.symlink_to(valid_file)

    subprocess.run(["git", "-C", str(tmp_path), "add", "."], check=True)
    subprocess.run(["git", "-C", str(tmp_path), "commit", "-m", "initial", "--quiet"], check=True)

    result = scan_repository(tmp_path, include_untracked=False)
    file_map = {f["path"]: f for f in result["files"]}

    assert file_map["valid.py"]["status"] in {"parsed", "parsed_with_errors"}
    assert file_map["model.freezed.dart"]["exclusionReason"] == "excluded:generated-pattern"
    assert file_map["doc.unknownext"]["exclusionReason"] == "unsupported_language"
    assert file_map["binary.py"]["exclusionReason"] == "binary_file"
    assert file_map["non_utf8.py"]["status"] == "failed"
    assert file_map["large.py"]["exclusionReason"] == "file_too_large"
    assert file_map["sym.py"]["exclusionReason"] == "symlink"

    # Permission error simulation
    with patch("pathlib.Path.read_bytes", side_effect=OSError("Read permission denied")):
        res_err = scan_repository(tmp_path, include_untracked=False)
        assert any(d["code"] == "permission_denied" for d in res_err["diagnostics"])


def test_write_output_and_manifest(tmp_path: Path) -> None:
    result = {
        "schemaVersion": SCHEMA_VERSION,
        "scanId": "scan_test",
        "repoId": "repo_test",
        "_comments": [{"commentId": "cmt_1", "scanId": "scan_test"}],
    }
    manifest_file = tmp_path / "manifest" / "scan.json"
    ndjson_file = tmp_path / "manifest" / "comments.ndjson"
    write_output(result, manifest_file, ndjson_file)

    manifest_data = json.loads(manifest_file.read_text(encoding="utf-8"))
    assert "_comments" not in manifest_data
    assert manifest_data["scanId"] == "scan_test"

    ndjson_lines = ndjson_file.read_text(encoding="utf-8").strip().split("\n")
    assert len(ndjson_lines) == 1
    assert json.loads(ndjson_lines[0])["commentId"] == "cmt_1"


def test_main_cli_execution(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    repo = tmp_path / "cli_repo"
    repo.mkdir()
    py_file = repo / "hello.py"
    py_file.write_text("# CLI test comment\ndef main(): pass\n")

    output_dir = tmp_path / "out"
    test_args = [
        str(repo),
        "--include-untracked",
        "--output",
        str(output_dir),
        "--repository",
        "cli/test-repo",
        "--scan-id",
        "scan_cli_01",
        "--exclude",
        "node_modules",
    ]

    ret = main(test_args)
    assert ret == 0

    captured = capsys.readouterr()
    summary = json.loads(captured.out)
    assert summary["scanId"] == "scan_cli_01"
    assert (output_dir / "scan.json").exists()
    assert (output_dir / "comments.ndjson").exists()


def test_scanner_main_module_execution(tmp_path: Path) -> None:
    repo = tmp_path / "entry_repo"
    repo.mkdir()
    (repo / "test.py").write_text("# entrypoint test\n")
    test_args = ["comment-lens-scan", str(repo), "--include-untracked"]
    with patch.object(sys, "argv", test_args):
        with pytest.raises(SystemExit) as excinfo:
            runpy.run_module("comment_lens_scanner.__main__", run_name="__main__")
        assert excinfo.value.code == 0
