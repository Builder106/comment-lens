import Link from "next/link";
import type { ReactNode } from "react";
import { JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import "@/app/landing.css";

const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--lp-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--lp-mono", display: "swap" });

export const repoUrl = "https://github.com/Builder106/comment-lens";

export function Wordmark() {
  return (
    <Link className="lp-wordmark" href="/">
      <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
      <span>Comment<span className="wordmark-light">Lens</span></span>
    </Link>
  );
}

export function SiteLinks() {
  return (
    <nav className="lp-links" aria-label="Project">
      <Link href="/#by-rule">Rules</Link>
      <a href={`${repoUrl}#local-comment-checks`}>Docs</a>
      <a href={repoUrl}>GitHub</a>
    </nav>
  );
}

export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <div className={`lp ${sans.variable} ${mono.variable}`}>
      <a className="skip-link" href="#report">Skip to the report</a>
      {children}
    </div>
  );
}
