"use client";

import { useState, type ChangeEvent } from "react";
import { z } from "zod";
import type { ScanSummary } from "./review/types";

const count = z.number().int().nonnegative();
const group = z.object({ value: z.string(), count });
const summarySchema = z.object({
  historySummaryVersion: z.literal(1),
  scans: count,
  currentFindings: count,
  repeatedFindings: z.array(z.object({ repository: z.string(), findingId: z.string(), ruleId: z.string(), path: z.string(), count, firstSeen: z.string(), lastSeen: z.string() })).max(10000),
  trends: z.array(z.object({ repository: z.string(), scanId: z.string(), generatedAt: z.string(), source: z.enum(["local", "ci"]), coverage: z.enum(["full", "partial", "failed"]), findings: count.nullable(), newSincePrevious: count.nullable(), resolvedSincePrevious: count.nullable() })).max(10000),
  summaryBy: z.object({ repository: z.array(group), path: z.array(group), language: z.array(group), rule: z.array(group), owner: z.array(group) }),
});

type Summary = z.infer<typeof summarySchema>;
const dimensions = ["repository", "path", "language", "rule", "owner"] as const;

export function MaintenanceHistory({ scans }: { scans: ScanSummary[] }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const loadSummary = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("The summary must be smaller than 2 MiB.");
      const parsed = summarySchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error("Choose a Comment Lens summary JSON file.");
      setSummary(parsed.data);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the summary.");
    } finally {
      input.value = "";
    }
  };

  const hosted = scans.filter((scan) => scan.status === "complete").slice(0, 6);
  return <section className="maintenance-history" aria-labelledby="maintenance-history-title">
    <div className="maintenance-header">
      <div>
        <h2 id="maintenance-history-title">Maintenance history</h2>
        <p>Compare local and CI reports with the hosted scan history.</p>
      </div>
      <div className="maintenance-import">
        <label htmlFor="maintenance-summary-file">Open a summary JSON file</label>
        <input id="maintenance-summary-file" type="file" accept=".json,application/json" aria-describedby="maintenance-import-help" onChange={loadSummary} />
      </div>
    </div>
    <p id="maintenance-import-help" className="maintenance-help">Generate it with comment-lens summary. The file stays in this browser tab and is not uploaded.</p>
    {error && <p className="maintenance-error" role="alert">{error}</p>}
    {summary && <div className="maintenance-imported">
      <div className="maintenance-stats"><span><strong>{summary.scans}</strong> imported scans</span><span><strong>{summary.currentFindings}</strong> current findings</span><span><strong>{summary.repeatedFindings.length}</strong> repeated findings</span><button type="button" className="text-button" onClick={() => setSummary(null)}>Clear imported summary</button></div>
      <div className="maintenance-table-wrap"><table><caption>Local and CI finding history</caption><thead><tr><th scope="col">Repository</th><th scope="col">Date</th><th scope="col">Source</th><th scope="col">Coverage</th><th scope="col">Findings</th><th scope="col">New</th><th scope="col">Resolved</th></tr></thead><tbody>{summary.trends.slice(-10).map((trend) => <tr key={`${trend.repository}:${trend.scanId}`}><th scope="row">{trend.repository}</th><td>{trend.generatedAt.slice(0, 10)}</td><td>{trend.source}</td><td>{trend.coverage}</td><td>{trend.findings ?? "n/a"}</td><td>{trend.newSincePrevious ?? "n/a"}</td><td>{trend.resolvedSincePrevious ?? "n/a"}</td></tr>)}</tbody></table></div>
      <div className="maintenance-groups">{dimensions.map((dimension) => <div key={dimension}><h3>By {dimension}</h3><ul>{summary.summaryBy[dimension].slice(0, 5).map((group) => <li key={group.value}><span title={group.value}>{group.value}</span><strong>{group.count}</strong></li>)}</ul></div>)}</div>
      {summary.repeatedFindings.length > 0 && <div className="maintenance-repeated"><h3>Repeated findings</h3><ul>{summary.repeatedFindings.slice(0, 5).map((finding) => <li key={`${finding.repository}:${finding.findingId}`}><span>{finding.repository} / {finding.path}: {finding.ruleId}</span><strong>{finding.count} scans</strong></li>)}</ul></div>}
    </div>}
    <div className="maintenance-hosted"><h3>Hosted scans</h3>{hosted.length ? <div className="maintenance-table-wrap"><table><caption>Recent hosted scan comment counts</caption><thead><tr><th scope="col">Date</th><th scope="col">Commit</th><th scope="col">Comments</th></tr></thead><tbody>{hosted.map((item) => <tr key={item.scanId}><td>{item.completedAt?.slice(0, 10) ?? item.createdAt?.slice(0, 10) ?? "Unknown"}</td><td>{item.resolvedCommit?.slice(0, 12) ?? "Unknown"}</td><td>{item.commentCount ?? 0}</td></tr>)}</tbody></table></div> : <p>No completed hosted scans yet.</p>}</div>
  </section>;
}
