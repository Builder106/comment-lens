import type { CommentKind, CommentRecord, ReviewStatus } from "../../../contracts";

export type RepositoryContext = {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
};

export type ScanSummary = {
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

export type ReviewDecision = {
  commentId: string;
  status: ReviewStatus;
  note: string | null;
};

export type Assessment = {
  styleLabel: "ordinary" | "template_like" | "overexplained" | "uncertain" | "protected";
  confidence: number;
  reasons: string[];
  suggestedRewrite?: string | null;
  modelId?: string;
  promptVersion?: string;
  assessedAt?: string;
};

export type FilterState = {
  query: string;
  path: string;
  author: string;
  minScore: string;
  maxScore: string;
  status: ReviewStatus | "all";
  language: string;
  kind: CommentKind | "all";
  protected: string;
  generated: string;
  license: string;
  todo: string;
};

export type FilterChange = <Key extends keyof FilterState>(key: Key, value: FilterState[Key]) => void;

export type ReviewMutation = Exclude<ReviewStatus, "unreviewed">;

export type QueuePage = {
  items: CommentRecord[];
  decisions: ReviewDecision[];
  total: number;
  page: number;
  hasNextPage: boolean;
};
