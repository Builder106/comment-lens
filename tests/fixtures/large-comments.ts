export type FixtureComment = {
  commentId: string;
  path: string;
  bodyText: string;
  priorityScore: number;
};

export function createLargeCommentFixture(count = 10_000): FixtureComment[] {
  return Array.from({ length: count }, (_, index) => ({
    commentId: `fixture-${String(index).padStart(5, "0")}`,
    path: `src/module-${index % 100}.ts`,
    bodyText: `Explain the behavior of operation ${index}.`,
    priorityScore: index % 101,
  }));
}
