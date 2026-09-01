import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import { createLargeCommentFixture } from "../fixtures/large-comments";

const { Client } = pg;
const RECORD_COUNT = 10_000;
const WARMUPS = 5;
const ITERATIONS = 20;
const ARTIFACT_PATH = resolve("tests/performance/artifacts/large-comments.json");

type TimedRun = { queryMs: number; serializationMs: number; totalMs: number; rows: number };

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
}

function metrics(values: number[]) {
  return { p50Ms: percentile(values, 0.5), p95Ms: percentile(values, 0.95), maxMs: Math.max(...values) };
}

async function withFixtureTable<T>(run: (client: pg.Client) => Promise<T>) {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL must point to a real Postgres database");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE TEMP TABLE comment_lens_performance_comments (
      id text PRIMARY KEY, path text NOT NULL, language text NOT NULL, kind text NOT NULL,
      placement text NOT NULL, body_text text NOT NULL, raw_text text NOT NULL, context text NOT NULL,
      payload jsonb NOT NULL, priority_score integer NOT NULL, author_name text NOT NULL,
      author_email text NOT NULL, protected boolean NOT NULL, generated boolean NOT NULL,
      license boolean NOT NULL, todo_only boolean NOT NULL
    )`);
    const fixture = createLargeCommentFixture(RECORD_COUNT);
    for (let offset = 0; offset < fixture.length; offset += 250) {
      const batch = fixture.slice(offset, offset + 250);
      const values: unknown[] = [];
      const placeholders = batch.map((comment, index) => {
        const base = index * 16;
        values.push(comment.commentId, comment.path, comment.language, comment.kind, comment.placement, comment.bodyText, comment.rawText, comment.context, JSON.stringify(comment.payload), comment.priorityScore, comment.authorName, comment.authorEmail, comment.protected, comment.generated, comment.license, comment.todoOnly);
        return `(${Array.from({ length: 16 }, (_, field) => `$${base + field + 1}`).join(", ")})`;
      });
      await client.query(`INSERT INTO comment_lens_performance_comments VALUES ${placeholders.join(", ")}`, values);
    }
    return await run(client);
  } finally {
    await client.query("DROP TABLE IF EXISTS comment_lens_performance_comments");
    await client.end();
  }
}

async function queueQuery(client: pg.Client): Promise<unknown[]> {
  const result = await client.query(`SELECT id, path, language, kind, placement, body_text, raw_text, context,
    payload, priority_score, author_name, author_email, protected, generated, license, todo_only
    FROM comment_lens_performance_comments
    WHERE body_text ILIKE $1 OR path ILIKE $1 OR author_name ILIKE $1 OR author_email ILIKE $1
    ORDER BY priority_score DESC, path ASC, id ASC LIMIT $2 OFFSET $3`, ["%operation%", RECORD_COUNT, 0]);
  return result.rows;
}

test("10,000-comment fixture is deterministic and bounded", () => {
  const comments = createLargeCommentFixture();
  assert.equal(comments.length, 10_000);
  assert.equal(comments[0]?.commentId, "fixture-00000");
  assert.equal(comments[9_999]?.commentId, "fixture-09999");
  assert.equal(new Set(comments.map((comment) => comment.commentId)).size, 10_000);
  assert.ok(comments.every((comment) => comment.path.startsWith("src/")));
});

(process.env.DATABASE_URL ? test : test.skip)("real Postgres queue query and serialization stay within the performance slice", async () => {
  await withFixtureTable(async (client) => {
    for (let index = 0; index < WARMUPS; index += 1) {
      JSON.stringify(await queueQuery(client));
    }
    const runs: TimedRun[] = [];
    for (let index = 0; index < ITERATIONS; index += 1) {
      const started = performance.now();
      const rows = await queueQuery(client);
      const queryFinished = performance.now();
      const serialized = JSON.stringify(rows);
      const finished = performance.now();
      assert.ok(serialized.length > 0);
      runs.push({ queryMs: queryFinished - started, serializationMs: finished - queryFinished, totalMs: finished - started, rows: rows.length });
    }
    const query = metrics(runs.map((run) => run.queryMs));
    const serialization = metrics(runs.map((run) => run.serializationMs));
    const totalMs = runs.reduce((sum, run) => sum + run.totalMs, 0);
    const artifact = {
      workload: { records: RECORD_COUNT, warmups: WARMUPS, iterations: ITERATIONS, query: "Comment Lens review queue", connection: "runtime DATABASE_URL" },
      rowCount: runs[runs.length - 1]?.rows ?? 0,
      queueQueryMs: query,
      serializationMs: serialization,
      totalMaxMs: Math.max(...runs.map((run) => run.totalMs)),
      throughputRecordsPerSecond: (RECORD_COUNT * ITERATIONS) / (totalMs / 1000),
      peakRssMb: process.memoryUsage().rss / 1024 / 1024,
      thresholds: { queueQueryP95Ms: 750, serializationP95Ms: 250, totalMaxMs: 15_000, peakRssMb: 512 },
    };
    await mkdir(dirname(ARTIFACT_PATH), { recursive: true });
    await writeFile(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    assert.equal(artifact.rowCount, RECORD_COUNT);
    assert.ok(query.p95Ms <= 750, `queue query p95 ${query.p95Ms.toFixed(1)}ms exceeded 750ms`);
    assert.ok(serialization.p95Ms <= 250, `serialization p95 ${serialization.p95Ms.toFixed(1)}ms exceeded 250ms`);
    assert.ok(artifact.totalMaxMs <= 15_000, `max iteration ${artifact.totalMaxMs.toFixed(1)}ms exceeded 15s`);
    assert.ok(artifact.peakRssMb <= 512, `peak RSS ${artifact.peakRssMb.toFixed(1)}MB exceeded 512MB`);
  });
});
