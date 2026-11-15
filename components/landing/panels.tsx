import { drift, position, versions } from "@/lib/landing/drift";
import { gateRow, numberFormat, report, shortSha, type FailOn } from "@/lib/landing/report";

const COMMENT_ROW = drift.states[0].lines.findIndex((line) => line.text.trim().startsWith("#"));
const CODE_ROW = drift.states[2].lines.findIndex((line) => line.n === drift.finding.evidence.codeLine);
const squiggle = "M1 6 q5 -5 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t8 0";

function Cell<T>({ values, step, render, className }: { values: T[]; step: number; render: (value: T) => React.ReactNode; className: string }) {
  const runs = versions(values);
  return (
    <span className={`cl-slot ${className}`}>
      {runs.map((run) => {
        const where = position(run, step);
        return (
          <span key={run.from} className={where === "current" ? "cl-now-on" : `cl-off cl-${where}`} aria-hidden={where === "current" ? undefined : true}>
            {render(run.value)}
          </span>
        );
      })}
    </span>
  );
}

/** The real file at one of three commits. Step 2 adds the finding. */
export function CodePanel({ step }: { step: 0 | 1 | 2 }) {
  const state = drift.states[step];
  const rows = drift.states[0].lines.map((_, row) => drift.states.map((s) => s.lines[row]));
  const flagged = step === 2;
  return (
    <figure className="cl-panel" data-step={step} data-flagged={flagged} aria-label={`${drift.path} at commit ${state.commit.short}, ${state.commit.date}`}>
      <figcaption className="cl-panel-head">
        <strong>{drift.path}</strong>
        <span>{state.commit.short}, {state.commit.date}</span>
      </figcaption>
      <div className="cl-file" tabIndex={0}>
        {rows.map((row, index) => {
          const comment = index === COMMENT_ROW;
          const changed = index === CODE_ROW && step > 0 && row[step].text !== row[0].text;
          return (
            <div key={index} className={comment ? "cl-line cl-line-comment" : "cl-line"} data-changed={changed ? "" : undefined}>
              <Cell className="cl-blame" values={row.map((line) => line.date)} step={step} render={(value) => value} />
              <Cell className="cl-num" values={row.map((line) => line.n)} step={step} render={(value) => value} />
              {comment ? (
                <span className="cl-src">
                  {row[0].text.match(/^\s*/)?.[0]}
                  <span className="cl-flag">
                    {row[0].text.trim()}
                    <svg className="cl-squiggle" viewBox="0 0 240 12" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                      <path d={squiggle} pathLength={1} />
                    </svg>
                  </span>
                </span>
              ) : (
                <Cell className="cl-src" values={row.map((line) => line.text)} step={step} render={(value) => value || " "} />
              )}
            </div>
          );
        })}
      </div>
      <div className="cl-finding">
        <Cell
          className="cl-finding-head"
          values={[false, false, true]}
          step={step}
          render={(value) => value ? (
            <><span className="cl-rule">{drift.finding.rule}</span> ({drift.finding.severity}), line {drift.finding.line}: {drift.finding.message}</>
          ) : "git blame for the comment and the line below it"}
        />
        <dl>
          <dt>Comment</dt>
          <dd className="cl-d-comment"><Cell className="" values={rows[COMMENT_ROW].map((line) => `${line.date}, ${line.commit}`)} step={step} render={(value) => value} /></dd>
          <dt>Code</dt>
          <dd className="cl-d-code"><Cell className="" values={rows[CODE_ROW].map((line) => `${line.date}, ${line.commit}`)} step={step} render={(value) => value} /></dd>
        </dl>
      </div>
    </figure>
  );
}

const levels: FailOn[] = ["low", "review", "high"];
const max = gateRow(false, "low").findings;

/** Blocking findings per --fail-on level, with and without a baseline. */
export function ProofPanel() {
  return (
    <figure className="cl-panel cl-proof">
      <h3>Findings that fail the build in {report.repository}</h3>
      <dl className="cl-bars">
        {levels.map((level) => {
          const without = gateRow(false, level).blocking;
          const withBase = gateRow(true, level).blocking;
          return [
            <dt key={`${level}-g`} className="cl-group">--fail-on {level}</dt>,
            <dt key={`${level}-a`}>no baseline</dt>,
            <dd key={`${level}-ab`}><div className="cl-bar" style={{ width: `${(without / max) * 100}%` }} /></dd>,
            <dd key={`${level}-an`} className="cl-n">{numberFormat.format(without)}</dd>,
            <dt key={`${level}-b`}>baseline</dt>,
            <dd key={`${level}-bb`}><div className="cl-bar" data-base="true" style={{ width: `${(withBase / max) * 100}%` }} /></dd>,
            <dd key={`${level}-bn`} className="cl-n">{numberFormat.format(withBase)}</dd>,
          ];
        })}
      </dl>
      <figcaption className="cl-caption">
        Runs against {report.repository} at {shortSha(report.commit)} ({report.commitDate}), with a baseline recorded at {shortSha(report.baselineCommit)} ({report.baselineDate}). Every run with a blocking finding exited 1.
      </figcaption>
    </figure>
  );
}

/** The real `compare` report, trimmed to its header and one blocking finding. */
export function TermPanel() {
  const t = drift.terminal;
  return (
    <figure className="cl-panel" aria-label="Terminal output of comment-lens compare">
      <figcaption className="cl-panel-head"><strong>Terminal</strong><span>{report.repository} at {shortSha(report.commit)}</span></figcaption>
      <pre className="cl-term" tabIndex={0}>
        <span className="cl-cmd"><span className="cl-prompt">$ </span>{t.command}</span>{"\n"}
        <span className="cl-out">{t.header.join("\n")}</span>{"\n\n"}
        <span className="cl-dim">[{numberFormat.format(t.skippedBefore)} lines omitted here]</span>{"\n\n"}
        <span className="cl-out">{t.section.join("\n")}</span>{"\n\n"}
        <span className="cl-dim">[{numberFormat.format(t.skippedAfter)} lines omitted here]</span>{"\n"}
        <span className="cl-cmd"><span className="cl-prompt">$ </span>echo $?</span>{"\n"}
        <span className="cl-exit">{t.exit}</span>{"\n"}
        <span className="cl-prompt">$ </span><span className="cl-caret" aria-hidden="true" />
      </pre>
    </figure>
  );
}
