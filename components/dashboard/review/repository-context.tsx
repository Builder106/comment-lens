import type { RepositoryContext, ScanSummary } from "./types";

export function RepositoryContextBar({
  repositories,
  repository,
  scan,
  scans,
  onRepositoryChange,
  onScanChange,
}: {
  repositories: RepositoryContext[];
  repository: RepositoryContext;
  scan: ScanSummary | null;
  scans: ScanSummary[];
  onRepositoryChange: (repositoryId: string) => void;
  onScanChange: (scanId: string) => void;
}) {
  return (
    <section className="repository-context-bar" aria-label="Repository context">
      <div className="repository-context-copy">
        <p className="repository-name">{repository.owner}/{repository.name}</p>
        <p className="repository-ref">{scan?.resolvedCommit?.slice(0, 12) ?? scan?.ref ?? repository.defaultBranch}</p>
      </div>
      <div className="repository-context-controls">
        {repositories.length > 1 ? (
          <label>
            <span className="sr-only">Repository</span>
            <select value={repository.id} onChange={(event) => onRepositoryChange(event.target.value)}>
              {repositories.map((item) => <option key={item.id} value={item.id}>{item.owner}/{item.name}</option>)}
            </select>
          </label>
        ) : null}
        <label>
          <span className="sr-only">Recent scans</span>
          <select value={scan?.scanId ?? ""} onChange={(event) => onScanChange(event.target.value)}>
            <option value="">No scan selected</option>
            {scans.map((item) => <option value={item.scanId} key={item.scanId}>{item.status} — {item.resolvedCommit?.slice(0, 12) ?? item.ref ?? item.scanId}</option>)}
          </select>
        </label>
      </div>
    </section>
  );
}
