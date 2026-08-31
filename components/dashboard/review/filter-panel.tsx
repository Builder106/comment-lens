import type { RefObject } from "react";
import type { ReactNode } from "react";
import type { CommentKind, ReviewStatus } from "../../../contracts";
import type { FilterChange, FilterState } from "./types";

const reviewLabels: Record<ReviewStatus, string> = {
  unreviewed: "Unreviewed",
  keep: "Keep",
  rewrite: "Rewrite",
  delete: "Delete",
  unsure: "Unsure",
};

const kinds: Array<{ value: CommentKind; label: string }> = [
  { value: "line", label: "Line" },
  { value: "block", label: "Block" },
  { value: "doc_line", label: "Documentation line" },
  { value: "doc_block", label: "Documentation block" },
  { value: "markup", label: "Markup" },
  { value: "special", label: "Special" },
  { value: "unknown", label: "Unknown" },
];

export function FilterPanel({
  open,
  filters,
  languages,
  searchRef,
  onChange,
  onClear,
  onClose,
}: {
  open: boolean;
  filters: FilterState;
  languages: string[];
  searchRef: RefObject<HTMLInputElement | null>;
  onChange: FilterChange;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <aside className={`filters-panel ${open ? "mobile-open" : ""}`} aria-label="Comment filters">
      <div className="panel-heading"><h2>Filters</h2><button className="close-button" type="button" onClick={onClose} aria-label="Close filters">Close</button></div>
      <label className="field-label" htmlFor="comment-search">Search comments</label>
      <div className="search-field"><input ref={searchRef} id="comment-search" value={filters.query} onChange={(event) => onChange("query", event.target.value)} placeholder="Text, path, symbol, or author" /><kbd>/</kbd></div>
      <label className="field-label" htmlFor="path-filter">Path contains</label>
      <input id="path-filter" value={filters.path} onChange={(event) => onChange("path", event.target.value)} placeholder="src/" />
      <label className="field-label" htmlFor="author-filter">Author</label>
      <input id="author-filter" value={filters.author} onChange={(event) => onChange("author", event.target.value)} placeholder="Name or email" />
      <div className="score-fields">
        <label className="field-label" htmlFor="min-score">Minimum score<input id="min-score" type="number" min="0" max="100" value={filters.minScore} onChange={(event) => onChange("minScore", event.target.value)} /></label>
        <label className="field-label" htmlFor="max-score">Maximum score<input id="max-score" type="number" min="0" max="100" value={filters.maxScore} onChange={(event) => onChange("maxScore", event.target.value)} /></label>
      </div>
      <Select label="Review status" id="status-filter" value={filters.status} onChange={(value) => onChange("status", value as ReviewStatus | "all")}><option value="all">All statuses</option>{Object.entries(reviewLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <Select label="Language" id="language-filter" value={filters.language} onChange={(value) => onChange("language", value)}><option value="all">All languages</option>{languages.map((language) => <option key={language}>{language}</option>)}</Select>
      <Select label="Comment type" id="kind-filter" value={filters.kind} onChange={(value) => onChange("kind", value as CommentKind | "all")}><option value="all">All types</option>{kinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</Select>
      <FlagFilter id="protected-filter" label="Protected comments" value={filters.protected} onChange={(value) => onChange("protected", value)} trueLabel="Protected only" falseLabel="Unprotected only" />
      <FlagFilter id="generated-filter" label="Generated comments" value={filters.generated} onChange={(value) => onChange("generated", value)} trueLabel="Generated only" falseLabel="Non-generated only" />
      <FlagFilter id="license-filter" label="License comments" value={filters.license} onChange={(value) => onChange("license", value)} trueLabel="License only" falseLabel="Non-license only" />
      <FlagFilter id="todo-filter" label="TODO/FIXME-only" value={filters.todo} onChange={(value) => onChange("todo", value)} trueLabel="TODO/FIXME only" falseLabel="Other comments" />
      <button className="text-button" type="button" onClick={onClear}>Clear filters</button>
    </aside>
  );
}

function Select({ label, id, value, onChange, children }: { label: string; id: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="field-label" htmlFor={id}>{label}<select id={id} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

function FlagFilter({ id, label, value, onChange, trueLabel, falseLabel }: { id: string; label: string; value: string; onChange: (value: string) => void; trueLabel: string; falseLabel: string }) {
  return <Select label={label} id={id} value={value} onChange={onChange}><option value="all">All</option><option value="true">{trueLabel}</option><option value="false">{falseLabel}</option></Select>;
}
