export type Severity = "low" | "review" | "high";

export interface RuleDoc {
  id: string;
  severity: Severity;
  summary: string;
  detects: string;
  needsHistory: boolean;
  evidence: string;
  limits: string;
  tune: string;
}

export const rules: RuleDoc[] = [
  {
    id: "todo",
    severity: "review",
    summary: "A comment that starts with TODO.",
    detects: "A comment with a line that begins with TODO, with or without a leading asterisk. The finding only says the marker exists. The rules task_without_reference and aged_task say whether the task has a way forward.",
    needsHistory: false,
    evidence: '{"marker": "TODO"}',
    limits: "The marker has to start a line of the comment. A TODO in the middle of a sentence is not matched.",
    tune: 'todo = "none"',
  },
  {
    id: "fixme",
    severity: "high",
    summary: "A comment that starts with FIXME.",
    detects: "A comment with a line that begins with FIXME. By default the finding is high severity, because FIXME usually records a known defect.",
    needsHistory: false,
    evidence: '{"marker": "FIXME"}',
    limits: "A FIXME that links an issue is still reported here. Use a baseline or fail_on_rules to decide whether it blocks.",
    tune: 'fixme = "review"',
  },
  {
    id: "hack",
    severity: "high",
    summary: "A comment that starts with HACK.",
    detects: "A comment with a line that begins with HACK. By default the finding is high severity.",
    needsHistory: false,
    evidence: '{"marker": "HACK"}',
    limits: "The scanner does not judge the workaround. It reports that the author marked one.",
    tune: 'hack = "review"',
  },
  {
    id: "task_without_reference",
    severity: "review",
    summary: "A TODO, FIXME or HACK with no issue, owner or condition.",
    detects: "A task comment that contains none of: an issue reference such as #123, ABC-123 or an issues URL; an owner such as @name or owner: name; a condition such as after, when, until or once followed by a word.",
    needsHistory: false,
    evidence: '{"issue": false, "owner": false, "resolution": false}',
    limits: "The check reads the comment text only. It cannot tell whether a referenced issue is still open.",
    tune: 'task_without_reference = "low"',
  },
  {
    id: "aged_task",
    severity: "review",
    summary: "A task comment whose line is older than the age threshold.",
    detects: "A task comment whose last change in git is at least thresholds.age_days days before the scan. The default is 180 days. The evidence records the age, the commit and the date.",
    needsHistory: true,
    evidence: '{"ageDays": 675, "minimumDays": 180, "authoredAt": "...", "commit": "..."}',
    limits: "Needs git history. In GitHub Actions, check out with fetch-depth: 0, as this repository's own workflows do.",
    tune: "[thresholds]\nage_days = 365",
  },
  {
    id: "nearby_code_changed",
    severity: "review",
    summary: "The code beside a comment changed after the comment was written.",
    detects: "The nearest line of code within five lines of the comment was last changed in a later commit than the comment itself. The evidence names both commits and both dates.",
    needsHistory: true,
    evidence: '{"codeLine": 3, "commentCommit": "...", "codeCommit": "...", "commentAuthoredAt": "...", "codeAuthoredAt": "..."}',
    limits: "A changed line does not mean a wrong comment. This is the most common finding in the pwndbg run, so it is easier to read on changed lines only, with comment-lens check --changed.",
    tune: 'nearby_code_changed = "low"',
  },
  {
    id: "missing_local_reference",
    severity: "high",
    summary: "A Markdown link in a comment points at a path that does not exist.",
    detects: "A comment with a Markdown link such as [notes](docs/notes.md) whose relative target does not exist in the repository. Links with a scheme, absolute paths and paths that leave the repository are skipped.",
    needsHistory: false,
    evidence: '{"references": [{"reference": "docs/notes.md", "resolvedPath": "src/docs/notes.md"}]}',
    limits: "Only Markdown link syntax is checked. A bare path in prose is not.",
    tune: 'missing_local_reference = "review"',
  },
  {
    id: "restates_symbol",
    severity: "review",
    summary: "The comment repeats the name of the function or class it sits in.",
    detects: "The comment text contains the enclosing symbol name, ignoring case. The evidence names the symbol.",
    needsHistory: false,
    evidence: '{"symbol": "test"}',
    limits: "Short symbol names such as test match inside ordinary words, so treat these findings as prompts to look.",
    tune: 'restates_symbol = "off"',
  },
  {
    id: "excessive_verbosity",
    severity: "review",
    summary: "A comment longer than the word limit.",
    detects: "A comment with more words than thresholds.max_words. The default is 45. The evidence records the count and the limit.",
    needsHistory: false,
    evidence: '{"wordCount": 61, "maxWords": 45}',
    limits: "A long comment can be the right length for a hard problem. The rule asks a person to look.",
    tune: "[thresholds]\nmax_words = 80",
  },
  {
    id: "hedge_stack",
    severity: "low",
    summary: "Three or more uncertainty words in one comment.",
    detects: "A comment with at least thresholds.hedge_terms of the words may, might, could, possibly, generally or typically. The default is 3.",
    needsHistory: false,
    evidence: '{"hedgeCount": 3, "minimum": 3}',
    limits: "Documentation of behavior that really is uncertain will match, and it can stay as written.",
    tune: "[thresholds]\nhedge_terms = 4",
  },
  {
    id: "promotional_or_vague_language",
    severity: "low",
    summary: "A comment that uses words like robust, seamless or simply.",
    detects: "A comment containing elegant, seamless, robust, powerful, simply or beautiful. The evidence lists the matched terms.",
    needsHistory: false,
    evidence: '{"terms": ["robust"]}',
    limits: "The word list is short and fixed. It does not read meaning.",
    tune: 'promotional_or_vague_language = "off"',
  },
];

export const ruleById = new Map(rules.map((rule) => [rule.id, rule]));

export const severityRank: Record<Severity, number> = { low: 0, review: 1, high: 2 };
