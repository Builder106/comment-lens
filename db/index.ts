import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.COMMENT_LENS_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const isPostgresUrl = databaseUrl?.startsWith("postgres://") || databaseUrl?.startsWith("postgresql://");
const postgresPool = isPostgresUrl && databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : null;
const postgresDb = postgresPool ? drizzlePostgres(postgresPool, { schema }) : null;
export const db = postgresDb ?? (databaseUrl ? drizzle(databaseUrl, { schema }) : null);
export function requireDb() { if (!db) throw new Error("DATABASE_URL is not configured"); return db; }
export function requireTransactionalDb() { if (!postgresDb) throw new Error("A PostgreSQL connection URL is required for transactional operations"); return postgresDb; }
