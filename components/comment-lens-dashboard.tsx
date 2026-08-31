"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { CommentKind, CommentRecord, ReviewStatus } from "../contracts";

type Repo = { id: string; owner: string; name: string; defaultBranch: string; private: boolean };
type Decision = { commentId: string; status: ReviewStatus; note: string | null };
type Page = { items: CommentRecord[]; decisions: Decision[]; total: number; page: number; hasNextPage: boolean };
type Scan = {
  scanId: string;
  status: "queued" | "running" | "complete" | "failed";
  repository?: string;
  ref?: string;
  resolvedCommit?: string | null;
  commentCount?: number;
  fileCount?: number;
  chunkCount?: number;
  diagnostics?: unknown[];
  createdAt?: string;
  completedAt?: string | null;
};
type Assessment = {
  styleLabel: "ordinary" | "template_like" | "overexplained" | "uncertain" | "protected";
  confidence: number;
  reasons: string[];
};

const assessmentLabels: Record<Assessment["styleLabel"], string> = {
  ordinary: "Ordinary",
  template_like: "Template-like",
  overexplained: "Overexplained",
  uncertain: "Uncertain",
  protected: "Protected",
};
const labels: Record<ReviewStatus, string> = {
  unreviewed: "Unreviewed",
  keep: "Keep",
  rewrite: "Rewrite",
  delete: "Delete",
  unsure: "Unsure",
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body as T;
}

export function CommentLensDashboard() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repo, setRepo] = useState<Repo | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [data, setData] = useState<Page | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanHistory, setScanHistory] = useState<Scan[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ReviewStatus | "all">("all");
  const [language, setLanguage] = useState("all");
  const [kind, setKind] = useState<CommentKind | "all">("all");
  const [pathFilter, setPathFilter] = useState("");
  const [author, setAuthor] = useState("");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [protectedFlag, setProtectedFlag] = useState("all");
  const [generatedFlag, setGeneratedFlag] = useState("all");
  const [licenseFlag, setLicenseFlag] = useState("all");
  const [todoFlag, setTodoFlag] = useState("all");
  const [sort, setSort] = useState("score");
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState<"filters" | "detail" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    api<{ repositories: Repo[] }>("/api/repositories")
      .then((result) => {
        setRepos(result.repositories);
        setRepo(result.repositories[0] ?? null);
        setError("");
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load repositories."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!repo) return;
    let active = true;
    setScan(null);
    setData(null);
    setSelectedId(null);
    setAssessment(null);

    api<{ scans: Scan[] }>(`/api/scans?schemaVersion=1&repositoryId=${encodeURIComponent(repo.id)}`)
      .then((result) => {
        if (!active) return;
        setScanHistory(result.scans);
        setScan(result.scans[0] ?? null);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load scan history.");
      });

    return () => {
      active = false;
    };
  }, [repo]);

  useEffect(() => {
    if (!scan || scan.status === "complete" || scan.status === "failed") return;
    const timer = window.setInterval(() => {
      api<Scan>(`/api/scans/${scan.scanId}`).then(setScan).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [scan]);

  useEffect(() => {
    if (!scan || scan.status !== "complete") return;
    const params = new URLSearchParams({
      schemaVersion: "1",
      scanId: scan.scanId,
      page: String(page),
      pageSize: "50",
      sort,
    });
    if (query) params.set("q", query);
    if (status !== "all") params.set("status", status);
    if (language !== "all") params.set("language", language);
    if (kind !== "all") params.set("kind", kind);
    if (pathFilter) params.set("path", pathFilter);
    if (author) params.set("author", author);
    if (minScore) params.set("minScore", minScore);
    if (maxScore) params.set("maxScore", maxScore);
    for (const [key, value] of [["protected", protectedFlag], ["generated", generatedFlag], ["license", licenseFlag], ["todo", todoFlag]]) {
      if (value !== "all") params.set(key, value);
    }

    setLoading(true);
    api<Page>(`/api/scans/${scan.scanId}/comments?${params}`)
      .then((result) => {
        setData(result);
        setSelectedId((current) => result.items.some((item) => item.commentId === current) ? current : result.items[0]?.commentId ?? null);
        setAssessment(null);
        setError("");
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load comments."))
      .finally(() => setLoading(false));
  }, [scan, page, query, status, language, kind, pathFilter, author, minScore, maxScore, protectedFlag, generatedFlag, licenseFlag, todoFlag, sort]);

  useEffect(() => {
    setPage(1);
  }, [query, status, language, kind, pathFilter, author, minScore, maxScore, protectedFlag, generatedFlag, licenseFlag, todoFlag, sort]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("input,textarea,select") || target.isContentEditable)) return;
      if (event.key === "/" && scan?.status === "complete") {
        event.preventDefault();
        setPanel("filters");
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }
      if (event.key === "Escape") {
        setPanel(null);
        triggerRef.current?.focus();
      }
      if ((event.key === "j" || event.key === "k") && data?.items.length) {
        const index = data.items.findIndex((item) => item.commentId === selectedId);
        const next = Math.max(0, Math.min(data.items.length - 1, index + (event.key === "j" ? 1 : -1)));
        setSelectedId(data.items[next].commentId);
        setAssessment(null);
        setPanel("detail");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [data, scan?.status, selectedId]);

  const selected = data?.items.find((item) => item.commentId === selectedId) ?? null;
  const decision = data?.decisions.find((item) => item.commentId === selected?.commentId);
  const languages = [...new Set(data?.items.map((item) => item.language) ?? [])];
  const unauthenticated = error === "Authentication required";
  const hasCompleteScan = scan?.status === "complete";

  const startScan = async () => {
    if (!repo) return;
    try {
      const result = await api<Scan>("/api/scans", {
        method: "POST",
        body: JSON.stringify({ schemaVersion: 1, repositoryId: repo.id, ref: repo.defaultBranch }),
      });
      setScan(result);
      setScanHistory((current) => [result, ...current.filter((item) => item.scanId !== result.scanId)]);
      setData(null);
      setAssessment(null);
      setError("");
      setNotice("Scan queued.");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not start scan.");
    }
  };

  const review = async (next: Exclude<ReviewStatus, "unreviewed">, note: string | null) => {
    if (!selected) return;
    try {
      await api(`/api/comments/${selected.commentId}/review`, { method: "PATCH", body: JSON.stringify({ schemaVersion: 1, status: next, note }) });
      setNotice(`Marked ${selected.path} as ${labels[next]}.`);
      if (scan) setScan({ ...scan });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not save review.");
    }
  };

  const assess = async () => {
    if (!selected || !scan) return;
    try {
      const result = await api<{ assessment: Assessment }>(`/api/comments/${selected.commentId}/assessment`, {
        method: "POST",
        body: JSON.stringify({ schemaVersion: 1, scanId: scan.scanId, sourceContext: "comment_and_code" }),
      });
      setAssessment(result.assessment);
      setNotice("Assessment loaded. The deterministic score was not changed.");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Assessment unavailable.");
    }
  };

  const reset = () => {
    setQuery(""); setStatus("all"); setLanguage("all"); setKind("all"); setPathFilter(""); setAuthor("");
    setMinScore(""); setMaxScore(""); setProtectedFlag("all"); setGeneratedFlag("all"); setLicenseFlag("all"); setTodoFlag("all");
  };

  if (loading && !repos.length && !error) {
    return <main className="shell"><section className="loading-card" aria-busy="true" aria-label="Loading Comment Lens"><h1>Loading Comment Lens</h1><span className="loading-line loading-line-wide" /><span className="loading-line" /></section></main>;
  }

  return (
    <main className="shell">
      <a className="skip-link" href="#main-content">Skip to workspace</a>
      <header className="topbar">
        <a className="brand" href="#main-content" aria-label="Comment Lens home"><span className="brand-mark" aria-hidden="true">CL</span><span>Comment Lens</span></a>
        <span className="account">Private review workspace</span>
      </header>
      <section className="workspace-header" aria-labelledby="page-title">
        <div>
          <h1 id="page-title">Review code comments</h1>
          <p className="lede">Find comments worth a second look. Scores describe writing patterns, not authorship.</p>
          {repo && <p className="repository-context">Repository: {repo.owner}/{repo.name}</p>}
        </div>
        {repo && <div className="header-actions">
          <button className="button button-secondary" type="button" disabled={!hasCompleteScan} onClick={() => scan && window.location.assign(`/api/scans/${scan.scanId}/export`)}>Export decisions</button>
          <button className="button button-primary" type="button" disabled={scan?.status === "running" || scan?.status === "queued"} onClick={startScan}>{scan?.status === "running" ? "Scanning…" : scan?.status === "failed" ? "Run another scan" : "Run scan"}</button>
        </div>}
      </section>
      <div id="main-content" tabIndex={-1}>
        {!repo ? <SetupPanel unauthenticated={unauthenticated} error={error} /> : <>
          <div className="repo-tabs" role="tablist" aria-label="Repositories">
            {repos.map((item) => <button className={`repo-tab ${item.id === repo.id ? "active" : ""}`} role="tab" aria-selected={item.id === repo.id} type="button" key={item.id} onClick={() => setRepo(item)}>{item.name}<small>{item.private ? "Private" : "Public"}</small></button>)}
          </div>
          <div className="scan-history">
            <label htmlFor="scan-history">Recent scans</label>
            <select id="scan-history" value={scan?.scanId ?? ""} onChange={(event) => {
              const next = scanHistory.find((item) => item.scanId === event.target.value) ?? null;
              setScan(next); setData(null); setSelectedId(null); setAssessment(null);
            }}>
              <option value="">No scan selected</option>
              {scanHistory.map((item) => <option value={item.scanId} key={item.scanId}>{item.status} {item.resolvedCommit?.slice(0, 7) ?? item.ref} {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}</option>)}
            </select>
          </div>
          {!scan && <ScanStarter repo={repo} onStart={startScan} />}
          {scan && !hasCompleteScan && <section className={`scan-state ${scan.status === "failed" ? "scan-state-failed" : ""}`} role={scan.status === "failed" ? "alert" : "status"} aria-live={scan.status === "failed" ? undefined : "polite"}>
            <div><h2>{scan.status === "failed" ? "This scan did not finish" : `Scanning ${repo.name}`}</h2><p>{scan.status === "failed" ? "The worker reported a failure. You can start another scan when the repository is ready." : "The queue will be ready when the read-only scan finishes."}</p></div>
            {scan.status === "failed" && <button className="button button-primary" type="button" onClick={startScan}>Run another scan</button>}
          </section>}
          {hasCompleteScan && <>
            {error && <div className="error-banner" role="alert"><strong>Unable to update the queue.</strong><span>{error}</span></div>}
            <section className="stats" aria-label="Scan summary">
              <div><strong>{data?.total ?? scan.commentCount ?? 0}</strong><span>Comments found</span></div>
              <div><strong>{data?.items.filter((item) => (item.score.priorityScore ?? 0) >= 40).length ?? 0}</strong><span>Need review</span></div>
              <div><strong>{data?.decisions.length ?? 0}</strong><span>Reviewed on page</span></div>
              <div><strong>{scan.diagnostics?.length ?? 0}</strong><span>Parse warnings</span></div>
            </section>
            <div className="mobile-controls">
              <button ref={triggerRef} className="button button-secondary" type="button" onClick={() => setPanel("filters")}>Filters</button>
              <button className="button button-secondary" type="button" disabled={!selected} onClick={() => setPanel("detail")}>Open detail</button>
            </div>
            <div className={`dashboard-grid ${selected ? "has-detail" : ""}`}>
              <Filters
                panel={panel} close={() => setPanel(null)} searchRef={searchRef} query={query} setQuery={setQuery}
                pathFilter={pathFilter} setPathFilter={setPathFilter} author={author} setAuthor={setAuthor}
                minScore={minScore} setMinScore={setMinScore} maxScore={maxScore} setMaxScore={setMaxScore}
                status={status} setStatus={setStatus} language={language} setLanguage={setLanguage} languages={languages}
                kind={kind} setKind={setKind} protectedFlag={protectedFlag} setProtectedFlag={setProtectedFlag}
                generatedFlag={generatedFlag} setGeneratedFlag={setGeneratedFlag} licenseFlag={licenseFlag} setLicenseFlag={setLicenseFlag}
                todoFlag={todoFlag} setTodoFlag={setTodoFlag} reset={reset}
              />
              <section className="queue-panel" aria-labelledby="queue-title">
                <div className="queue-heading"><div><h2 id="queue-title">Review queue</h2><p>{data ? `${data.total} comments match your filters` : "Loading comments…"}</p></div><select aria-label="Sort comments" value={sort} onChange={(event) => setSort(event.target.value)}><option value="score">Highest priority</option><option value="path">File and line</option><option value="age">Newest first</option><option value="status">Review state</option></select></div>
                {data?.items.length ? <div className="comment-list" role="list">{data.items.map((item) => <CommentRow key={item.commentId} comment={item} selected={item.commentId === selectedId} decision={data.decisions.find((entry) => entry.commentId === item.commentId)} onSelect={() => { setSelectedId(item.commentId); setAssessment(null); setPanel("detail"); }} />)}</div> : <div className="empty-inline"><h3>{loading ? "Loading the review queue" : "No comments match these filters."}</h3><p>{loading ? "The latest page of comments is being prepared." : "Try clearing a filter or searching for another phrase."}</p></div>}
                <nav className="pagination" aria-label="Queue pages"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page}</span><button type="button" disabled={!data?.hasNextPage} onClick={() => setPage((value) => value + 1)}>Next</button></nav>
              </section>
              {selected && <Detail comment={selected} decision={decision} assessment={assessment} panel={panel} onClose={() => setPanel(null)} onAssess={assess} onReview={review} />}
            </div>
          </>}
        </>}
      </div>
      <p className="privacy-note">Source files are read-only. Comment Lens retains comments and short context, not complete source files.</p>
      <div className="sr-only" aria-live="polite">{notice}</div>
    </main>
  );
}

function SetupPanel({ unauthenticated, error }: { unauthenticated: boolean; error: string }) {
  const title = unauthenticated ? "Connect GitHub to start" : "No repositories are available";
  const message = unauthenticated
    ? "Comment Lens reads only the repositories you grant to its GitHub App. It never changes repository files."
    : "Install the Comment Lens GitHub App on a repository, then refresh this page to choose it here.";
  return <section className="setup-panel" aria-labelledby="setup-title">
    <div className="setup-copy"><h2 id="setup-title">{title}</h2><p>{message}</p></div>
    {unauthenticated ? <a className="button button-primary" href="/api/auth/github">Connect GitHub</a> : <button className="button button-secondary" type="button" onClick={() => window.location.reload()}>Refresh repositories</button>}
    {!unauthenticated && error && <p className="setup-error" role="alert">{error}</p>}
    <ol className="setup-steps"><li>Connect your GitHub account.</li><li>Choose a repository the GitHub App can read.</li><li>Run a scan to create a comment review queue.</li></ol>
  </section>;
}

function ScanStarter({ repo, onStart }: { repo: Repo; onStart: () => void }) {
  return <section className="scan-starter" aria-labelledby="scan-starter-title"><div><h2 id="scan-starter-title">Ready to scan {repo.name}</h2><p>The scan reads tracked files on {repo.defaultBranch}. It retains comments and short context, not complete source files.</p></div><button className="button button-primary" type="button" onClick={onStart}>Start scan</button></section>;
}

type FiltersProps = {
  panel: "filters" | "detail" | null; close: () => void; searchRef: RefObject<HTMLInputElement | null>; query: string; setQuery: (value: string) => void; pathFilter: string; setPathFilter: (value: string) => void; author: string; setAuthor: (value: string) => void; minScore: string; setMinScore: (value: string) => void; maxScore: string; setMaxScore: (value: string) => void; status: ReviewStatus | "all"; setStatus: (value: ReviewStatus | "all") => void; language: string; setLanguage: (value: string) => void; languages: string[]; kind: CommentKind | "all"; setKind: (value: CommentKind | "all") => void; protectedFlag: string; setProtectedFlag: (value: string) => void; generatedFlag: string; setGeneratedFlag: (value: string) => void; licenseFlag: string; setLicenseFlag: (value: string) => void; todoFlag: string; setTodoFlag: (value: string) => void; reset: () => void;
};

function Filters(props: FiltersProps) {
  return <aside className={`filters-panel ${props.panel === "filters" ? "mobile-open" : ""}`} aria-label="Comment filters">
    <div className="panel-heading"><h2>Filter queue</h2><button className="close-button" type="button" onClick={props.close} aria-label="Close filters">×</button></div>
    <label className="field-label" htmlFor="comment-search">Search comments</label><div className="search-field"><span aria-hidden="true">⌕</span><input ref={props.searchRef} id="comment-search" value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="Search text, path, symbol" /><kbd>/</kbd></div>
    <label className="field-label" htmlFor="path-filter">Path contains</label><input id="path-filter" value={props.pathFilter} onChange={(event) => props.setPathFilter(event.target.value)} placeholder="src/" />
    <label className="field-label" htmlFor="author-filter">Author</label><input id="author-filter" value={props.author} onChange={(event) => props.setAuthor(event.target.value)} placeholder="Name or email" />
    <div className="score-fields"><div><label className="field-label" htmlFor="min-score">Minimum score</label><input id="min-score" type="number" min="0" max="100" value={props.minScore} onChange={(event) => props.setMinScore(event.target.value)} /></div><div><label className="field-label" htmlFor="max-score">Maximum score</label><input id="max-score" type="number" min="0" max="100" value={props.maxScore} onChange={(event) => props.setMaxScore(event.target.value)} /></div></div>
    <label className="field-label" htmlFor="status-filter">Review status</label><select id="status-filter" value={props.status} onChange={(event) => props.setStatus(event.target.value as ReviewStatus | "all")}><option value="all">All statuses</option>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
    <label className="field-label" htmlFor="language-filter">Language</label><select id="language-filter" value={props.language} onChange={(event) => props.setLanguage(event.target.value)}><option value="all">All languages</option>{props.languages.map((item) => <option key={item}>{item}</option>)}</select>
    <label className="field-label" htmlFor="kind-filter">Comment type</label><select id="kind-filter" value={props.kind} onChange={(event) => props.setKind(event.target.value as CommentKind | "all")}><option value="all">All types</option><option value="line">Line</option><option value="block">Block</option><option value="doc_line">Documentation</option></select>
    <div className="flag-filters"><FlagFilter id="protected-filter" label="Protected comments" value={props.protectedFlag} onChange={props.setProtectedFlag} trueLabel="Protected only" falseLabel="Unprotected only" /><FlagFilter id="generated-filter" label="Generated comments" value={props.generatedFlag} onChange={props.setGeneratedFlag} trueLabel="Generated only" falseLabel="Non-generated only" /><FlagFilter id="license-filter" label="License comments" value={props.licenseFlag} onChange={props.setLicenseFlag} trueLabel="License only" falseLabel="Non-license only" /><FlagFilter id="todo-filter" label="TODO/FIXME-only" value={props.todoFlag} onChange={props.setTodoFlag} trueLabel="TODO/FIXME only" falseLabel="Other comments" /></div>
    <button className="text-button" type="button" onClick={props.reset}>Clear all filters</button>
  </aside>;
}

function FlagFilter({ id, label, value, onChange, trueLabel, falseLabel }: { id: string; label: string; value: string; onChange: (value: string) => void; trueLabel: string; falseLabel: string }) {
  return <><label className="field-label" htmlFor={id}>{label}</label><select id={id} value={value} onChange={(event) => onChange(event.target.value)}><option value="all">All</option><option value="true">{trueLabel}</option><option value="false">{falseLabel}</option></select></>;
}

function CommentRow({ comment, selected, decision, onSelect }: { comment: CommentRecord; selected: boolean; decision?: Decision; onSelect: () => void }) {
  const score = comment.score.priorityScore;
  const state = decision?.status ?? "unreviewed";
  return <div role="listitem"><button className={`comment-row ${selected ? "selected" : ""}`} type="button" aria-pressed={selected} onClick={onSelect}><div className="row-top"><span className="file-path">{comment.path}</span><span className="score score-review">{score === null ? "Protected" : score}</span></div><p>{comment.bodyText}</p><div className="row-bottom"><span>{comment.language}</span><span>Line {comment.rawSpan.start.line0 + 1}</span><span className="review-state">{labels[state]}</span></div></button></div>;
}

function Detail({ comment, decision, assessment, panel, onClose, onAssess, onReview }: { comment: CommentRecord; decision?: Decision; assessment: Assessment | null; panel: "filters" | "detail" | null; onClose: () => void; onAssess: () => void; onReview: (status: Exclude<ReviewStatus, "unreviewed">, note: string | null) => void }) {
  const [note, setNote] = useState(decision?.note ?? "");
  const start = comment.rawSpan.start.line0 + 1;
  const lines = (comment.sourceContext ?? comment.bodyText).split("\n");
  return <aside className={`detail-panel ${panel === "detail" ? "mobile-open" : ""}`} aria-label="Comment detail">
    <div className="panel-heading"><div><h2>Comment detail</h2></div><button className="close-button" type="button" onClick={onClose} aria-label="Close detail">×</button></div>
    <div className="detail-path"><span>{comment.path}</span><strong>Line {start}</strong></div>
    <div className="code-context" aria-label={`Source context around line ${start}`}>{lines.map((line, index) => <div className={`code-line ${index === 0 ? "active-line" : ""}`} key={`${index}-${line}`}><span>{start + index}</span><code>{line}</code></div>)}</div>
    <div className="detail-meta"><div><span>Language</span><strong>{comment.language}</strong></div><div><span>Kind</span><strong>{comment.kind}</strong></div><div><span>Symbol</span><strong>{comment.symbol?.enclosing?.name ?? "File-level"}</strong></div><div><span>Commit</span><strong>{comment.git.primaryCommit ?? "Unavailable"}</strong></div></div>
    <div className="score-block"><div className="score-heading"><span>Priority score</span><strong>{comment.score.priorityScore === null ? "Protected" : `${comment.score.priorityScore}/100`}</strong></div>{comment.score.priorityScore !== null && <div className="score-meter"><span style={{ width: `${comment.score.priorityScore}%` }} /></div>}<p>{comment.score.eligible ? "This score prioritizes comments for human review." : "This comment is protected from style scoring."}</p></div>
    {comment.score.findings.length > 0 && <div className="findings"><h3>Why this was flagged</h3>{comment.score.findings.map((finding) => <div className="finding" key={finding.ruleId}><strong>{finding.ruleId.replaceAll("_", " ")}</strong><span>+{finding.contribution}</span><p>{finding.explanation}</p></div>)}</div>}
    <div className="assessment"><div><h3>Gemini assessment</h3><p>Optional, on-demand review using this comment and its short context only.</p></div><button className="button button-secondary" type="button" onClick={onAssess}>Assess style</button>{assessment && <p className="assessment-result" role="status"><strong>{assessmentLabels[assessment.styleLabel]}, {Math.round(assessment.confidence * 100)}% confidence.</strong> {assessment.reasons.join(" ")}</p>}</div>
    <div className="review-actions"><span>Review decision</span><div>{(["keep", "rewrite", "delete", "unsure"] as const).map((item) => <button type="button" className={decision?.status === item ? "selected-action" : ""} key={item} onClick={() => onReview(item, note || null)}>{labels[item]}</button>)}</div><label className="field-label" htmlFor="review-note">Private note</label><textarea id="review-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add context for your future self" rows={3} /></div>
  </aside>;
}
