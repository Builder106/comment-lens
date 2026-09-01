import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../../db/schema";

const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../db/migrations/0000_wise_maginty.sql");

export async function createPostgresFixture() {
  const url = process.env.COMMENT_LENS_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url || url.startsWith("neon:")) return null;

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  await pool.query("DROP SCHEMA public CASCADE");
  await pool.query("CREATE SCHEMA public");
  const migration = await readFile(migrationPath, "utf8");
  for (const statement of migration.split(/--> statement-breakpoint/).map((part) => part.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
  return { db, pool };
}

export async function resetPostgresFixture(pool: Pool) {
  await pool.query("TRUNCATE TABLE comment_lens_assessment, comment_lens_review, comment_lens_comment, comment_lens_chunk, comment_lens_scan, comment_lens_comment_identity, comment_lens_repository_installation CASCADE");
}

export async function closePostgresFixture(pool: Pool) {
  await pool.query("DROP TABLE IF EXISTS comment_lens_assessment, comment_lens_review, comment_lens_comment, comment_lens_chunk, comment_lens_scan, comment_lens_comment_identity, comment_lens_repository_installation CASCADE");
  await pool.end();
}
