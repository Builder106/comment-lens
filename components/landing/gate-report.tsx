"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Source } from "@/components/landing/source";
import {
  failLevels,
  gateRow,
  label,
  numberFormat,
  report,
  ruleBlocking,
  shortSha,
  type FailOn,
} from "@/lib/landing/report";

function Stamp({ value }: { value: string }) {
  return <span className="lp-stamp" key={value}>{value}</span>;
}

export function GateReport({ intro, tail }: { intro: ReactNode; tail: ReactNode }) {
  const [failOn, setFailOn] = useState<FailOn>("high");
  const [baseline, setBaseline] = useState(false);
  const row = gateRow(baseline, failOn);
  const status = row.exit === 0
    ? "Exit status 0. Nothing blocks this run."
    : `Exit status ${row.exit}. ${numberFormat.format(row.blocking)} ${row.blocking === 1 ? "finding blocks" : "findings block"} this run.`;

  return (
    <main className="lp-grid">
      <div className="lp-console">
        {intro}
        <section className="lp-gate" aria-labelledby="gate-title">
          <h2 id="gate-title" className="lp-gate-title">Try the gate</h2>
          <fieldset className="lp-levels">
            <legend><code>--fail-on</code></legend>
            {failLevels.map((level) => (
              <label key={level} className="lp-level">
                <input type="radio" name="fail-on" value={level} checked={failOn === level} onChange={() => setFailOn(level)} />
                <span>{level}</span>
              </label>
            ))}
          </fieldset>
          <label className="lp-baseline">
            <input type="checkbox" checked={baseline} onChange={(event) => setBaseline(event.target.checked)} />
            <span>Compare with a baseline from {report.baselineDate} (<code>{shortSha(report.baselineCommit)}</code>)</span>
          </label>
          <output className="lp-exit" aria-live="polite">
            <span className="lp-exit-code" aria-hidden="true"><span>exit</span> <Stamp value={String(row.exit)} /></span>
            <span className="lp-exit-text">{status}</span>
          </output>
          <p className="lp-gate-note">Real runs of <code>comment-lens</code> on {report.repository} at <code>{shortSha(report.commit)}</code>.</p>
        </section>
      </div>

      <div className="lp-report" id="report" tabIndex={-1}>
        <header className="lp-report-head">
          <h2 className="lp-report-title">Comment Lens report</h2>
          <dl className="lp-meta">
            <div><dt>Repository</dt><dd><a href={report.url}>{report.repository}</a></dd></div>
            <div><dt>Commit</dt><dd>{shortSha(report.commit)} ({report.commitDate})</dd></div>
            {baseline ? <div><dt>Baseline</dt><dd>{shortSha(report.baselineCommit)} ({report.baselineDate})</dd></div> : null}
            <div><dt>Selection</dt><dd>{report.selection}, {numberFormat.format(report.files)} files</dd></div>
          </dl>
          <p className="lp-summary">
            Comments: {numberFormat.format(report.comments)}, New: <Stamp value={numberFormat.format(row.new)} />, Existing: <Stamp value={numberFormat.format(row.existing)} />, Blocking: <Stamp value={numberFormat.format(row.blocking)} />
          </p>
        </header>

        <section className="lp-section" aria-labelledby="by-rule">
          <h3 id="by-rule">By rule</h3>
          <div className="lp-table-wrap">
            <table className="lp-table">
              <thead>
                <tr><th scope="col">Rule</th><th scope="col">Severity</th><th scope="col" className="lp-num">New</th><th scope="col" className="lp-num">Existing</th><th scope="col" className="lp-num">Blocking</th></tr>
              </thead>
              <tbody>
                {report.byRule.map((item) => (
                  <tr key={item.rule}>
                    <th scope="row"><Link href={`/rules/${item.rule}`}>{item.rule}</Link></th>
                    <td>{item.severity}</td>
                    <td className="lp-num">{numberFormat.format(baseline ? item.new : item.new + item.existing)}</td>
                    <td className="lp-num">{numberFormat.format(baseline ? item.existing : 0)}</td>
                    <td className="lp-num"><Stamp value={numberFormat.format(ruleBlocking(item, failOn, baseline))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lp-section" aria-labelledby="findings">
          <h3 id="findings">Findings</h3>
          <p className="lp-lede">
            {report.sample.length} of {numberFormat.format(row.findings)} findings, picked to show the range of rules and states. Open one to read the comment and the evidence the scanner recorded.
          </p>
          <ol className="lp-findings">
            {report.sample.map((finding, index) => {
              const state = label(finding.severity, finding.state, failOn, baseline);
              return (
                <li key={finding.id}>
                  <details open={index === 0}>
                    <summary>
                      <span className="lp-where">{finding.path}:{finding.line}</span>
                      <span className="lp-ruleid">{finding.rule} ({finding.severity}, {finding.state})</span>
                      <span className={`lp-label lp-label-${state}`}><Stamp value={state} /></span>
                    </summary>
                    <div className="lp-finding-body">
                      <p>{finding.message}</p>
                      <p className="lp-evidence"><span>Evidence</span> <code>{JSON.stringify(finding.evidence)}</code></p>
                      <Source context={finding.context} startLine={finding.startLine} hit={finding.line} />
                      <a className="lp-permalink" href={finding.permalink}>View line {finding.line} at this commit</a>
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="lp-section" aria-labelledby="gate-table">
          <h3 id="gate-table">Exit status by gate</h3>
          <p className="lp-lede">The same eight runs without the controls. Exit status 1 means at least one new finding met the threshold.</p>
          <div className="lp-table-wrap">
            <table className="lp-table">
              <thead>
                <tr><th scope="col">Baseline</th><th scope="col"><code>--fail-on</code></th><th scope="col" className="lp-num">Blocking</th><th scope="col" className="lp-num">Exit</th></tr>
              </thead>
              <tbody>
                {report.gate.map((item) => {
                  const current = item.baseline === baseline && item.failOn === failOn;
                  return (
                    <tr key={`${item.baseline}-${item.failOn}`} aria-current={current ? "true" : undefined} className={current ? "lp-current" : undefined}>
                      <td>{item.baseline ? "yes" : "no"}</td>
                      <td>{item.failOn}</td>
                      <td className="lp-num">{numberFormat.format(item.blocking)}</td>
                      <td className="lp-num">{item.exit}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {tail}

        <p className="lp-echo" aria-hidden="true"><span>$ echo $?</span><span><Stamp value={String(row.exit)} /></span></p>
      </div>
    </main>
  );
}
