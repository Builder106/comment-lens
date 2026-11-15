import assert from "node:assert/strict";
import test from "node:test";
import { day, drift, position, versions } from "@/lib/landing/drift";
import { gateRow, report } from "@/lib/landing/report";

const commentRow = drift.states[0].lines.findIndex((line) => line.text.trim().startsWith("#"));
const head = drift.states[2];
const codeRow = head.lines.findIndex((line) => line.n === drift.finding.evidence.codeLine);

test("the story starts at the commit that wrote the comment", () => {
  const { evidence } = drift.finding;
  assert.equal(drift.states[0].commit.sha, evidence.commentCommit);
  for (const line of drift.states[0].lines) assert.equal(line.commit, evidence.commentCommit.slice(0, 7));
  assert.equal(drift.states[1].commit.sha, evidence.codeCommit);
});

test("the blame shown at the head commit matches the finding's evidence", () => {
  const { evidence, line } = drift.finding;
  assert.equal(head.commit.sha, report.commit);
  assert.equal(head.lines[commentRow].n, line);
  assert.equal(head.lines[commentRow].date, day(evidence.commentAuthoredAt));
  assert.equal(head.lines[commentRow].commit, evidence.commentCommit.slice(0, 7));
  assert.equal(head.lines[codeRow].date, day(evidence.codeAuthoredAt));
  assert.equal(head.lines[codeRow].commit, evidence.codeCommit.slice(0, 7));
  assert.ok(head.lines[codeRow].date > head.lines[commentRow].date);
});

test("the comment text never changes across the three commits", () => {
  const texts = new Set(drift.states.map((state) => state.lines[commentRow].text));
  assert.equal(texts.size, 1);
});

test("the terminal excerpt agrees with the baseline gate", () => {
  const { terminal } = drift;
  assert.equal(terminal.exit, gateRow(true, "high").exit);
  assert.ok(terminal.header.some((line) => line.endsWith(`Blocking: ${gateRow(true, "high").blocking}`)));
  assert.ok(terminal.skippedBefore > 0 && terminal.skippedAfter > 0);
});

test("versions collapse unchanged runs so only real changes animate", () => {
  assert.deepEqual(versions(["a", "a", "b"]), [{ value: "a", from: 0, to: 1 }, { value: "b", from: 2, to: 2 }]);
  const [first, second] = versions(["a", "a", "b"]);
  assert.equal(position(first, 1), "current");
  assert.equal(position(first, 2), "past");
  assert.equal(position(second, 1), "future");
});
