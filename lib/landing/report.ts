import data from "./report.json";
import { severityRank, type Severity } from "./rules";

export type FailOn = "none" | Severity;
export const failLevels: FailOn[] = ["none", "low", "review", "high"];

export interface GateRow {
  baseline: boolean;
  failOn: FailOn;
  exit: number;
  findings: number;
  new: number;
  existing: number;
  resolved: number;
  blocking: number;
}

export interface RuleRow {
  rule: string;
  severity: Severity;
  new: number;
  existing: number;
}

export interface SampleFinding {
  id: string;
  rule: string;
  severity: Severity;
  state: "new" | "existing";
  path: string;
  line: number;
  message: string;
  evidence: Record<string, unknown>;
  context: string;
  startLine: number;
  permalink: string;
}

export interface LandingReport {
  repository: string;
  url: string;
  commit: string;
  commitDate: string;
  baselineCommit: string;
  baselineDate: string;
  selection: string;
  files: number;
  comments: number;
  gate: GateRow[];
  byRule: RuleRow[];
  sample: SampleFinding[];
}

export const report = data as LandingReport;

export type Label = "blocking" | "advisory" | "existing";

export function blocks(severity: Severity, state: "new" | "existing", failOn: FailOn, baseline: boolean): boolean {
  if (failOn === "none") return false;
  if (baseline && state === "existing") return false;
  return severityRank[severity] >= severityRank[failOn];
}

export function label(severity: Severity, state: "new" | "existing", failOn: FailOn, baseline: boolean): Label {
  if (blocks(severity, state, failOn, baseline)) return "blocking";
  return baseline && state === "existing" ? "existing" : "advisory";
}

export function gateRow(baseline: boolean, failOn: FailOn): GateRow {
  const row = report.gate.find((item) => item.baseline === baseline && item.failOn === failOn);
  if (!row) throw new Error(`Missing gate row for baseline=${baseline} fail-on=${failOn}`);
  return row;
}

export function ruleBlocking(row: RuleRow, failOn: FailOn, baseline: boolean): number {
  const counted = baseline ? row.new : row.new + row.existing;
  return blocks(row.severity, "new", failOn, false) ? counted : 0;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export const numberFormat = new Intl.NumberFormat("en-US");
