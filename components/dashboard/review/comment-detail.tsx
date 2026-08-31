import type { CommentRecord, Finding, ReviewStatus } from "../../../contracts";
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
  return (
    <aside className={`detail-panel ${open ? "mobile-open" : ""}`} aria-label="Selected comment detail">
      <div className="panel-heading"><div><h2>Comment detail</h2><p className="detail-path">{comment.path}:{line}</p></div><button className="close-button" type="button" aria-label="Close detail" onClick={onClose}>Close</button></div>
      <CodeContext comment={comment} firstLine={line} />
      <dl className="detail-meta"><div><dt>Language</dt><dd>{comment.language}</dd></div><div><dt>Comment type</dt><dd>{comment.kind}</dd></div><div><dt>Symbol</dt><dd>{comment.symbol?.enclosing?.name ?? "File-level"}</dd></div><div><dt>Parser</dt><dd>{comment.parser} — {comment.rawSpan.precision}</dd></div><div><dt>Commit</dt><dd>{comment.git.primaryCommit?.slice(0, 12) ?? "Unavailable"}</dd></div><div><dt>Author</dt><dd>{comment.git.blameSpans[0]?.authorName ?? "Unavailable"}</dd></div></dl>
      <DeterministicFindings comment={comment} />
      <AssessmentPanel assessment={assessment} pending={assessmentPending ?? false} onAssess={onAssess} />
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

export function AssessmentPanel({ assessment, pending, onAssess }: { assessment: Assessment | null; pending: boolean; onAssess: () => void }) {
  return <section className="assessment-panel" aria-labelledby="assessment-title"><div><h3 id="assessment-title">Gemini assessment</h3><p>Optional. It uses this comment and its stored short context.</p></div>{assessment ? <div className="assessment-result" role="status"><strong>{assessmentLabels[assessment.styleLabel]} — {Math.round(assessment.confidence * 100)}% confidence</strong><ul>{assessment.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>{assessment.suggestedRewrite ? <p className="assessment-rewrite">Suggested rewrite: {assessment.suggestedRewrite}</p> : null}{assessment.modelId ? <p className="assessment-provenance">{assessment.modelId}{assessment.promptVersion ? `, prompt ${assessment.promptVersion}` : ""}</p> : null}</div> : <button className="button button-secondary" type="button" disabled={pending} onClick={onAssess}>{pending ? "Assessing style" : "Assess style"}</button>}</section>;
}

export function ReviewControls({ selected, note, onNoteChange, onReview }: { selected?: ReviewStatus; note: string; onNoteChange: (note: string) => void; onReview: (status: ReviewMutation) => void }) {
  return <section className="review-controls" aria-labelledby="review-title"><h3 id="review-title">Review decision</h3><div className="review-buttons">{(Object.keys(reviewLabels) as ReviewMutation[]).map((status) => <button type="button" className={selected === status ? "selected-action" : ""} aria-pressed={selected === status} key={status} onClick={() => onReview(status)}>{reviewLabels[status]}</button>)}</div><label className="field-label" htmlFor="review-note">Private note<textarea id="review-note" value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Context for a future review" rows={3} /></label></section>;
}
