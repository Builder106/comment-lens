const { execFile } = require('node:child_process');
const path = require('node:path');
const vscode = require('vscode');

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection('comment-lens');
  const output = vscode.window.createOutputChannel('Comment Lens');
  const revisions = new Map();
  const running = new Map();

  function invalidate(uri) {
    const key = uri.toString();
    revisions.set(key, (revisions.get(key) || 0) + 1);
    running.get(key)?.kill();
    running.delete(key);
    diagnostics.delete(uri);
    return revisions.get(key);
  }

  function fail(uri, message, manual) {
    diagnostics.delete(uri);
    output.appendLine(message);
    if (manual) {
      vscode.window.showErrorMessage('Comment Lens scan failed. See the Comment Lens output channel.');
    } else {
      vscode.window.setStatusBarMessage('Comment Lens scan failed; see Output', 5000);
    }
  }

  function scan(document, manual = false) {
    if (!document || document.uri.scheme !== 'file') return;
    const uri = document.uri;
    const key = uri.toString();
    const revision = invalidate(uri);
    if (document.isDirty) {
      if (manual) vscode.window.showInformationMessage('Save the file before scanning with Comment Lens.');
      return;
    }

    execFile('git', ['-C', path.dirname(uri.fsPath), 'rev-parse', '--show-toplevel'],
      { timeout: 5000, windowsHide: true }, (gitError, stdout) => {
        if (revisions.get(key) !== revision) return;
        if (gitError) {
          if (manual) fail(uri, 'Open a file in a Git repository to scan it.', true);
          return;
        }
        const root = stdout.trim();
        const relative = path.relative(root, uri.fsPath).split(path.sep).join('/');
        if (!relative || relative.startsWith('../') || relative === '..') return;

        const command = vscode.workspace.getConfiguration('commentLens').get('command', 'comment-lens');
        const child = execFile(command,
          ['check', root, `--path=${relative}`, '--include-untracked', '--format', 'json'],
          { cwd: root, maxBuffer: 10 * 1024 * 1024, timeout: 60000, windowsHide: true },
          (error, reportText, stderr) => {
            if (revisions.get(key) !== revision) return;
            running.delete(key);
            if (error && error.code !== 1) {
              fail(uri, `Scanner failed for ${relative}: ${stderr.trim() || error.message}`, manual);
              return;
            }
            try {
              const report = JSON.parse(reportText);
              if (report.reportVersion !== 1 || report.scanFailed || !Array.isArray(report.findings)) {
                throw new Error('The scanner returned an invalid or failed report.');
              }
              const items = report.findings.map((finding) => {
                if (finding.path !== relative || !Number.isInteger(finding.line) || finding.line < 1 ||
                    !Number.isInteger(finding.column) || finding.column < 1 ||
                    typeof finding.findingId !== 'string' || typeof finding.ruleId !== 'string' ||
                    typeof finding.message !== 'string' || !['low', 'review', 'high'].includes(finding.severity) ||
                    !finding.evidence || typeof finding.evidence !== 'object') {
                  throw new Error('The scanner returned an invalid finding.');
                }
                const line = finding.line - 1;
                if (line >= document.lineCount) throw new Error('A finding points beyond the saved file.');
                const lineText = document.lineAt(line).text;
                const bytes = Buffer.from(lineText, 'utf8');
                if (finding.column > bytes.length + 1) throw new Error('A finding points beyond its line.');
                const column = bytes.subarray(0, finding.column - 1).toString('utf8').length;
                const range = new vscode.Range(line, column, line, Math.min(column + 1, lineText.length));
                const severity = {
                  low: vscode.DiagnosticSeverity.Information,
                  review: vscode.DiagnosticSeverity.Warning,
                  high: vscode.DiagnosticSeverity.Error,
                }[finding.severity];
                const detail = [finding.message, `Rule: ${finding.ruleId}`, `Evidence: ${JSON.stringify(finding.evidence)}`];
                if (finding.sourceContext) detail.push(`Source context:\n${finding.sourceContext}`);
                const diagnostic = new vscode.Diagnostic(range, detail.join('\n'), severity);
                diagnostic.source = 'Comment Lens';
                diagnostic.code = finding.findingId;
                return diagnostic;
              });
              diagnostics.set(uri, items);
            } catch (parseError) {
              fail(uri, `Cannot use the Comment Lens report for ${relative}: ${parseError.message}`, manual);
            }
          });
        running.set(key, child);
      });
  }

  context.subscriptions.push(diagnostics, output,
    vscode.commands.registerCommand('commentLens.scanFile', () => scan(vscode.window.activeTextEditor?.document, true)),
    vscode.workspace.onDidSaveTextDocument((document) => scan(document)),
    vscode.workspace.onDidChangeTextDocument((event) => invalidate(event.document.uri)),
    vscode.workspace.onDidCloseTextDocument((document) => invalidate(document.uri)),
    vscode.window.onDidChangeActiveTextEditor((editor) => scan(editor?.document)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('commentLens.command')) scan(vscode.window.activeTextEditor?.document);
    }),
    { dispose: () => {
      for (const child of running.values()) child.kill();
    } });
  scan(vscode.window.activeTextEditor?.document);
}

module.exports = { activate };
