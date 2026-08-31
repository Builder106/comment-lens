import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const schemaPath = fileURLToPath(new URL("../schema.json", import.meta.url));

test("contract schema is draft 2020-12 and versioned", async () => {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.$defs.schemaVersion.const, 1);
  assert.deepEqual(schema.$defs.reviewStatus.enum, ["unreviewed", "keep", "rewrite", "delete", "unsure"]);
  assert.equal(schema.$defs.comment.additionalProperties, false);
  assert.equal(schema.$defs.chunk.additionalProperties, false);
  assert.equal(schema.$defs.assessment.properties.reasons.maxItems, 3);
});

test("schema declares worker and manifest contracts", async () => {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  assert.ok(schema.$defs.manifest);
  assert.ok(schema.$defs.comment);
  assert.ok(schema.$defs.chunk);
  assert.ok(schema.$defs.complete);
  assert.ok(schema.$defs.commentQuery);
  assert.ok(schema.$defs.geminiAssessment);
  assert.ok(schema.$defs.assessmentRequest);
  assert.ok(schema.$defs.workerFailure);
  assert.ok(schema.$defs.workerFailureResponse);
  assert.ok(schema.$defs.scan);
  assert.ok(schema.$defs.scanList);
});

test("v1 preserves the review and assessment boundaries", async () => {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const review = schema.$defs.review;
  const assessment = schema.$defs.assessment;
  assert.deepEqual(review.properties.status.$ref, "#/$defs/reviewStatus");
  assert.deepEqual(assessment.properties.styleLabel.enum, [
    "ordinary",
    "template_like",
    "overexplained",
    "uncertain",
    "protected",
  ]);
  assert.equal(schema.$defs.score.properties.priorityScore.maximum, 100);
  assert.notEqual(schema.$defs.score.properties.priorityScore.description, "authorship probability");
});

test("representative worker fixture has strict required fields", async () => {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const chunk = schema.$defs.chunk;
  assert.deepEqual(chunk.required, [
    "schemaVersion",
    "scanId",
    "chunkId",
    "sequence",
    "totalChunks",
    "comments",
    "files",
    "diagnostics",
  ]);
  assert.equal(chunk.properties.comments.items.$ref, "#/$defs/comment");
  assert.equal(chunk.properties.files.items.$ref, "#/$defs/file");
  assert.equal(schema.$defs.complete.properties.manifest.$ref, "#/$defs/manifest");
});

test("representative scanner manifest retains provenance without source snapshots", async () => {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const manifest = schema.$defs.manifest;
  assert.deepEqual(manifest.required, [
    "schemaVersion",
    "scanId",
    "repoId",
    "sourceMode",
    "headCommit",
    "worktreeFingerprint",
    "configHash",
    "extractorVersion",
    "parserVersions",
    "startedAt",
    "completedAt",
    "files",
    "diagnostics",
  ]);
  assert.equal(manifest.properties.files.items.$ref, "#/$defs/file");
  assert.equal(manifest.additionalProperties, false);
  assert.equal(schema.$defs.comment.properties.sourceContext.maxLength, 8192);
});
