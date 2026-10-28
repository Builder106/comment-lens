import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../../editor/vscode/extension.js", import.meta.url), "utf8");
const launch = JSON.parse(readFileSync(new URL("../../editor/vscode/.vscode/launch.json", import.meta.url), "utf8"));

function setup() {
  const root = path.resolve("/repo");
  const file = path.join(root, "src", "a.py");
  const uri = { scheme: "file", fsPath: file, toString: () => `file://${file}` };
  const document = { uri, isDirty: false, lineCount: 1, lineAt: () => ({ text: "é TODO: fix this" }) };
  const processes = [];
  const diagnostics = new Map();
  const listeners = {};
  const collection = {
    delete: (target) => diagnostics.delete(target.toString()),
    set: (target, items) => diagnostics.set(target.toString(), items),
    dispose() {},
  };
  const vscode = {
    DiagnosticSeverity: { Information: 0, Warning: 1, Error: 2 },
    Diagnostic: class { constructor(range, message, severity) { Object.assign(this, { range, message, severity }); } },
    Range: class { constructor(startLine, startCharacter, endLine, endCharacter) { Object.assign(this, { startLine, startCharacter, endLine, endCharacter }); } },
    languages: { createDiagnosticCollection: () => collection },
    window: {
      activeTextEditor: { document },
      createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
      onDidChangeActiveTextEditor: (callback) => { listeners.activeEditor = callback; return { dispose() {} }; },
      setStatusBarMessage() {},
      showErrorMessage() {},
      showInformationMessage() {},
    },
    workspace: {
      getConfiguration: () => ({ get: (_name, fallback) => fallback }),
      onDidChangeConfiguration: (callback) => { listeners.configuration = callback; return { dispose() {} }; },
      onDidChangeTextDocument: (callback) => { listeners.change = callback; return { dispose() {} }; },
      onDidCloseTextDocument: (callback) => { listeners.close = callback; return { dispose() {} }; },
      onDidSaveTextDocument: (callback) => { listeners.save = callback; return { dispose() {} }; },
    },
    commands: { registerCommand: (_name, callback) => { listeners.command = callback; return { dispose() {} }; } },
  };
  const extensionModule = { exports: {} };
  vm.runInNewContext(source, {
    Buffer,
    module: extensionModule,
    require: (name) => name === "vscode" ? vscode : name === "node:child_process" ? {
      execFile: (command, args, options, callback) => {
        const child = { command, args, options, callback, killed: false, kill() { this.killed = true; } };
        processes.push(child);
        return child;
      },
    } : require(name),
  });
  const subscriptions = [];
  extensionModule.exports.activate({ subscriptions });
  return { diagnostics, document, file, listeners, processes, root, subscriptions };
}

function findingReport(pathname = "src/a.py") {
  return JSON.stringify({
    reportVersion: 1,
    scanFailed: false,
    findings: [{
      path: pathname,
      line: 1,
      column: 4,
      findingId: "fnd_123",
      ruleId: "todo",
      severity: "high",
      message: "TODO needs an owner.",
      evidence: { marker: "TODO" },
      sourceContext: "# nearby code",
    }],
  });
}

test("opens the repository root in the extension development host", () => {
  const configuration = launch.configurations.find(({ name }) => name === "Run Comment Lens");
  assert.deepEqual(Array.from(configuration.args), [
    "--extensionDevelopmentPath=${workspaceFolder}",
    "${workspaceFolder}/../..",
  ]);
});

test("maps a path-limited CLI finding to its UTF-8 source location", () => {
  const state = setup();
  const [git] = state.processes;
  assert.equal(git.command, "git");
  git.callback(null, `${state.root}\n`, "");
  const scanner = state.processes[1];
  assert.deepEqual(Array.from(scanner.args), ["check", state.root, "--path=src/a.py", "--include-untracked", "--format", "json"]);
  assert.equal(scanner.options.cwd, state.root);
  assert.equal(scanner.options.shell, undefined);

  scanner.callback(null, findingReport(), "");
  const [diagnostic] = state.diagnostics.get(`file://${state.file}`);
  assert.equal(diagnostic.source, "Comment Lens");
  assert.equal(diagnostic.code, "fnd_123");
  assert.equal(diagnostic.severity, 2);
  assert.equal(diagnostic.range.startCharacter, 2);
  assert.match(diagnostic.message, /Rule: todo/);
  assert.match(diagnostic.message, /Evidence: {"marker":"TODO"}/);
  assert.match(diagnostic.message, /Source context:\n# nearby code/);
});

test("clears stale results when the document changes during a scan", () => {
  const state = setup();
  state.processes[0].callback(null, `${state.root}\n`, "");
  const scanner = state.processes[1];
  state.listeners.change({ document: state.document });
  assert.equal(scanner.killed, true);
  scanner.callback(null, findingReport(), "");
  assert.equal(state.diagnostics.has(`file://${state.file}`), false);
});
