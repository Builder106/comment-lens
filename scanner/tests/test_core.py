from pathlib import Path
import json
import subprocess

from comment_lens_scanner.core import scan_repository
from comment_lens_scanner.core import get_tree_parser
import pytest


FIXTURES = Path(__file__).parent / "fixtures"


def test_scan_extracts_comments_without_executing_files() -> None:
    if get_tree_parser is None:
        pytest.skip("Tree-sitter is not installed in this workspace")
    result = scan_repository(FIXTURES, include_untracked=True)
    comments = {comment["bodyText"] for comment in result["_comments"]}
    assert "review this behavior" in comments
    assert "inside a string" not in comments
    assert result["_comments"][0]["rawSpan"]["start"]["line0"] == 0


def test_protected_comments_are_not_scored() -> None:
    if get_tree_parser is None:
        pytest.skip("Tree-sitter is not installed in this workspace")
    result = scan_repository(FIXTURES, include_untracked=True)
    license_comments = [comment for comment in result["_comments"] if "copyright" in comment["bodyText"].lower()]
    assert license_comments[0]["score"]["band"] == "protected"
    assert license_comments[0]["score"]["priorityScore"] is None


def test_exclusions_are_recorded() -> None:
    result = scan_repository(FIXTURES, include_untracked=True, exclusions=("generated",))
    generated = next(file for file in result["files"] if file["path"] == "generated/out.js")
    assert generated["status"] == "excluded"
    assert generated["exclusionReason"] == "excluded:generated"


def test_context_is_bounded() -> None:
    if get_tree_parser is None:
        pytest.skip("Tree-sitter is not installed in this workspace")
    result = scan_repository(FIXTURES, include_untracked=True)
    assert all(len(comment["sourceContext"].encode()) <= 8192 for comment in result["_comments"])


def test_cli_identifiers_are_authoritative(tmp_path: Path) -> None:
    result = scan_repository(FIXTURES, include_untracked=True, repository_id="owner/repository", scan_id="scan_fixed")
    assert result["repoId"] == "owner/repository"
    assert result["scanId"] == "scan_fixed"
    assert all(comment["scanId"] == "scan_fixed" for comment in result["_comments"])
    assert str(FIXTURES.resolve()) not in json.dumps(result)


def test_blame_failure_stays_within_the_contract() -> None:
    result = scan_repository(FIXTURES, include_untracked=True)
    if not result["_comments"]:
        pytest.skip("No installed parser produced comments for the fixture")
    comment = result["_comments"][0]
    assert comment["git"]["error"]
    assert "error" not in comment["git"]["blameSpans"][0]


def test_tracked_symlinks_are_excluded(tmp_path: Path) -> None:
    repository = tmp_path / "repository"
    repository.mkdir()
    outside = tmp_path / "outside.py"
    outside.write_text("# external source\n")
    link = repository / "linked.py"
    link.symlink_to(outside)
    subprocess.run(["git", "init", "--quiet", str(repository)], check=True)
    subprocess.run(["git", "-C", str(repository), "add", "linked.py"], check=True)
    result = scan_repository(repository)
    linked = next(file for file in result["files"] if file["path"] == "linked.py")
    assert linked["status"] == "excluded"
    assert linked["exclusionReason"] == "symlink"


def test_manifest_excludes_comment_records(tmp_path: Path) -> None:
    from comment_lens_scanner.core import write_output
    result = scan_repository(FIXTURES, include_untracked=True, repository_id="repo", scan_id="scan")
    manifest = tmp_path / "manifest.json"
    ndjson = tmp_path / "comments.ndjson"
    write_output(result, manifest, ndjson)
    parsed = json.loads(manifest.read_text())
    assert "comments" not in parsed
    assert all(json.loads(line)["scanId"] == "scan" for line in ndjson.read_text().splitlines())
