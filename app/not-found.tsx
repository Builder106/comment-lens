import type { Metadata } from "next";
import Link from "next/link";
import { LandingShell } from "@/components/landing/shell";

export const metadata: Metadata = { title: "Not found | Comment Lens", robots: { index: false } };

export default function NotFound() {
  return (
    <LandingShell>
      <main className="cl-doc" id="main" tabIndex={-1}>
        <p className="cl-crumb">404</p>
        <h1>This page has no history.</h1>
        <pre tabIndex={0}><code>{"$ git blame -- this-page\nfatal: no such path 'this-page' in HEAD"}</code></pre>
        <p><Link href="/">Go to the home page</Link> or <Link href="/#rules">browse the rules</Link>.</p>
      </main>
    </LandingShell>
  );
}
