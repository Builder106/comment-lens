"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type {
  CommentPageResponse, CommentRecord, FindingAssistance, GeminiAssessmentOutput,
  RepositoryRef, ReviewDecision, ReviewMutationStatus, ReviewStatus, ScanRecord,
} from "../contracts";

type View = "review" | "history";
type Sort = "score" | "path" | "age" | "status";
type Filters = { q: string; status: ReviewStatus | "all"; sort: Sort; path: string; author: string; language: string; kind: string; minScore: string; maxScore: string; protected: string; generated: string; license: string; todo: string };
type HistorySummary = { historySummaryVersion: 1; repositories: string[]; scans: number; currentFindings: number; coverage: Record<string, "full" | "partial">; repeatedFindings: unknown[]; trends: { repository: string; scanId: string; source: string; coverage: string; findings: number | null; newSincePrevious: number | null; resolvedSincePrevious: number | null }[] };

const initialFilters: Filters = { q: "", status: "all", sort: "score", path: "", author: "", language: "", kind: "", minScore: "", maxScore: "", protected: "", generated: "", license: "", todo: "" };
const decisions: ReviewMutationStatus[] = ["keep", "rewrite", "delete", "unsure"];
const siteDocs = "https://github.com/Builder106/comment-lens#local-comment-checks";

function readableError(value: unknown): string {
  return value instanceof Error ? value.message : "Something went wrong. Try again.";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body && typeof body === "object" && "error" in body ? (body as { error?: { message?: string } }).error : null;
    throw new Error(error?.message || `Request failed (${response.status}).`);
  }
  return body as T;
}

function time(value: string | null): string {
  if (!value) return "Not finished";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function shortCommit(value: string | null): string {
  return value ? value.slice(0, 8) : "Pending";
}

function line(comment: CommentRecord): number {
  return comment.rawSpan.start.line0 + 1;
}

function priority(comment: CommentRecord): string {
  if (!comment.score.eligible || comment.score.band === "protected") return "Protected";
  return comment.score.priorityScore === null ? "Unscored" : `${Math.round(comment.score.priorityScore)} / 100`;
}

function validateSummary(value: unknown): value is HistorySummary {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<HistorySummary>;
  return data.historySummaryVersion === 1
    && Array.isArray(data.repositories) && data.repositories.every((item) => typeof item === "string")
    && typeof data.scans === "number" && Number.isFinite(data.scans)
    && typeof data.currentFindings === "number" && Number.isFinite(data.currentFindings)
    && Array.isArray(data.repeatedFindings)
    && Boolean(data.coverage) && typeof data.coverage === "object" && !Array.isArray(data.coverage)
    && Array.isArray(data.trends) && data.trends.every((item) => item && typeof item.repository === "string" && typeof item.scanId === "string" && typeof item.source === "string" && typeof item.coverage === "string" && (item.findings === null || typeof item.findings === "number") && (item.newSincePrevious === null || typeof item.newSincePrevious === "number") && (item.resolvedSincePrevious === null || typeof item.resolvedSincePrevious === "number"));
}

export function ReviewWorkspace() {
  const [repositories, setRepositories] = useState<RepositoryRef[]>([]);
  const [repositoryId, setRepositoryId] = useState("");
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [scanId, setScanId] = useState("");
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [page, setPage] = useState<CommentPageResponse | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<View>("review");
  const [detailOpen, setDetailOpen] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingScans, setLoadingScans] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [decisionDraft, setDecisionDraft] = useState<ReviewMutationStatus | "">("");
  const [noteDraft, setNoteDraft] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  const [ruleId, setRuleId] = useState("");
  const [includeCode, setIncludeCode] = useState(false);
  const [assistance, setAssistance] = useState<FindingAssistance | null>(null);
  const [assessment, setAssessment] = useState<GeminiAssessmentOutput | null>(null);
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const repository = repositories.find((item) => item.id === repositoryId) ?? null;
  const selected = page?.items.find((item) => item.commentId === selectedId) ?? page?.items[0] ?? null;
  const currentDecision = page?.decisions.find((item) => item.commentId === selected?.commentId) ?? null;

  useEffect(() => {
    let live = true;
    api<{ repositories: RepositoryRef[] }>("/api/repositories").then((result) => {
      if (!live) return;
      setRepositories(result.repositories);
      setRepositoryId(result.repositories[0]?.id ?? "");
    }).catch((cause: unknown) => {
      if (!live) return;
      if (readableError(cause) === "Authentication required") setSignedOut(true);
      else setError(readableError(cause));
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!repositoryId) { setScans([]); setScanId(""); return; }
    let live = true;
    setLoadingScans(true);
    setScans([]);
    setScanId("");
    setScan(null);
    setPage(null);
    setSelectedId("");
    api<{ scans: ScanRecord[] }>(`/api/scans?repositoryId=${encodeURIComponent(repositoryId)}&limit=50`).then((result) => {
      if (!live) return;
      setScans(result.scans);
      setScanId(result.scans[0]?.scanId ?? "");
      setError("");
    }).catch((cause: unknown) => { if (live) setError(readableError(cause)); }).finally(() => { if (live) setLoadingScans(false); });
    return () => { live = false; };
  }, [repositoryId]);

  useEffect(() => {
    if (!scanId) { setScan(null); return; }
    let live = true;
    let timer: number | undefined;
    setPage(null);
    setSelectedId("");
    setDetailOpen(false);
    const refresh = () => {
      api<ScanRecord>(`/api/scans/${encodeURIComponent(scanId)}`).then((result) => {
        if (!live) return;
        setScan(result);
        setScans((current) => current.map((item) => item.scanId === result.scanId ? result : item));
        if (result.status === "complete" || result.status === "failed") window.clearInterval(timer);
      }).catch((cause: unknown) => { if (live) setError(readableError(cause)); });
    };
    const current = scans.find((item) => item.scanId === scanId) ?? null;
    setScan(current);
    refresh();
    if (!current || current.status === "queued" || current.status === "running") timer = window.setInterval(refresh, 6000);
    return () => { live = false; window.clearInterval(timer); };
  }, [scanId]);

  const loadComments = useCallback(async (signal?: AbortSignal) => {
    if (!scanId || scan?.status !== "complete") return;
    const params = new URLSearchParams({ page: String(pageNumber), pageSize: "50", sort: filters.sort });
    if (filters.q) params.set("q", filters.q);
    if (filters.status !== "all") params.set("status", filters.status);
    for (const key of ["path", "author", "language", "kind", "minScore", "maxScore", "protected", "generated", "license", "todo"] as const) {
      if (filters[key]) params.set(key, filters[key]);
    }
    setLoadingPage(true);
    try {
      const result = await api<CommentPageResponse>(`/api/scans/${encodeURIComponent(scanId)}/comments?${params}`, { signal });
      if (signal?.aborted) return;
      setPage(result);
      setSelectedId((current) => result.items.some((item) => item.commentId === current) ? current : result.items[0]?.commentId ?? "");
      setError("");
    } catch (cause) {
      if (!signal?.aborted) setError(readableError(cause));
    } finally {
      if (!signal?.aborted) setLoadingPage(false);
    }
  }, [scanId, scan?.status, pageNumber, filters]);

  useEffect(() => {
    if (scan?.status !== "complete") { setPage(null); return; }
    const controller = new AbortController();
    void loadComments(controller.signal);
    return () => controller.abort();
  }, [scan?.status, loadComments]);

  useEffect(() => {
    setDecisionDraft(currentDecision?.status === "unreviewed" ? "" : currentDecision?.status ?? "");
    setNoteDraft(currentDecision?.note ?? "");
    setAssistance(null);
    setAssessment(null);
    setRuleId(selected?.score.findings[0]?.ruleId ?? "");
    setIncludeCode(false);
    setAssistOpen(false);
  }, [selected?.commentId, currentDecision?.status, currentDecision?.note]);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPageNumber(1);
    setFilters((current) => ({ ...current, q: search.trim() }));
  }

  function changeFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setPageNumber(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function startScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repository) return;
    const data = new FormData(event.currentTarget);
    const ref = String(data.get("ref") ?? "").trim();
    if (!ref) return;
    setBusy("scan"); setError("");
    try {
      const result = await api<{ scanId: string }>("/api/scans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ schemaVersion: 1, repositoryId: repository.id, ref }) });
      const next = await api<ScanRecord>(`/api/scans/${encodeURIComponent(result.scanId)}`);
      setScans((current) => [next, ...current]);
      setScanId(result.scanId);
      setView("review");
      setNotice("Scan started. The queue will appear when processing finishes.");
    } catch (cause) { setError(readableError(cause)); }
    finally { setBusy(""); }
  }

  function openComment(commentId: string) {
    setSelectedId(commentId);
    setDetailOpen(true);
    if (window.matchMedia("(max-width: 760px)").matches) window.requestAnimationFrame(() => detailRef.current?.focus());
  }

  function closeDetail() {
    setDetailOpen(false);
    rowRefs.current[selectedId]?.focus();
  }

  async function saveDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !decisionDraft) return;
    setBusy("decision"); setError("");
    try {
      const result = await api<{ decision: ReviewDecision }>(`/api/comments/${encodeURIComponent(selected.commentId)}/review`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ schemaVersion: 1, status: decisionDraft, note: noteDraft.trim() || null }) });
      setPage((current) => current ? { ...current, decisions: [...current.decisions.filter((item) => item.commentId !== result.decision.commentId), result.decision] } : current);
      setNotice(`${decisionDraft[0].toUpperCase()}${decisionDraft.slice(1)} decision saved.`);
      if (filters.status !== "all" && filters.status !== decisionDraft) {
        setDetailOpen(false);
        await loadComments();
      }
    } catch (cause) { setError(readableError(cause)); }
    finally { setBusy(""); }
  }

  async function requestAssistance() {
    if (!selected || !scanId || !ruleId) return;
    setBusy("assist"); setError(""); setAssistance(null);
    try {
      const result = await api<{ assistance: FindingAssistance }>(`/api/comments/${encodeURIComponent(selected.commentId)}/assist`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ schemaVersion: 1, scanId, ruleId, includeCodeContext: includeCode }) });
      setAssistance(result.assistance);
      setNotice("Optional guidance is ready.");
    } catch (cause) { setError(readableError(cause)); }
    finally { setBusy(""); }
  }

  async function requestAssessment() {
    if (!selected || !scanId) return;
    setBusy("assessment"); setError(""); setAssessment(null);
    try {
      const result = await api<{ assessment: GeminiAssessmentOutput }>(`/api/comments/${encodeURIComponent(selected.commentId)}/assessment`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ schemaVersion: 1, scanId, sourceContext: includeCode ? "comment_and_code" : "comment_only" }) });
      setAssessment(result.assessment);
      setNotice("Style assessment is ready.");
    } catch (cause) { setError(readableError(cause)); }
    finally { setBusy(""); }
  }

  async function importHistory(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      if (!validateSummary(value)) throw new Error("Choose a Comment Lens history summary JSON file.");
      setSummary(value);
      setNotice("Local history summary opened in this browser tab.");
      setError("");
    } catch (cause) { setError(readableError(cause)); }
    event.target.value = "";
  }

  return <>
    <a className="skip-link" href="#main">Skip to workspace</a>
    <div className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Comment Lens home"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span>Comment<span className="wordmark-light">Lens</span></span></a>
        <nav aria-label="Primary"><a href={siteDocs} target="_blank" rel="noreferrer">Documentation <span aria-hidden="true">↗</span></a><a href="https://github.com/Builder106/comment-lens" target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a></nav>
      </header>
      <main id="main" tabIndex={-1}>
        <div className="page-heading"><div><h1>Review workspace<span className="heading-period">.</span></h1></div><p>Find the comments that deserve attention. Read the evidence. Make the call.</p></div>
        {notice && <p className="notice" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss notice">×</button></p>}
        {error && <p className="error-banner" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></p>}
        {loading ? <div className="state-panel"><p>Loading your workspace…</p></div> : signedOut ? <div className="welcome-layout"><div className="welcome-copy"><h2>Start with a repository you maintain.</h2><p>Comment Lens scans repository files, keeps comments with short source context for 30 days, and puts each finding beside the code that explains it.</p><a className="primary-button" href="/api/auth/github">Connect with GitHub <span aria-hidden="true">↗</span></a><p className="fine-print">Access is limited to repositories available to the installed GitHub App. A review decision does not change repository files.</p></div><div className="welcome-process" aria-label="Review process"><div><span>01</span><strong>Choose a scan</strong><p>Stay anchored to one repository and ref.</p></div><div><span>02</span><strong>Inspect evidence</strong><p>See the comment, source, and deterministic rules together.</p></div><div><span>03</span><strong>Record a decision</strong><p>Keep, rewrite, delete, or mark unsure. Export when ready.</p></div></div></div> : <>
          <section className="source-bar" aria-labelledby="source-heading"><div className="source-heading"><div><h2 id="source-heading">Repository & scan</h2></div><span className="source-status">{scan ? scan.status : repository ? "Ready to scan" : "No repository"}</span></div><div className="source-controls"><label>Repository<select value={repositoryId} onChange={(event) => setRepositoryId(event.target.value)} disabled={!repositories.length}>{repositories.length ? repositories.map((item) => <option key={item.id} value={item.id}>{item.owner}/{item.name}</option>) : <option value="">No repositories available</option>}</select></label><label>Scan<select value={scanId} onChange={(event) => { setScanId(event.target.value); setDetailOpen(false); }} disabled={!scans.length}>{scans.length ? scans.map((item) => <option key={item.scanId} value={item.scanId}>{time(item.createdAt)} | {item.ref} | {item.status}</option>) : <option value="">No scans yet</option>}</select></label><form className="scan-form" onSubmit={startScan}><label>Ref<input name="ref" defaultValue={repository?.defaultBranch ?? "main"} key={repositoryId} maxLength={256} required disabled={!repository} /></label><button type="submit" disabled={!repository || busy === "scan"}>{busy === "scan" ? "Starting…" : "New scan"} <span aria-hidden="true">↗</span></button></form></div><div className="source-foot"><p>{scan ? <><strong>{scan.repository}</strong> <span>/</span> <code>{scan.ref}</code> <span>/</span> <code>{shortCommit(scan.resolvedCommit)}</code> <span>/</span> {scan.fileCount} files <span>/</span> {scan.commentCount} comments</> : repository ? "Choose a ref and start a scan. Repository files are read; comments and short context are retained for 30 days." : "Install the GitHub App for a repository, then refresh this page."}</p>{scan?.status === "complete" && <a className="text-action" href={`/api/scans/${encodeURIComponent(scan.scanId)}/export`}>Export review JSON <span aria-hidden="true">↓</span></a>}</div></section>
          <div className="workspace-tabs" role="group" aria-label="Workspace view"><button type="button" aria-pressed={view === "review"} onClick={() => setView("review")}>Review queue</button><button type="button" aria-pressed={view === "history"} onClick={() => setView("history")}>Maintenance history</button></div>
          {view === "history" ? <section className="history-view" aria-labelledby="history-heading"><div className="history-intro"><h2 id="history-heading">Look back with the source in view.</h2><p>Hosted scans count extracted comments. Local and CI history summaries count maintenance findings. Keep those measures separate.</p><label className="file-button">Open local history JSON<input type="file" accept=".json,application/json" onChange={importHistory} /></label><p className="fine-print">The selected file stays in this browser tab. It is not uploaded.</p></div><div className="history-content"><h3>Hosted scans</h3>{loadingScans ? <p>Loading scans…</p> : scans.length ? <ol className="scan-history">{scans.map((item) => <li key={item.scanId}><button type="button" onClick={() => { setScanId(item.scanId); setView("review"); }}><span>{time(item.createdAt)}</span><strong>{item.status}</strong><code>{item.ref} | {shortCommit(item.resolvedCommit)}</code><small>{item.status === "complete" ? `${item.commentCount} comments` : item.status === "failed" ? "Incomplete; no resolution inferred" : "Processing"}</small></button></li>)}</ol> : <p>No hosted scans for this repository yet.</p>}{summary && <div className="import-summary"><h3>Local or CI summary</h3><p>{summary.scans} reports | {summary.currentFindings} current findings | {summary.repeatedFindings.length} repeated findings</p><p>Repository coverage: {Object.entries(summary.coverage).map(([name, coverage]) => `${name}: ${coverage}`).join(", ")}</p><div className="table-wrap"><table><caption>History from the opened JSON file</caption><thead><tr><th scope="col">Repository</th><th scope="col">Source</th><th scope="col">Coverage</th><th scope="col">Findings</th><th scope="col">New</th><th scope="col">Resolved</th></tr></thead><tbody>{summary.trends.map((item, index) => <tr key={`${item.scanId}-${index}`}><td>{item.repository}</td><td>{item.source}</td><td>{item.coverage}</td><td>{item.findings ?? "Not available"}</td><td>{item.newSincePrevious ?? "Not available"}</td><td>{item.resolvedSincePrevious ?? "Not available"}</td></tr>)}</tbody></table></div><p className="fine-print">Partial and failed reports cannot establish that a finding was resolved.</p></div>}</div></section> : !repository ? <div className="state-panel"><h2>No repository access yet</h2><p>Install the GitHub App for a repository and refresh this workspace.</p></div> : loadingScans ? <div className="state-panel"><p>Loading scans…</p></div> : !scan ? <div className="state-panel"><h2>Ready when you are.</h2><p>Start a scan above to collect comments from <strong>{repository.owner}/{repository.name}</strong>. Your review queue will appear here when it completes.</p></div> : scan.status !== "complete" ? <div className="state-panel"><h2>{scan.status === "failed" ? "This scan did not finish." : "Scanning the repository…"}</h2><p>{scan.status === "failed" ? "The incomplete scan cannot be used as a review queue. Start another scan when the issue is resolved." : "The queue will appear here after processing finishes. You can leave this page and return to the same scan."}</p>{scan.diagnostics.map((item, index) => <p key={index} className="diagnostic">{item.message ?? item.code}</p>)}</div> : <div className={`review-grid ${detailOpen ? "detail-open" : ""}`}>
            <section className="queue-panel" aria-labelledby="queue-heading"><div className="queue-heading"><div><h2 id="queue-heading">Review queue</h2></div><span>{page?.total ?? scan.commentCount} comments</span></div><form className="search-form" onSubmit={applySearch}><label className="visually-hidden" htmlFor="queue-search">Search comments and paths</label><input id="queue-search" type="search" value={search} maxLength={200} placeholder="Search comments or paths" onChange={(event) => setSearch(event.target.value)} /><button type="submit">Search</button></form><div className="queue-tools"><label>State<select value={filters.status} onChange={(event) => changeFilter("status", event.target.value as Filters["status"])}><option value="all">All states</option><option value="unreviewed">Unreviewed</option>{decisions.map((item) => <option key={item} value={item}>{item[0].toUpperCase()}{item.slice(1)}</option>)}</select></label><label>Sort<select value={filters.sort} onChange={(event) => changeFilter("sort", event.target.value as Sort)}><option value="score">Priority</option><option value="path">Path</option><option value="age">Newest</option><option value="status">Review state</option></select></label><button className="filter-toggle" type="button" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>More filters <span aria-hidden="true">{advanced ? "−" : "+"}</span></button></div>{advanced && <div className="advanced-filters"><label>Path<input value={filters.path} onChange={(event) => changeFilter("path", event.target.value)} placeholder="src/" /></label><label>Author<input value={filters.author} onChange={(event) => changeFilter("author", event.target.value)} /></label><label>Language<input value={filters.language} onChange={(event) => changeFilter("language", event.target.value)} /></label><label>Comment kind<select value={filters.kind} onChange={(event) => changeFilter("kind", event.target.value)}><option value="">Any</option>{["line", "block", "doc_line", "doc_block", "markup", "shebang", "preprocessor", "special", "unknown"].map((kind) => <option key={kind} value={kind}>{kind.replaceAll("_", " ")}</option>)}</select></label><label>Minimum score<input type="number" min="0" max="100" value={filters.minScore} onChange={(event) => changeFilter("minScore", event.target.value)} /></label><label>Maximum score<input type="number" min="0" max="100" value={filters.maxScore} onChange={(event) => changeFilter("maxScore", event.target.value)} /></label>{(["protected", "generated", "license", "todo"] as const).map((key) => <label key={key}>{key[0].toUpperCase()}{key.slice(1)}<select value={filters[key]} onChange={(event) => changeFilter(key, event.target.value)}><option value="">Any</option><option value="true">Yes</option><option value="false">No</option></select></label>)}<button type="button" onClick={() => { setFilters(initialFilters); setSearch(""); setPageNumber(1); }}>Clear filters</button></div>}<p className="queue-caption">Priority orders review. It is not a verdict.</p>{loadingPage && <p className="loading-inline" role="status">Loading comments…</p>}{page && page.items.length ? <ol className="comment-list">{page.items.map((item) => { const review = page.decisions.find((entry) => entry.commentId === item.commentId); const active = selected?.commentId === item.commentId; return <li key={item.commentId}><button ref={(node) => { rowRefs.current[item.commentId] = node; }} className={active ? "comment-row selected" : "comment-row"} type="button" aria-current={active ? "true" : undefined} onClick={() => openComment(item.commentId)}><span className="row-top"><code title={item.path}>{item.path}:{line(item)}</code><strong>{priority(item)}</strong></span><span className="row-text">{item.bodyText || item.rawText}</span><span className="row-bottom"><span>{item.score.findings[0]?.ruleId ?? (item.score.eligible ? "No triggered rule" : "Protected comment")}</span><span>{review?.status ?? "Unreviewed"}</span></span></button></li>; })}</ol> : page && !loadingPage ? <div className="queue-empty"><strong>{scan.commentCount === 0 ? "No comments in this scan." : "No comments match these filters."}</strong><p>{scan.commentCount === 0 ? "Try a different ref or repository." : "Clear filters or search for another path or phrase."}</p></div> : null}{page && page.total > page.pageSize && <div className="pagination"><button type="button" disabled={pageNumber <= 1} onClick={() => setPageNumber((value) => value - 1)}>Previous</button><span>Page {page.page} of {Math.ceil(page.total / page.pageSize)}</span><button type="button" disabled={!page.hasNextPage} onClick={() => setPageNumber((value) => value + 1)}>Next</button></div>}</section>
            <section className="detail-panel" ref={detailRef} tabIndex={-1} aria-labelledby="detail-heading"><div className="mobile-detail-head"><button type="button" onClick={closeDetail}>← Back to queue</button></div>{selected ? <><div className="detail-heading"><div><h2 id="detail-heading">The comment, in context.</h2></div><span className={`priority-label band-${selected.score.band}`}>{priority(selected)}</span></div><div className="location-line"><code>{selected.path}:{line(selected)}</code><span>{selected.language} | {selected.kind.replaceAll("_", " ")}</span></div><blockquote className="comment-quote">{selected.rawText}</blockquote><div className="source-block"><div className="block-heading"><h3>Source context</h3><span>{selected.parser} | {selected.placement.replaceAll("_", " ")}</span></div>{selected.sourceContext ? <pre><code>{selected.sourceContext}</code></pre> : <p>Short source context was not available for this comment.</p>}</div><div className="evidence-block"><div className="block-heading"><h3>Why it surfaced</h3><span>{selected.score.findings.length} {selected.score.findings.length === 1 ? "rule" : "rules"}</span></div>{!selected.score.eligible ? <p>This comment is protected by the scanner. It is shown for context, but no review priority is assigned.</p> : !selected.score.findings.length ? <p>No deterministic rule triggered. The score does not imply a problem with this comment.</p> : <ol className="finding-list">{selected.score.findings.map((finding) => <li key={finding.ruleId}><div className="finding-head"><code>{finding.ruleId}</code><span>+{finding.contribution} contribution</span></div><div className="evidence-trace" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(2, finding.contribution))}%` }} /></div><p>{finding.explanation}</p>{Object.keys(finding.evidence).length > 0 && <details><summary>Rule evidence</summary><dl>{Object.entries(finding.evidence).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{Array.isArray(value) ? value.join(", ") : String(value ?? "Unknown")}</dd></div>)}</dl></details>}</li>)}</ol>}<p className="fine-print">Rule set {selected.score.ruleSetVersion}. Priority helps order the queue; review the source before deciding.</p></div><div className="provenance"><h3>Provenance</h3><dl><div><dt>Symbol</dt><dd>{selected.symbol?.enclosing?.qualifiedName ?? selected.symbol?.attachedTo?.qualifiedName ?? "Not resolved"}</dd></div><div><dt>Git author</dt><dd>{selected.git.blameSpans[0]?.authorName ?? "Unavailable"}</dd></div><div><dt>Last change</dt><dd>{time(selected.git.blameSpans[0]?.authoredAt ?? null)}</dd></div></dl></div><form className="decision-form" onSubmit={saveDecision}><div className="block-heading"><h3>Make the call</h3><span>{currentDecision ? `Saved ${time(currentDecision.updatedAt)}` : "Not reviewed"}</span></div><p>Decisions and private notes stay in Comment Lens. They do not edit repository files.</p><fieldset><legend>Review decision</legend><div className="decision-options">{decisions.map((item) => <label key={item} className={decisionDraft === item ? "chosen" : ""}><input type="radio" name="decision" value={item} checked={decisionDraft === item} onChange={() => setDecisionDraft(item)} /><span>{item[0].toUpperCase()}{item.slice(1)}</span></label>)}</div></fieldset><label className="note-label" htmlFor="review-note">Private note <span>Optional</span></label><textarea id="review-note" maxLength={4000} rows={3} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="What should the next reviewer know?" /><div className="decision-actions"><button className="primary-button" type="submit" disabled={!decisionDraft || busy === "decision"}>{busy === "decision" ? "Saving…" : "Save review"}</button>{currentDecision && <span>Current: {currentDecision.status}</span>}</div></form><div className="assist-section"><button className="assist-toggle" type="button" aria-expanded={assistOpen} onClick={() => setAssistOpen(!assistOpen)}>Optional AI guidance <span aria-hidden="true">{assistOpen ? "−" : "+"}</span></button>{assistOpen && <div className="assist-body"><p>The scanner evidence above is the source of the priority. Gemini guidance is optional and cannot change scores or decisions.</p><label>Finding<select value={ruleId} onChange={(event) => { setRuleId(event.target.value); setAssistance(null); }}>{selected.score.findings.length ? selected.score.findings.map((finding) => <option key={finding.ruleId} value={finding.ruleId}>{finding.ruleId}</option>) : <option value="">No finding available</option>}</select></label><label className="check-label"><input type="checkbox" checked={includeCode} onChange={(event) => setIncludeCode(event.target.checked)} /> Include stored short code context</label><p className="fine-print">Finding guidance sends this comment and the selected rule evidence. The context checkbox adds the stored short source excerpt. Style assessment sends the comment alone unless context is selected.</p><div className="assist-actions"><button type="button" disabled={!ruleId || busy === "assist"} onClick={requestAssistance}>{busy === "assist" ? "Requesting…" : "Explain this finding"}</button><button type="button" disabled={busy === "assessment"} onClick={requestAssessment}>{busy === "assessment" ? "Assessing…" : "Assess writing style"}</button></div>{assistance && <div className="ai-result"><h4>Finding guidance</h4><p><strong>Why it matters:</strong> {assistance.whyItMatters}</p><p><strong>Relationship to this comment:</strong> {assistance.relationship}</p><p><strong>Suggested review:</strong> {assistance.recommendation}</p>{assistance.suggestedRewrite && <div><strong>Suggested rewrite</strong><pre>{assistance.suggestedRewrite}</pre></div>}</div>}{assessment && <div className="ai-result"><h4>Style assessment: {assessment.styleLabel.replaceAll("_", " ")}</h4>{assessment.reasons.map((reason, index) => <p key={index}>{reason}</p>)}{assessment.suggestedRewrite && <div><strong>Suggested rewrite</strong><pre>{assessment.suggestedRewrite}</pre></div>}</div>}</div>}</div></> : <div className="detail-empty"><h2 id="detail-heading">Select a comment to inspect it.</h2><p>Its source, rule evidence, and review controls will appear here.</p></div>}</section>
          </div>}
        </>}
      </main>
      <footer className="site-footer"><span>Comment Lens</span><p>Evidence first. The judgment stays yours.</p><a href={siteDocs} target="_blank" rel="noreferrer">CLI, CI & editor docs ↗</a></footer>
    </div>
  </>;
}
