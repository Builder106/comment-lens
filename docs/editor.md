# Visual Studio Code integration

The extension in `editor/vscode` displays local Comment Lens findings in the
Problems panel and beside saved source comments. It invokes the installed
`comment-lens check` command for the current file. The scanner owns parsing,
rules, configuration, baselines, finding IDs, and evidence; the extension only
turns its JSON report into editor diagnostics. It makes no upload request.

Install the scanner in the same environment where the VS Code workspace
extension runs, as described in the [local checks guide](../README.md#local-comment-checks).
Open `editor/vscode` as a VS Code folder and press F5 to launch an Extension
Development Host with the repository open. For a remote workspace, install the
scanner in the remote environment and run the extension there. Set
`commentLens.command` to the executable path if it is not on VS Code's `PATH`.

The active saved file is scanned when the extension starts, when it becomes
active, and after each save. Run **Comment Lens: Scan Current File** to refresh
it manually. Unsaved edits clear old diagnostics until the file is saved. The
extension accepts a policy-blocking exit status as a valid report; a scanner
failure clears stale diagnostics and appears in the Comment Lens output channel.
The diagnostic code is the scanner's original finding ID. Its message includes
the rule, evidence, and available source context.

For a targeted CLI check without the editor, use:

```bash
comment-lens check . --path src/example.py --include-untracked --format json
```

`--path` accepts repository-relative file paths and can be repeated. It cannot
be combined with `--changed`. A path-limited report is partial, so it never
claims that baseline findings elsewhere in the repository were resolved.
