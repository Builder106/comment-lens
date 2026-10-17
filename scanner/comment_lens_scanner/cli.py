"""Local, offline command-line interface for Comment Lens."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

from .baseline import create_baseline, load_baseline, write_baseline
from .core import DEFAULT_EXCLUSIONS, _git, scan_repository, write_output
from .github_annotations import annotations
from .history import load_report, render_summary, summarize_reports
from .policy import ConfigError, build_report, load_policy, render_report

HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")


class ScanError(ValueError):
    """The requested local scan cannot produce trustworthy results."""


def _git_output(root: Path, args: list[str]) -> str:
    output, error = _git(root, args)
    if error is not None:
        raise ScanError(f"Git operation failed: {error}")
    return output


def _repository_id(root: Path, override: str | None) -> str:
    if override:
        return override
    remote, error = _git(root, ["remote", "get-url", "origin"])
    if error is not None:
        return root.name
    value = remote.strip()
    if value.startswith("git@github.com:"):
        path = value.removeprefix("git@github.com:")
    else:
        parsed = urlsplit(value)
        if parsed.hostname != "github.com":
            return root.name
        path = parsed.path.lstrip("/")
    parts = path.removesuffix(".git").split("/")
    return "/".join(parts) if len(parts) == 2 and all(parts) else root.name


def changed_selection(root: Path, revision: str) -> tuple[set[str], dict[str, list[tuple[int, int]]]]:
    if not revision or revision.startswith("-") or any(character.isspace() for character in revision) or "\0" in revision:
        raise ConfigError("changed revision must be a Git ref or range")
    options = ["diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--ignore-submodules=all"]
    names = _git_output(root, [*options, "--diff-filter=AM", "--name-only", "-z", revision, "--"])
    paths = {path for path in names.split("\0") if path}
    if ".." in revision:
        right = revision.split("...")[-1] if "..." in revision else revision.split("..")[-1]
        if not right:
            raise ConfigError("changed range must end at the checked-out HEAD")
        endpoint = _git_output(root, ["rev-parse", "--verify", f"{right}^{{commit}}"]).strip()
        head = _git_output(root, ["rev-parse", "HEAD"]).strip()
        if endpoint != head:
            raise ConfigError("changed range must end at the checked-out HEAD")
        if paths and _git_output(root, ["diff", "--name-only", "-z", "HEAD", "--", *sorted(paths)]):
            raise ConfigError("changed files differ from HEAD; use a single base ref to include working-tree changes")

    ranges: dict[str, list[tuple[int, int]]] = {}
    for path in sorted(paths):
        patch = _git_output(root, [*options, "--unified=0", "--no-color", revision, "--", path])
        spans = []
        for line in patch.splitlines():
            match = HUNK.match(line)
            if match is None:
                continue
            first = int(match.group(1))
            count = int(match.group(2) or "1")
            if count:
                spans.append((first, first + count - 1))
        ranges[path] = spans
    return paths, ranges


def _failed(scan: dict[str, object]) -> bool:
    return any(item["severity"] == "error" for item in scan["diagnostics"]) or any(
        item["status"] == "failed" for item in scan["files"]
    )


def _write_text(output: Path | None, content: str) -> None:
    if output is None:
        sys.stdout.write(content)
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(content, encoding="utf-8")


def _load_artifacts(directory: Path) -> dict[str, object]:
    manifest = json.loads((directory / "scan.json").read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or not isinstance(manifest.get("scanId"), str):
        raise ScanError("scan.json is not a Comment Lens manifest")
    comments = []
    with (directory / "comments.ndjson").open(encoding="utf-8") as stream:
        for line in stream:
            if not line.strip():
                continue
            comment = json.loads(line)
            if not isinstance(comment, dict) or comment.get("scanId") != manifest["scanId"]:
                raise ScanError("comments.ndjson does not match scan.json")
            comments.append(comment)
    manifest["_comments"] = comments
    return manifest


def _common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("root", nargs="?", type=Path, default=Path("."), help="Repository root")
    parser.add_argument("--config", type=Path, help="Policy file, relative to the repository root")
    parser.add_argument("--exclude", action="append", default=[], help="Additional repository-relative path to exclude")


def _baseline_path(root: Path, explicit: Path | None, configured: str | None, *, required: bool) -> Path | None:
    chosen = explicit or (Path(configured) if configured else None)
    if chosen is None and required:
        chosen = Path(".comment-lens-baseline.json")
    return chosen if chosen is None or chosen.is_absolute() else root / chosen


def _check_options(parser: argparse.ArgumentParser) -> None:
    _common(parser)
    parser.add_argument("--changed", help="Select changes from a Git ref or range")
    parser.add_argument("--scope", choices=("comments", "files"), default="comments", help="Use changed comment lines or all comments in changed files")
    parser.add_argument("--include-untracked", action="store_true")
    parser.add_argument("--repository-id", help="Stable owner/name identity; inferred from a GitHub origin by default")
    parser.add_argument("--baseline", type=Path, help="Baseline file; overrides baseline.path")
    parser.add_argument("--fail-on", choices=("none", "low", "review", "high"), help="Opt into a blocking severity")
    parser.add_argument("--format", choices=("markdown", "json", "sarif"), default="markdown")
    parser.add_argument("--source", choices=("local", "ci"), default="local", help="Label this report's origin")
    parser.add_argument("--output", type=Path, help="Write the report to a file instead of standard output")


def _scan(args: argparse.Namespace) -> int:
    root = args.root.resolve()
    policy = load_policy(root, args.config, excludes=tuple(args.exclude))
    selection = changed_selection(root, args.changed)[0] if args.changed else None
    if args.changed and args.include_untracked:
        raise ConfigError("--include-untracked cannot be combined with --changed")
    result = scan_repository(
        root,
        include_untracked=args.include_untracked,
        exclusions=(*DEFAULT_EXCLUSIONS, *policy.exclusions),
        repository_id=_repository_id(root, args.repository_id),
        selected_paths=selection,
        offline=True,
    )
    output = args.output if args.output.is_absolute() else root / args.output
    write_output(result, output / "scan.json", output / "comments.ndjson")
    print(json.dumps({
        "scanId": result["scanId"],
        "files": len(result["files"]),
        "comments": len(result["_comments"]),
        "diagnostics": len(result["diagnostics"]),
        "output": str(output),
    }))
    return 2 if _failed(result) else 0


def _check(args: argparse.Namespace) -> int:
    root = args.root.resolve()
    policy = load_policy(root, args.config, excludes=tuple(args.exclude), fail_on=args.fail_on)
    if args.changed and args.include_untracked:
        raise ConfigError("--include-untracked cannot be combined with --changed")
    paths, ranges = changed_selection(root, args.changed) if args.changed else (None, None)
    result = scan_repository(
        root,
        include_untracked=args.include_untracked,
        exclusions=(*DEFAULT_EXCLUSIONS, *policy.exclusions),
        repository_id=_repository_id(root, args.repository_id),
        selected_paths=paths,
        offline=True,
    )
    baseline_path = _baseline_path(root, args.baseline, policy.baseline_path, required=args.command == "compare")
    baseline = load_baseline(baseline_path, result["repoId"]) if baseline_path is not None else None
    report = build_report(
        result,
        policy,
        selection=f"{args.scope} changed in {args.changed}" if args.changed else "all tracked files",
        ranges=ranges if args.changed and args.scope == "comments" else None,
        baseline=baseline,
        full_scan=args.changed is None,
        root=root,
        source=args.source,
    )
    output = args.output if args.output is None or args.output.is_absolute() else root / args.output
    _write_text(output, render_report(report, args.format))
    if _failed(result):
        return 2
    return 1 if report["summary"]["blocking"] else 0


def _baseline_create(args: argparse.Namespace) -> int:
    root = args.root.resolve()
    policy = load_policy(root, args.config, excludes=tuple(args.exclude))
    result = scan_repository(
        root,
        exclusions=(*DEFAULT_EXCLUSIONS, *policy.exclusions),
        repository_id=_repository_id(root, args.repository_id),
        offline=True,
    )
    if _failed(result):
        raise ScanError("scan failed; baseline was not written")
    report = build_report(result, policy, root=root)
    path = _baseline_path(root, args.output, policy.baseline_path, required=True)
    write_baseline(path, create_baseline(report), force=args.force)
    print(json.dumps({"baseline": str(path), "findings": report["summary"]["findings"]}))
    return 0


def _export(args: argparse.Namespace) -> int:
    root = args.root.resolve()
    policy = load_policy(root, args.config, excludes=tuple(args.exclude), fail_on=args.fail_on)
    directory = args.input if args.input.is_absolute() else root / args.input
    scan = _load_artifacts(directory)
    baseline_path = _baseline_path(root, args.baseline, policy.baseline_path, required=False)
    baseline = load_baseline(baseline_path, scan["repoId"]) if baseline_path is not None else None
    report = build_report(scan, policy, baseline=baseline, full_scan=False, source=args.source)
    output = args.output if args.output is None or args.output.is_absolute() else root / args.output
    _write_text(output, render_report(report, args.format))
    if _failed(scan):
        return 2
    return 1 if report["summary"]["blocking"] else 0


def _annotate(args: argparse.Namespace) -> int:
    if args.limit < 1:
        raise ConfigError("annotation limit must be positive")
    sys.stdout.write(annotations(args.input, limit=args.limit))
    return 0


def _render(args: argparse.Namespace) -> int:
    report = load_report(args.input, require_date=False)
    _write_text(args.output, render_report(report, args.format))
    if report.get("scanFailed"):
        return 2
    return 1 if report["summary"].get("blocking") else 0


def _summary(args: argparse.Namespace) -> int:
    reports = [load_report(path) for path in args.report]
    _write_text(args.output, render_summary(summarize_reports(reports), args.format))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="comment-lens", description="Inspect repository comments locally without uploading source code.")
    commands = parser.add_subparsers(dest="command", required=True)

    scan = commands.add_parser("scan", help="Write compatible scan.json and comments.ndjson artifacts")
    _common(scan)
    scan.add_argument("--changed", help="Limit the scan to files changed from a Git ref or range")
    scan.add_argument("--include-untracked", action="store_true")
    scan.add_argument("--repository-id", help="Stable owner/name identity; inferred from a GitHub origin by default")
    scan.add_argument("--output", type=Path, default=Path(".comment-lens"), help="Artifact directory")
    scan.set_defaults(run=_scan)

    check = commands.add_parser("check", help="Report deterministic maintenance findings")
    _check_options(check)
    check.set_defaults(run=_check)

    baseline = commands.add_parser("baseline", help="Create a repository-owned baseline")
    baseline_commands = baseline.add_subparsers(dest="baseline_command", required=True)
    create = baseline_commands.add_parser("create", help="Capture findings from a full tracked-file scan")
    _common(create)
    create.add_argument("--repository-id", help="Stable owner/name identity; inferred from a GitHub origin by default")
    create.add_argument("--output", type=Path, help="Baseline file; defaults to baseline.path or .comment-lens-baseline.json")
    create.add_argument("--force", action="store_true", help="Replace an existing baseline")
    create.set_defaults(run=_baseline_create)

    compare = commands.add_parser("compare", help="Compare current findings with a baseline")
    _check_options(compare)
    compare.set_defaults(run=_check)

    export = commands.add_parser("export", help="Render findings from an existing local scan")
    _common(export)
    export.add_argument("--input", type=Path, default=Path(".comment-lens"), help="Directory containing scan.json and comments.ndjson")
    export.add_argument("--baseline", type=Path, help="Compare with a baseline file")
    export.add_argument("--fail-on", choices=("none", "low", "review", "high"), help="Opt into a blocking severity")
    export.add_argument("--format", choices=("markdown", "json", "sarif"), default="json")
    export.add_argument("--source", choices=("local", "ci"), default="local", help="Label this report's origin")
    export.add_argument("--output", type=Path, help="Write the report to a file instead of standard output")
    export.set_defaults(run=_export)

    annotate = commands.add_parser("annotate", help="Emit GitHub Actions annotations from a SARIF report")
    annotate.add_argument("--input", type=Path, required=True, help="SARIF file produced by check or compare")
    annotate.add_argument("--limit", type=int, default=50, help="Maximum number of annotations")
    annotate.set_defaults(run=_annotate)

    render = commands.add_parser("render", help="Render a saved JSON report without rescanning")
    render.add_argument("--input", type=Path, required=True, help="JSON report from check or compare")
    render.add_argument("--format", choices=("markdown", "sarif"), required=True)
    render.add_argument("--output", type=Path)
    render.set_defaults(run=_render)

    summary = commands.add_parser("summary", help="Summarize saved local and CI JSON reports")
    summary.add_argument("--report", type=Path, action="append", required=True, help="Saved JSON report; repeat for each scan")
    summary.add_argument("--format", choices=("json", "markdown"), default="markdown")
    summary.add_argument("--output", type=Path)
    summary.set_defaults(run=_summary)

    args = parser.parse_args(argv)
    try:
        return args.run(args)
    except (ConfigError, ScanError, OSError, UnicodeError, ValueError, KeyError, TypeError) as error:
        print(f"comment-lens: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
