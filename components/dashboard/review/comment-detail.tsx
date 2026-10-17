"use client";
import { useState } from "react";
import { ErrorResponse, FindingAssistanceResponse, type CommentRecord, type Finding, type FindingAssistance, type ReviewStatus } from "../../../contracts";
import type { Assessment, ReviewDecision, ReviewMutation } from "./types";

const reviewLabels: Record<ReviewMutation, string> = { keep: "Keep", rewrite: "Rewrite", delete: "Delete", unsure: "Unsure" };
const assessmentLabels: Record<Assessment["styleLabel"], string> = { ordinary: "Ordinary", template_like: "Template-like", overexplained: "Overexplained", uncertain: "Uncertain", protected: "Protected" };

export function CommentDetail({ comment, decision, assessment, note, assessmentPending, open, onClose, onAssess, onNoteChange, onReview }: {
  comment: CommentRecord;
  decision?: ReviewDecision;
  assessment: Assessment | null;
  note: string;
  assessmentPending?: boolean;
  open: boolean;
  onClose: () => void;
  onAssess: () => void;
  onNoteChange: (note: string) => void;
  onReview: (status: ReviewMutation) => void;
}) {
  const line = comment.rawSpan.start.line0 + 1;
  const [noteError, setNoteError] = useState("");
  const handleApplyRewrite = (rewrite: string) => {
    const formatted = `Suggested rewrite:\n${rewrite}`;
    const next = note ? `${note}\n\n${formatted}` : formatted;
    if (next.length > 4000) {
      setNoteError("The suggestion does not fit in the 4,000-character review note. Copy it instead.");
      return;
    }
    setNoteError("");
    onNoteChange(next);
  };
  return (
    <aside className={`detail-panel ${open ? "mobile-open" : ""}`} aria-label="Selected comment detail">
      <div className="panel-heading"><div><h2>Comment detail</h2><p className="detail-path">{comment.path}:{line}</p></div><button className="close-button" type="button" aria-label="Close detail" onClick={onClose}>Close</button></div>
      <CodeContext comment={comment} firstLine={line} />
      <dl className="detail-meta"><div><dt>Language</dt><dd>{comment.language}</dd></div><div><dt>Comment type</dt><dd>{comment.kind}</dd></div><div><dt>Symbol</dt><dd>{comment.symbol?.enclosing?.name ?? "File-level"}</dd></div><div><dt>Parser</dt><dd>{comment.parser} — {comment.rawSpan.precision}</dd></div><div><dt>Commit</dt><dd>{comment.git.primaryCommit?.slice(0, 12) ?? "Unavailable"}</dd></div><div><dt>Author</dt><dd>{comment.git.blameSpans[0]?.authorName ?? "Unavailable"}</dd></div></dl>
      <DeterministicFindings comment={comment} />
      <FindingAssistancePanel comment={comment} onApplyRewrite={handleApplyRewrite} />
      <AssessmentPanel assessment={assessment} pending={assessmentPending ?? false} onAssess={onAssess} onApplyRewrite={handleApplyRewrite} />
      {noteError && <p className="cl-state-error" role="alert">{noteError}</p>}
      <ReviewControls selected={decision?.status} note={note} onNoteChange={onNoteChange} onReview={onReview} />
    </aside>
  );
}

function CodeContext({ comment, firstLine }: { comment: CommentRecord; firstLine: number }) {
  const lines = (comment.sourceContext ?? comment.rawText).split("\n");
  return <section className="code-context" aria-label={`Source context around line ${firstLine}`}>
    <h3>Source context</h3>
    <pre>{lines.map((source, index) => <span className="code-line" key={`${index}-${source}`}><span aria-hidden="true">{String(firstLine + index).padStart(4, " ")}</span><code>{source || " "}</code></span>)}</pre>
  </section>;
}

export function DeterministicFindings({ comment }: { comment: CommentRecord }) {
  const score = comment.score.priorityScore;
  return <section className="deterministic-findings" aria-labelledby="findings-title"><div className="findings-heading"><div><h3 id="findings-title">Deterministic findings</h3><p>Rules prioritize human review; they do not establish authorship.</p></div><strong>{score === null ? "Protected" : `${score}/100`}</strong></div>{comment.score.findings.length ? <ul>{comment.score.findings.map((finding) => <FindingItem finding={finding} key={finding.ruleId} />)}</ul> : <p className="findings-empty">No scoring rules were triggered.</p>}</section>;
}

function FindingItem({ finding }: { finding: Finding }) {
  return <li><div><strong>{finding.ruleId.replaceAll("_", " ")}</strong><span>+{finding.contribution}</span></div><p>{finding.explanation}</p></li>;
}

function FindingAssistancePanel({ comment, onApplyRewrite }: { comment: CommentRecord; onApplyRewrite: (rewrite: string) => void }) {
  const [ruleId, setRuleId] = useState(comment.score.findings[0]?.ruleId ?? "");
  const [includeCodeContext, setIncludeCodeContext] = useState(false);
  const [assistance, setAssistance] = useState<FindingAssistance | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const explain = async () => {
    if (!ruleId || pending) return;
    setPending(true);
    setAssistance(null);
    setError("");
    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(comment.commentId)}/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaVersion: 1, scanId: comment.scanId, ruleId, includeCodeContext }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const failure = ErrorResponse.safeParse(body);
        throw new Error(failure.success ? failure.data.error.message : "Assisted review is unavailable");
      }
      const parsed = FindingAssistanceResponse.safeParse(body);
      if (!parsed.success) throw new Error("Invalid assisted review response");
      setAssistance(parsed.data.assistance);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assisted review is unavailable");
    } finally {
      setPending(false);
    }
  };
  return <section className="finding-assistance" aria-labelledby="finding-assistance-title">
    <h3 id="finding-assistance-title">Explain a finding</h3>
    <p>Optional Gemini guidance for one rule. It cannot change the score or review decision.</p>
    {comment.score.findings.length ? <>
      <label htmlFor="assistance-rule">Finding</label>
      <select id="assistance-rule" value={ruleId} disabled={pending} onChange={(event) => { setRuleId(event.target.value); setAssistance(null); setError(""); }}>{comment.score.findings.map((finding) => <option key={finding.ruleId} value={finding.ruleId}>{finding.ruleId.replaceAll("_", " ")}</option>)}</select>
      <label className="assistance-context"><input type="checkbox" checked={includeCodeContext} disabled={pending} onChange={(event) => { setIncludeCodeContext(event.target.checked); setAssistance(null); setError(""); }} /> Include stored code context in the Gemini request</label>
      <button type="button" className="button button-secondary" disabled={pending} onClick={explain}>{pending ? "Explaining finding" : "Explain selected finding"}</button>
      {error && <p className="cl-state-error" role="alert">{error}</p>}
      {assistance && <div className="assistance-result" role="status">
        <p><strong>Why it may matter:</strong> {assistance.whyItMatters}</p>
        <p><strong>Relationship to context:</strong> {assistance.relationship}</p>
        <p><strong>Suggested review:</strong> {assistance.recommendation}</p>
        {assistance.suggestedRewrite && <SuggestedRewriteBlock rewrite={assistance.suggestedRewrite} onApply={onApplyRewrite} />}
        <p className="assessment-provenance">{assistance.modelId}, prompt {assistance.promptVersion}</p>
      </div>}
    </> : <p>No deterministic findings to explain.</p>}
  </section>;
}

export function AssessmentPanel({
  assessment,
  pending,
  onAssess,
  onApplyRewrite,
}: {
  assessment: Assessment | null;
  pending: boolean;
  onAssess: () => void;
  onApplyRewrite?: (rewrite: string) => void;
}) {
  return (
    <section className="assessment-panel" aria-labelledby="assessment-title">
      <div>
        <h3 id="assessment-title">Gemini assessment</h3>
        <p>Optional. It uses this comment and its stored short context.</p>
      </div>
      {assessment ? (
        <div className="assessment-result" role="status">
          <strong>
            {assessmentLabels[assessment.styleLabel]} — {Math.round(assessment.confidence * 100)}% confidence
          </strong>
          <ul>
            {assessment.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {assessment.suggestedRewrite ? (
            <SuggestedRewriteBlock rewrite={assessment.suggestedRewrite} onApply={onApplyRewrite} />
          ) : null}
          {assessment.modelId ? (
            <p className="assessment-provenance">
              {assessment.modelId}
              {assessment.promptVersion ? `, prompt ${assessment.promptVersion}` : ""}
            </p>
          ) : null}
        </div>
      ) : (
        <button
          className="button button-secondary"
          type="button"
          disabled={pending}
          onClick={onAssess}
        >
          {pending ? "Assessing style" : "Assess style"}
        </button>
      )}
    </section>
  );
}

function SuggestedRewriteBlock({ rewrite, onApply }: { rewrite: string; onApply?: (rewrite: string) => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(rewrite);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Ignore clipboard write failure
    }
  };
  return (
    <div className="assessment-rewrite-box">
      <div className="assessment-rewrite-header">
        <strong>Suggested rewrite</strong>
        <div className="assessment-rewrite-actions">
          <button type="button" className="text-button" onClick={handleCopy}>
            {copied ? "Copied" : "Copy rewrite"}
          </button>
          {onApply ? (
            <button type="button" className="text-button" onClick={() => onApply(rewrite)}>
              Insert in note
            </button>
          ) : null}
        </div>
      </div>
      <pre className="assessment-rewrite-pre"><code>{rewrite}</code></pre>
    </div>
  );
}

export function ReviewControls({ selected, note, onNoteChange, onReview }: { selected?: ReviewStatus; note: string; onNoteChange: (note: string) => void; onReview: (status: ReviewMutation) => void }) {
  return <section className="review-controls" aria-labelledby="review-title"><h3 id="review-title">Review decision</h3><div className="review-buttons">{(Object.keys(reviewLabels) as ReviewMutation[]).map((status) => <button type="button" className={selected === status ? "selected-action" : ""} aria-pressed={selected === status} key={status} onClick={() => onReview(status)}>{reviewLabels[status]}</button>)}</div><label className="field-label" htmlFor="review-note">Private note<textarea id="review-note" value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Context for a future review" rows={3} /></label></section>;
}
