import type { Metadata } from "next";
import Link from "next/link";
import { LandingShell, SiteLinks, Wordmark } from "@/components/landing/shell";

export const metadata: Metadata = { title: "Not found | Comment Lens", robots: { index: false } };

export default function NotFound() {
  return (
    <LandingShell>
      <div className="lp-page">
        <header className="lp-top"><Wordmark /><SiteLinks /></header>
        <main className="lp-rule" id="report" tabIndex={-1}>
          <h1 className="lp-rule-title">No such file</h1>
          <pre className="lp-code" tabIndex={0}><code>{"$ comment-lens check .\ncomment-lens: error: this page does not exist in the report\n$ echo $?\n2"}</code></pre>
          <p>Exit status 2 means the scan could not finish, and a scan that cannot finish never reads as clean. <Link href="/">Go back to the report</Link>.</p>
        </main>
      </div>
    </LandingShell>
  );
}
