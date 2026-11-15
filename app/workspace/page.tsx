import type { Metadata } from "next";
import { ReviewWorkspace } from "@/components/review-workspace";

export const metadata: Metadata = {
  title: "Review workspace | Comment Lens",
  description: "Inspect code comments, review the evidence, and record decisions for a repository scan.",
  robots: { index: false },
  alternates: { canonical: "/workspace" },
};

export default function Workspace() {
  return <ReviewWorkspace />;
}
