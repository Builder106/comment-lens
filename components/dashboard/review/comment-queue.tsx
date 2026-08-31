import type { CommentRecord, ReviewStatus } from "../../../contracts";
import type { QueuePage, ReviewDecision } from "./types";

const reviewLabels: Record<ReviewStatus, string> = { unreviewed: "Unreviewed", keep: "Keep", rewrite: "Rewrite", delete: "Delete", unsure: "Unsure" };

export function QueueSummary({ total, reviewCount, warningCount }: { total: number; reviewCount: number; warningCount: number }) {
  return <p className="queue-summary"><strong>{total}</strong> comments <span>{reviewCount} need review</span>{warningCount > 0 ? <span>{warningCount} parse warnings</span> : null}</p>;
}

export function CommentQueue({ page, selectedId, sort, loading, onSelect, onSortChange, onPageChange }: {
  page: QueuePage | null;
  selectedId: string | null;
  sort: "score" | "path" | "age" | "status";
  loading: boolean;
  onSelect: (commentId: string) => void;
  onSortChange: (sort: "score" | "path" | "age" | "status") => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <section className="queue-panel" aria-label="Comments queue">
      <div className="queue-heading">
        <div><h2 id="queue-title">Review queue</h2><QueueSummary total={page?.total ?? 0} reviewCount={page?.items.filter((item) => (item.score.priorityScore ?? 0) >= 40).length ?? 0} warningCount={0} /></div>
        <label className="sr-only" htmlFor="queue-sort">Sort comments</label>
        <select id="queue-sort" value={sort} onChange={(event) => onSortChange(event.target.value as "score" | "path" | "age" | "status")}>
          <option value="score">Highest priority</option><option value="path">File and line</option><option value="age">Newest first</option><option value="status">Review state</option>
        </select>
      </div>
      {page?.items.length ? <div className="comment-list" role="list">{page.items.map((comment) => <CommentQueueItem key={comment.commentId} comment={comment} decision={page.decisions.find((item) => item.commentId === comment.commentId)} selected={comment.commentId === selectedId} onSelect={onSelect} />)}</div> : <QueueEmpty loading={loading} />}
      <nav className="pagination" aria-label="Queue pages"><button type="button" disabled={!page || page.page <= 1} onClick={() => page && onPageChange(page.page - 1)}>Previous</button><span>Page {page?.page ?? 1}</span><button type="button" disabled={!page?.hasNextPage} onClick={() => page && onPageChange(page.page + 1)}>Next</button></nav>
    </section>
  );
}

function CommentQueueItem({ comment, decision, selected, onSelect }: { comment: CommentRecord; decision?: ReviewDecision; selected: boolean; onSelect: (commentId: string) => void }) {
  const score = comment.score.priorityScore;
  const review = decision?.status ?? "unreviewed";
  const line = comment.rawSpan.start.line0 + 1;
  return <div role="listitem"><button id={`comment-${comment.commentId}`} aria-label={`${comment.bodyText || comment.rawText}. Similarity score ${score === null ? "protected" : score}`} className={`comment-row ${selected ? "selected" : ""}`} type="button" aria-pressed={selected} onClick={() => onSelect(comment.commentId)}><span className="comment-row-path">{comment.path}:{line}</span><span className="comment-row-score">{score === null ? "Protected" : `${score}`}</span><span className="comment-row-text">{comment.bodyText || comment.rawText}</span><span className="comment-row-meta">{comment.language} — {reviewLabels[review]}</span></button></div>;
}

function QueueEmpty({ loading }: { loading: boolean }) {
  return <div className="empty-inline"><h3>{loading ? "Loading comments" : "No comments match these filters"}</h3><p>{loading ? "The current page is being prepared." : "Change or clear a filter to widen the queue."}</p></div>;
}
