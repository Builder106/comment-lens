import type { ReactNode } from "react";

type StateSurfaceProps = {
  children: ReactNode;
  title: string;
  description: string;
  role?: "alert" | "status";
};

export type ConnectGithubProps = {
  oauthHref: string;
};

export type NoRepositoryAccessProps = {
  onRefresh: () => void;
  isRefreshing?: boolean;
  error?: string;
};

export type ReadyToScanProps = {
  error?: string;
  repositoryName: string;
  ref: string;
  retentionSummary: string;
  onStartScan: () => void;
  isStarting?: boolean;
};

export type ScanInProgressProps = {
  repositoryName: string;
  ref: string;
  status: "queued" | "running";
  startedAt?: string;
};

export type ScanFailedProps = {
  repositoryName: string;
  failureSummary?: string;
  onRetry: () => void;
  isRetrying?: boolean;
};

function StateSurface({ children, description, role, title }: StateSurfaceProps) {
  return (
    <section className="cl-state-surface" aria-labelledby="dashboard-state-title" role={role} aria-live={role === "status" ? "polite" : undefined}>
      <div className="cl-state-copy">
        <h1 id="dashboard-state-title">{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

export function ConnectGithub({ oauthHref }: ConnectGithubProps) {
  return (
    <StateSurface
      title="Connect a repository"
      description="Sign in with GitHub to review comments in repositories you explicitly grant to Comment Lens."
    >
      <div className="cl-state-action">
        <a className="cl-button cl-button-primary" href={oauthHref}>
          Connect GitHub
        </a>
        <p className="cl-state-note">Comment Lens reads repository content for a scan. It does not change repository files.</p>
      </div>
    </StateSurface>
  );
}

export function NoRepositoryAccess({ error, isRefreshing = false, onRefresh }: NoRepositoryAccessProps) {
  return (
    <StateSurface
      role={error ? "alert" : undefined}
      title="No repository access"
      description="Your GitHub account is connected, but the Comment Lens GitHub App cannot read any repositories yet."
    >
      <div className="cl-state-action">
        {error ? <p className="cl-state-error">{error}</p> : null}
        <button className="cl-button cl-button-primary" type="button" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? "Refreshing repositories…" : "Refresh repositories"}
        </button>
        <p className="cl-state-note">Update the app installation in GitHub, then refresh this list.</p>
      </div>
    </StateSurface>
  );
}

export function ReadyToScan({
  error,
  isStarting = false,
  onStartScan,
  ref,
  repositoryName,
  retentionSummary,
}: ReadyToScanProps) {
  return (
    <StateSurface
      title="Ready to scan"
      description="Create a review queue from the current tracked files in this repository."
    >
      <div className="cl-scan-brief" aria-label="Scan details">
        {error ? <p className="cl-state-error" role="alert">{error}</p> : null}
        <dl>
          <div>
            <dt>Repository</dt>
            <dd>{repositoryName}</dd>
          </div>
          <div>
            <dt>Ref</dt>
            <dd><code>{ref}</code></dd>
          </div>
          <div>
            <dt>Retention</dt>
            <dd>{retentionSummary}</dd>
          </div>
        </dl>
        <button className="cl-button cl-button-primary" type="button" onClick={onStartScan} disabled={isStarting}>
          {isStarting ? "Starting scan…" : "Start scan"}
        </button>
      </div>
    </StateSurface>
  );
}

export function ScanInProgress({ repositoryName, ref, startedAt, status }: ScanInProgressProps) {
  const statusText = "Scan in progress";

  return (
    <StateSurface
      role="status"
      title={statusText}
      description={`Comment Lens is reading ${repositoryName} at ${ref}. This read-only scan creates the review queue when processing finishes.`}
    >
      <p className="cl-state-note">
        {startedAt ? `Started ${startedAt}. This page checks for updates automatically.` : "This page checks for updates automatically."}
      </p>
    </StateSurface>
  );
}

export function ScanFailed({ failureSummary, isRetrying = false, onRetry, repositoryName }: ScanFailedProps) {
  return (
    <StateSurface
      role="alert"
      title="Scan failed"
      description={`Comment Lens could not complete the scan for ${repositoryName}. No incomplete review queue is shown.`}
    >
      <div className="cl-state-action">
        {failureSummary ? <p className="cl-state-error">{failureSummary}</p> : null}
        <button className="cl-button cl-button-primary" type="button" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? "Starting scan…" : "Retry scan"}
        </button>
      </div>
    </StateSurface>
  );
}
