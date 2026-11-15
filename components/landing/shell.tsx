import Link from "next/link";
import type { ReactNode } from "react";
import { Geist_Mono, Instrument_Sans } from "next/font/google";
import { Mark } from "./mark";
import "@/app/landing.css";

const sans = Instrument_Sans({ subsets: ["latin"], variable: "--cl-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--cl-mono", display: "swap" });

export const repoUrl = "https://github.com/Builder106/comment-lens";
export const docsUrl = `${repoUrl}#local-comment-checks`;
export const pypiUrl = "https://pypi.org/project/comment-lens-scanner/";

export function Wordmark() {
  return (
    <Link className="cl-wordmark" href="/">
      <Mark className="cl-mark" />
      <span>Comment Lens</span>
    </Link>
  );
}

export function SiteLinks() {
  return (
    <nav className="cl-links" aria-label="Project">
      <Link href="/#rules">Rules</Link>
      <a href={docsUrl}>Docs</a>
      <a href={repoUrl}>GitHub</a>
    </nav>
  );
}

export function LandingShell({ children, skipTo = "main" }: { children: ReactNode; skipTo?: string }) {
  return (
    <div className={`cl ${sans.variable} ${mono.variable}`}>
      <a className="skip-link" href={`#${skipTo}`}>Skip to content</a>
      <header className="cl-top"><Wordmark /><SiteLinks /></header>
      {children}
      <footer className="cl-foot">
        <p>
          MIT licensed. <a href={pypiUrl}>comment-lens-scanner</a> on PyPI, source on <a href={repoUrl}>GitHub</a>.
        </p>
      </footer>
    </div>
  );
}
