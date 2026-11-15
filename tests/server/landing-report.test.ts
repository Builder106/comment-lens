import assert from "node:assert/strict";
import test from "node:test";
import { failLevels, gateRow, label, report, ruleBlocking } from "@/lib/landing/report";
import { ruleById, rules } from "@/lib/landing/rules";

test("every gate outcome matches the recorded CLI exit status", () => {
  for (const baseline of [false, true]) {
    for (const failOn of failLevels) {
      const row = gateRow(baseline, failOn);
      const computed = report.byRule.reduce((sum, item) => sum + ruleBlocking(item, failOn, baseline), 0);
      assert.equal(computed, row.blocking, `blocking count for baseline=${baseline} fail-on=${failOn}`);
      assert.equal(row.exit, row.blocking > 0 ? 1 : 0, `exit status for baseline=${baseline} fail-on=${failOn}`);
      assert.equal(row.new + row.existing, row.findings);
    }
  }
});

test("runs without a baseline report every finding as new", () => {
  for (const row of report.gate.filter((item) => !item.baseline)) {
    assert.equal(row.existing, 0);
    assert.equal(row.new, row.findings);
  }
});

test("a finding is labelled blocking only when it is new and meets the threshold", () => {
  assert.equal(label("high", "new", "high", true), "blocking");
  assert.equal(label("high", "existing", "high", true), "existing");
  assert.equal(label("high", "existing", "high", false), "blocking");
  assert.equal(label("review", "new", "high", false), "advisory");
  assert.equal(label("high", "new", "none", false), "advisory");
});

test("the sample is documented, linked to the pinned commit, and free of author names", () => {
  for (const finding of report.sample) {
    assert.ok(ruleById.has(finding.rule), `${finding.rule} has a rule page`);
    assert.ok(finding.permalink.includes(report.commit));
    assert.ok(finding.permalink.endsWith(`#L${finding.line}`));
    assert.ok(!("author" in finding.evidence));
  }
  for (const item of report.byRule) assert.ok(ruleById.has(item.rule), `${item.rule} has a rule page`);
  assert.equal(new Set(rules.map((rule) => rule.id)).size, rules.length);
});
