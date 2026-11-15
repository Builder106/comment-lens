import type { MetadataRoute } from "next";
import { rules } from "@/lib/landing/rules";

const base = "https://comment-lens-review.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${base}/` }, ...rules.map((rule) => ({ url: `${base}/rules/${rule.id}` }))];
}
