export type FixtureComment = {
  commentId: string;
  path: string;
  language: string;
  kind: string;
  placement: string;
  bodyText: string;
  rawText: string;
  context: string;
  priorityScore: number;
  payload: {
    symbol: { enclosing: { name: string } };
    rawSpan: { start: { line0: number } };
  };
  authorName: string;
  authorEmail: string;
  protected: boolean;
  generated: boolean;
  license: boolean;
  todoOnly: boolean;
};

export function createLargeCommentFixture(count = 10_000): FixtureComment[] {
  return Array.from({ length: count }, (_, index) => ({
    commentId: `fixture-${String(index).padStart(5, "0")}`,
    path: `src/module-${index % 100}.ts`,
    language: "typescript",
    kind: index % 4 === 0 ? "block" : "line",
    placement: index % 3 === 0 ? "leading" : "trailing",
    bodyText: `Explain the behavior of operation ${index} when the ${index % 17}th queue item changes state.`,
    rawText: `// Explain the behavior of operation ${index} when the ${index % 17}th queue item changes state.`,
    context: `export function operation${index}(input: QueueItem): QueueItem { return input; }`,
    priorityScore: index % 101,
    payload: {
      symbol: { enclosing: { name: `operation${index}` } },
      rawSpan: { start: { line0: (index % 240) + 1 } },
    },
    authorName: `reviewer-${index % 40}`,
    authorEmail: `reviewer-${index % 40}@example.test`,
    protected: index % 97 === 0,
    generated: index % 113 === 0,
    license: index % 251 === 0,
    todoOnly: index % 29 === 0,
  }));
}
