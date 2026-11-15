import type { Metadata } from "next";
import Link from "next/link";
import { GateReport } from "@/components/landing/gate-report";
import { LandingShell, SiteLinks, Wordmark, repoUrl } from "@/components/landing/shell";

const description = "A local CLI and CI check that reports code comments a person should review: unresolved tasks, broken links, and comments whose nearby code changed. A baseline lets you adopt it without fixing old findings.";

export const metadata: Metadata = {
  title: "Comment Lens: a CI check for code comments",
  description,
  alternates: { canonical: "/" },
  openGraph: { title: "Comment Lens: a CI check for code comments", description, url: "/" },
  twitter: { title: "Comment Lens: a CI check for code comments", description },
};

const install = "python3 -m pip install comment-lens-scanner";

function Intro() {
  return (
    <>
      <header className="lp-top"><Wordmark /><SiteLinks /></header>
      <h1 className="lp-h1">A CI check for code comments.</h1>
      <p className="lp-pitch">
        Comment Lens reads the comments already in your repository and reports the ones a person should look at: tasks nobody followed up, links to files that moved, comments whose nearby code changed after they were written. It runs on your machine and blocks nothing until you set a threshold.
      </p>
      <div className="lp-install">
        <pre className="lp-code" tabIndex={0}><code>{install}{"\n"}comment-lens check . --fail-on high</code></pre>
        <p className="lp-small">Needs Python 3.12 or newer. The package is comment-lens-scanner on PyPI.</p>
      </div>
    </>
  );
}

function Tail() {
  return (
    <>
      <section className="lp-section" aria-labelledby="run-it">
        <h3 id="run-it">Run it on your repository</h3>
        <ol className="lp-steps">
          <li>
            <h4>Read what is there</h4>
            <pre className="lp-code" tabIndex={0}><code>comment-lens check .</code></pre>
            <p>Prints a Markdown report. Add <code>--format json</code> or <code>--format sarif</code> for tools.</p>
          </li>
          <li>
            <h4>Check only what a pull request touches</h4>
            <pre className="lp-code" tabIndex={0}><code>comment-lens check . --changed origin/main...HEAD --fail-on high</code></pre>
            <p>Exit status 1 means a finding met the threshold. Status 2 means the scan or configuration failed, and a failed scan never reads as clean.</p>
          </li>
          <li>
            <h4>Adopt it without fixing the backlog</h4>
            <pre className="lp-code" tabIndex={0}><code>{"comment-lens baseline create . --output .comment-lens-baseline.json\ncomment-lens compare . --baseline .comment-lens-baseline.json --fail-on high"}</code></pre>
            <p>The baseline stores finding IDs, paths and rule names, not comment text. Only new findings can block.</p>
          </li>
        </ol>
        <p className="lp-lede">
          The repository has a <a href={`${repoUrl}/blob/main/docs/ci.md`}>GitHub Actions workflow</a> that annotates pull requests from the SARIF report, and a <a href={`${repoUrl}/blob/main/docs/editor.md`}>VS Code adapter</a> that shows the same findings beside the comments.
        </p>
      </section>

      <section className="lp-section" aria-labelledby="limits">
        <h3 id="limits">What it does not do</h3>
        <ul className="lp-plain">
          <li>It does not upload source. The CLI runs locally, reads files without executing them, and does not download grammars during a check.</li>
          <li>It does not edit your files, rewrite comments or open pull requests.</li>
          <li>It does not decide a comment is wrong. A finding is a reason for a person to look, and each one carries the rule and the evidence behind it.</li>
          <li>It does not use AI to find anything. The rules are deterministic. The optional hosted workspace can explain one selected finding with Gemini when you ask.</li>
        </ul>
      </section>

      <section className="lp-section" aria-labelledby="workspace">
        <h3 id="workspace">The hosted workspace</h3>
        <p className="lp-lede">
          A second interface stores a review decision for each comment: keep, rewrite, delete or unsure. Each deployment accepts one GitHub account, so there is no public sign-up. You can run your own copy from the <a href={`${repoUrl}#deployment-runbook`}>deployment runbook</a>, or <Link href="/workspace">open the workspace</Link> if it is yours.
        </p>
      </section>
    </>
  );
}

export default function Home() {
  return (
    <LandingShell>
      <GateReport intro={<Intro />} tail={<Tail />} />
    </LandingShell>
  );
}
