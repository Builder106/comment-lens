import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.COMMENT_LENS_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const isPostgresUrl = databaseUrl?.startsWith("postgres://") || databaseUrl?.startsWith("postgresql://");
const postgresPool = isPostgresUrl && databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : null;
export const db = postgresPool ? drizzlePostgres(postgresPool, { schema }) : databaseUrl ? drizzle(databaseUrl, { schema }) : null;
export function requireDb() { if (!db) throw new Error("DATABASE_URL is not configured"); return db; }
