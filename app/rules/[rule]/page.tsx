import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Source } from "@/components/landing/source";
import { LandingShell, SiteLinks, Wordmark, repoUrl } from "@/components/landing/shell";
import { numberFormat, report } from "@/lib/landing/report";
import { ruleById, rules } from "@/lib/landing/rules";

export const dynamicParams = false;

export function generateStaticParams() {
  return rules.map((rule) => ({ rule: rule.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ rule: string }> }): Promise<Metadata> {
  const rule = ruleById.get((await params).rule);
  if (!rule) return {};
  const title = `${rule.id} rule | Comment Lens`;
  return { title, description: rule.summary, alternates: { canonical: `/rules/${rule.id}` }, openGraph: { title, description: rule.summary, url: `/rules/${rule.id}` } };
}

function config(rule: { id: string; tune: string }) {
  return rule.tune.startsWith("[") ? `version = 1\n\n${rule.tune}` : `version = 1\n\n[policy.rules]\n${rule.tune}`;
}

export default async function RulePage({ params }: { params: Promise<{ rule: string }> }) {
  const rule = ruleById.get((await params).rule);
  if (!rule) notFound();
  const index = rules.findIndex((item) => item.id === rule.id);
  const seen = report.byRule.find((item) => item.rule === rule.id);
  const example = report.sample.find((item) => item.rule === rule.id);
  const total = seen ? seen.new + seen.existing : 0;

  return (
    <LandingShell>
      <div className="lp-page">
        <header className="lp-top"><Wordmark /><SiteLinks /></header>
        <main className="lp-rule" id="report" tabIndex={-1}>
          <p className="lp-crumb"><Link href="/">Report</Link> / <Link href="/#by-rule">Rules</Link> / {rule.id}</p>
          <h1 className="lp-rule-title">{rule.id}</h1>
          <p className="lp-rule-summary">{rule.summary}</p>
          <dl className="lp-meta lp-rule-meta">
            <div><dt>Default severity</dt><dd>{rule.severity}</dd></div>
            <div><dt>Needs git history</dt><dd>{rule.needsHistory ? "yes" : "no"}</dd></div>
          </dl>

          <section className="lp-section" aria-labelledby="detects">
            <h2 id="detects">What it detects</h2>
            <p>{rule.detects}</p>
          </section>
          <section className="lp-section" aria-labelledby="evidence">
            <h2 id="evidence">Evidence it records</h2>
            <pre className="lp-code" tabIndex={0}><code>{rule.evidence}</code></pre>
          </section>
          <section className="lp-section" aria-labelledby="limits">
            <h2 id="limits">Where it is weak</h2>
            <p>{rule.limits}</p>
          </section>
          <section className="lp-section" aria-labelledby="tune">
            <h2 id="tune">Change it</h2>
            <p>Put this in <code>.comment-lens.toml</code> at the repository root. Severity can be <code>low</code>, <code>review</code>, <code>high</code> or <code>off</code>.</p>
            <pre className="lp-code" tabIndex={0}><code>{config(rule)}</code></pre>
          </section>
          <section className="lp-section" aria-labelledby="seen">
            <h2 id="seen">In the {report.repository} run</h2>
            {example ? (
              <>
                <p>{numberFormat.format(total)} findings. One of them, at <code>{example.path}:{example.line}</code>:</p>
                <Source context={example.context} startLine={example.startLine} hit={example.line} />
                <p className="lp-small"><a href={example.permalink}>View the line at commit {report.commit.slice(0, 7)}</a></p>
              </>
            ) : (
              <p>{total === 0 ? "No findings for this rule in that run." : `${numberFormat.format(total)} findings in that run.`} <Link href="/#findings">See the report</Link>.</p>
            )}
          </section>

          <nav className="lp-rule-nav" aria-label="Rules">
            {rules[index - 1] ? <Link href={`/rules/${rules[index - 1].id}`}>Previous: {rules[index - 1].id}</Link> : <span />}
            {rules[index + 1] ? <Link href={`/rules/${rules[index + 1].id}`}>Next: {rules[index + 1].id}</Link> : <span />}
          </nav>
          <p className="lp-small">Rule definitions come from <a href={`${repoUrl}/blob/main/scanner/comment_lens_scanner/policy.py`}>policy.py</a> and <a href={`${repoUrl}/blob/main/scanner/comment_lens_scanner/maintenance.py`}>maintenance.py</a>.</p>
        </main>
      </div>
    </LandingShell>
  );
}
