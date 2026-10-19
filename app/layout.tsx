import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./workspace.css";

export const metadata: Metadata = {
  title: "Review workspace | Comment Lens",
  description: "Inspect code comments, review the evidence, and record decisions for a repository scan.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
