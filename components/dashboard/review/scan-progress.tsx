import type { ScanSummary } from "./types";

export function ScanProgress({ scan, repositoryName, onRetry }: { scan: ScanSummary; repositoryName: string; onRetry: () => void }) {
  const failed = scan.status === "failed";
  const running = scan.status === "running" || scan.status === "queued";

  return (
    <section className={`scan-progress ${failed ? "scan-progress-failed" : ""}`} aria-labelledby="scan-progress-title" role={failed ? "alert" : "status"} aria-live={failed ? undefined : "polite"}>
      <div>
        <h2 id="scan-progress-title">{failed ? "The scan did not finish" : running ? `Scanning ${repositoryName}` : "Scan status"}</h2>
        <p>{failed ? "No review queue was published for this scan. Start another scan when the repository is ready." : "The worker reads repository files without changing them. The review queue appears when it finishes."}</p>
      </div>
      {failed ? <button className="button button-primary" type="button" onClick={onRetry}>Start another scan</button> : null}
    </section>
  );
}
