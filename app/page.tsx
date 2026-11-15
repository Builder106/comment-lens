import type { Metadata } from "next";
import Link from "next/link";
import { CopyCommand } from "@/components/landing/copy-command";
import { LandingShell, docsUrl, repoUrl } from "@/components/landing/shell";
import { Story, type Chapter } from "@/components/landing/story";
import { day, drift } from "@/lib/landing/drift";
import { gateRow, numberFormat, report, shortSha } from "@/lib/landing/report";
import { ruleById } from "@/lib/landing/rules";

const description = "Comment Lens checks every comment in a repository against its git history and reports the ones a person should read again, locally and in CI.";

export const metadata: Metadata = {
  title: "Comment Lens: find the comments your code has outgrown",
  description,
  alternates: { canonical: "/" },
  openGraph: { title: "Comment Lens", description, url: "/" },
  twitter: { title: "Comment Lens", description },
};

const install = "python3 -m pip install comment-lens-scanner";
const { evidence } = drift.finding;
const written = day(evidence.commentAuthoredAt);
const changed = day(evidence.codeAuthoredAt);
const change = drift.states[1].commit;
const head = drift.states[2].commit;
const spelled = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const years = spelled[Number(changed.slice(0, 4)) - Number(written.slice(0, 4))];
const all = gateRow(false, "low").findings;
const noBase = gateRow(false, "high").blocking;
const withBase = gateRow(true, "high").blocking;

const groups = [
  { title: "Tasks left in comments", ids: ["todo", "fixme", "hack", "task_without_reference", "aged_task"] },
  { title: "Comments and the code beside them", ids: ["nearby_code_changed", "missing_local_reference", "restates_symbol"] },
  { title: "Wording", ids: ["excessive_verbosity", "hedge_stack", "promotional_or_vague_language"] },
];

function found(id: string) {
  const row = report.byRule.find((item) => item.rule === id);
  return row ? row.new + row.existing : 0;
}

const chapters: Chapter[] = [
  {
    id: "top",
    rail: `${written.slice(0, 4)} comment`,
    body: (
      <>
        <h1 id="top-title" className="cl-h1">Find the comments your code has outgrown.</h1>
        <p className="cl-lede">Comment Lens checks every comment in a repository against its git history and reports the ones a person should read again. It runs on your machine and in CI.</p>
        <CopyCommand command={install} />
        <p className="cl-after">Needs Python 3.12 or newer. Run <code>comment-lens check .</code> in a repository, or <a href={docsUrl}>read the docs</a>.</p>
      </>
    ),
  },
  {
    id: "drift",
    rail: `${changed.slice(0, 4)} code change`,
    body: (
      <>
        <p className="cl-when">{change.short}, {change.date}</p>
        <h2 id="drift-title" className="cl-h2">{years} years after the comment, the check it described was removed.</h2>
        <p>
          In {drift.repository}, the commit {`"${change.subject}"`} replaced an optional import of Pygments with a plain import, which removed the check for a missing Pygments. The comment above that check was left as it was.
        </p>
      </>
    ),
  },
  {
    id: "check",
    rail: `${head.date.slice(0, 4)} check`,
    body: (
      <>
        <p className="cl-when">{head.short}, {head.date}</p>
        <h2 id="check-title" className="cl-h2">Comment Lens compares when the comment and the code last changed.</h2>
        <p>
          For every comment, it asks git when the comment last changed and when the nearest line of code did. If the code is newer, the finding records both commits. The file has had {drift.commitsSinceChange} commits since that change, and the comment still describes a check that no longer exists.
        </p>
        <p className="cl-note">
          Ten other rules cover things like tasks with no issue or owner and links to files that no longer exist. <Link href="#rules">See all eleven</Link>.
        </p>
      </>
    ),
  },
  {
    id: "baseline",
    rail: "baseline",
    body: (
      <>
        <h2 id="baseline-title" className="cl-h2">Record a baseline, and only new comments can fail a build.</h2>
        <p>
          The first run in {report.repository} reports {numberFormat.format(all)} findings, more than anyone fixes in one pull request. A baseline records them once. After that, <code>--fail-on high</code> blocks only the {withBase} FIXME comments added since {report.baselineDate}, not all {noBase}.
        </p>
        <p className="cl-note">The baseline file stores finding IDs, paths and rule names. It does not store comment text.</p>
      </>
    ),
  },
  {
    id: "ci",
    rail: `exit ${drift.terminal.exit}`,
    body: (
      <>
        <h2 id="ci-title" className="cl-h2">In CI, exit status 1 stops the pull request.</h2>
        <p>
          <code>compare</code> exits 1 when a new finding meets the threshold, and 2 when the scan itself fails, so a broken run never passes as clean.
        </p>
        <p className="cl-note">
          The <a href={`${repoUrl}/blob/main/docs/ci.md`}>GitHub Actions workflow</a> turns the SARIF report into annotations on the changed lines, and the <a href={`${repoUrl}/blob/main/docs/editor.md`}>VS Code adapter</a> shows the same findings in the editor.
        </p>
      </>
    ),
  },
];

export default function Home() {
  return (
    <LandingShell>
      <Story chapters={chapters} />

      <section id="rules" className="cl-band" aria-labelledby="rules-title">
        <div className="cl-band-head">
          <h2 id="rules-title" className="cl-h2">Eleven rules</h2>
          <p>Every rule is deterministic and has a severity you can change in <code>.comment-lens.toml</code>. None of them calls a language model.</p>
        </div>
        {groups.map((group) => (
          <div key={group.title} className="cl-group-row">
            <h3>{group.title}</h3>
            <ul className="cl-rules">
              {group.ids.map((id) => {
                const rule = ruleById.get(id);
                if (!rule) return null;
                return (
                  <li key={id}>
                    <Link href={`/rules/${id}`}>
                      <span className="cl-hl">{id}</span>
                      <span className="cl-sev">{rule.severity}, {numberFormat.format(found(id))} in {report.repository.split("/")[1]}</span>
                      <span className="cl-sum">{rule.summary}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section id="start" className="cl-band" aria-labelledby="start-title">
        <div className="cl-band-head">
          <h2 id="start-title" className="cl-h2">Run it on your repository</h2>
          <p><code>check</code> and <code>compare</code> print Markdown by default. Add <code>--format json</code> or <code>--format sarif</code> for other tools.</p>
        </div>
        <ol className="cl-steps">
          <li>
            <h3>See what is there</h3>
            <pre tabIndex={0}><code>comment-lens check .</code></pre>
            <p>Reports every finding and exits 0 until you set a threshold.</p>
          </li>
          <li>
            <h3>Check a pull request</h3>
            <pre tabIndex={0}><code>comment-lens check . --changed origin/main...HEAD --fail-on high</code></pre>
            <p>Reads only the comments on lines the branch touched.</p>
          </li>
          <li>
            <h3>Adopt it with a baseline</h3>
            <pre tabIndex={0}><code>{"comment-lens baseline create . \\\n  --output .comment-lens-baseline.json\ncomment-lens compare . \\\n  --baseline .comment-lens-baseline.json \\\n  --fail-on high"}</code></pre>
            <p>Commit the baseline, then gate on what is new.</p>
          </li>
        </ol>
        <p className="cl-limits">
          Comment Lens reads files without running them, uploads nothing and never edits a comment. Each finding comes with its evidence so a person can decide what to do. The examples on this page come from {report.repository} at {shortSha(report.commit)}, and <a href={`${repoUrl}/blob/main/docs/landing-data.md`}>this page explains how they were made</a>. There is also a hosted review workspace. Each deployment accepts one account, so <Link href="/workspace">open it</Link> if it is yours, or run your own copy from the <a href={`${repoUrl}#deployment-runbook`}>deployment runbook</a>.
        </p>
      </section>
    </LandingShell>
  );
}
