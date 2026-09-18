import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { CONTRACT_SCHEMA_VERSION } from "../../contracts";

type ErrorCode = "invalid_request" | "unauthenticated" | "forbidden" | "not_found" | "conflict" | "invalid_signature" | "stale_request" | "incompatible_schema" | "scan_failed" | "internal_error";

export function jsonError(code: ErrorCode, message: string, status: number) {
  return NextResponse.json({ schemaVersion: CONTRACT_SCHEMA_VERSION, error: { code, message, requestId: randomUUID() } }, { status });
}

export function handleError(error: unknown) {
  if (error instanceof ZodError) return jsonError("invalid_request", "Invalid request payload", 400);
  const code = error instanceof Error ? error.message : "";
  if (code === "UNAUTHORIZED") return jsonError("unauthenticated", "Authentication required", 401);
  if (code === "FORBIDDEN") return jsonError("forbidden", "Access denied", 403);
  if (code === "NOT_FOUND") return jsonError("not_found", "Resource not found", 404);
  console.error("comment-lens request failed", error instanceof Error ? error.name : "unknown error");
  return jsonError("internal_error", "Internal server error", 500);
}

export function cursorResponse<T>(items: T[], cursor: string | null, hasMore: boolean) {
  return NextResponse.json({ schemaVersion: CONTRACT_SCHEMA_VERSION, items, pageInfo: { nextCursor: cursor, hasMore } });
}
