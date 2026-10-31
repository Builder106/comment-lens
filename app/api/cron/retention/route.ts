import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { jsonError, handleError } from "@/lib/server/http";
import { purgeExpiredData } from "@/lib/server/retention";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return jsonError("internal_error", "Retention cleanup is not configured", 503);

  const authorization = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) {
    return jsonError("unauthenticated", "Authentication required", 401);
  }

  try {
    return NextResponse.json({ schemaVersion: 1, ...await purgeExpiredData() });
  } catch (error) {
    return handleError(error);
  }
}
