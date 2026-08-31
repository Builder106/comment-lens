import type { Metadata } from "next";
import "../styles/dashboard.css";

export const metadata: Metadata = {
  title: "Comment Lens",
  description: "Private code-comment review dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
