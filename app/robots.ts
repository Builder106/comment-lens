import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/workspace"] }, sitemap: "https://comment-lens-review.vercel.app/sitemap.xml" };
}
