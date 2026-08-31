import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { oauthState } from "../../../../lib/server/auth";
import { jsonError } from "../../../../lib/server/http";
export async function GET(request: Request) { const clientId = process.env.GITHUB_APP_CLIENT_ID; if (!clientId) return jsonError("internal_error", "GitHub OAuth is not configured", 503); const state = oauthState(); const store = await cookies(); store.set("comment_lens_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" }); const url = new URL("https://github.com/login/oauth/authorize"); url.searchParams.set("client_id", clientId); url.searchParams.set("redirect_uri", new URL("/api/auth/github/callback", request.url).toString()); url.searchParams.set("state", state); url.searchParams.set("scope", "read:user"); return NextResponse.redirect(url); }
