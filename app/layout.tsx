import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./workspace.css";

const description = "A local CLI and CI check that reports code comments a person should review: unresolved tasks, broken links, and comments whose nearby code changed. A baseline lets you adopt it without fixing old findings.";
const card = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Find the comments your code has outgrown. A pwndbg comment from 2018 is highlighted above a line of code changed in 2022.",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://comment-lens-review.vercel.app"),
  title: "Comment Lens: a CI check for code comments",
  description,
  openGraph: {
    type: "website",
    siteName: "Comment Lens",
    title: "Comment Lens",
    description,
    url: "/",
    images: [card],
  },
  twitter: {
    card: "summary_large_image",
    title: "Comment Lens",
    description,
    images: [card.url],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
