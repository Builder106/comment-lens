import data from "./drift.json";

export interface BlameLine {
  n: number;
  commit: string;
  date: string;
  text: string;
}

export interface DriftState {
  commit: { sha: string; short: string; date: string; subject: string };
  lines: BlameLine[];
}

export interface Terminal {
  command: string;
  header: string[];
  skippedBefore: number;
  section: string[];
  skippedAfter: number;
  exit: number;
}

export interface Drift {
  repository: string;
  path: string;
  states: DriftState[];
  commitsSinceChange: number;
  finding: {
    rule: string;
    severity: string;
    message: string;
    line: number;
    evidence: { codeLine: number; commentCommit: string; codeCommit: string; commentAuthoredAt: string; codeAuthoredAt: string };
    permalink: string;
  };
  terminal: Terminal;
}

export const drift = data as Drift;

export interface Version<T> {
  value: T;
  from: number;
  to: number;
}

/** Collapse a row's values across states into runs, so an unchanged cell never animates. */
export function versions<T>(values: T[], same: (a: T, b: T) => boolean = Object.is): Version<T>[] {
  const runs: Version<T>[] = [];
  values.forEach((value, index) => {
    const last = runs.at(-1);
    if (last && same(last.value, value)) last.to = index;
    else runs.push({ value, from: index, to: index });
  });
  return runs;
}

export function position(run: { from: number; to: number }, step: number): "past" | "current" | "future" {
  if (run.to < step) return "past";
  if (run.from > step) return "future";
  return "current";
}

export function day(iso: string): string {
  return iso.slice(0, 10);
}
