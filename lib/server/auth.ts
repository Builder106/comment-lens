import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
const sessionCookie = "comment_lens_session";
export interface SessionPayload { login: string; githubUserId: string; exp: number }
function secret() { const value = process.env.SESSION_SECRET; if (!value || value.length < 32) throw new Error("SESSION_SECRET must be configured with at least 32 characters"); return value; }
function allowedUserId() { const value = process.env.ALLOWED_GITHUB_USER_ID; if (!value || !/^\d+$/.test(value)) throw new Error("ALLOWED_GITHUB_USER_ID must be configured as a numeric GitHub user ID"); return value; }
export function signSession(payload: SessionPayload) { allowedUserId(); const body = Buffer.from(JSON.stringify(payload)).toString("base64url"); return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`; }
export function verifySession(value: string | undefined) { if (!value) return null; const [body, mac, extra] = value.split("."); if (!body || !mac || extra) return null; let expected: string; try { expected = createHmac("sha256", secret()).update(body).digest("base64url"); } catch { return null; } if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null; try { const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload; return parsed.exp > Date.now() && Boolean(parsed.login) && Boolean(parsed.githubUserId) && parsed.githubUserId === allowedUserId() ? parsed : null; } catch { return null; } }
export function verifyApiAuthorization(authorization: string): SessionPayload | null {
  const match = /^Bearer ([A-Za-z0-9_-]{43,256})$/i.exec(authorization);
  const digest = process.env.COMMENT_LENS_API_TOKEN_SHA256;
  const login = process.env.COMMENT_LENS_API_LOGIN;
  if (!match || !digest || !/^[a-f0-9]{64}$/i.test(digest) || !login || !/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(login)) return null;
  const actual = createHash("sha256").update(match[1]).digest();
  if (!timingSafeEqual(actual, Buffer.from(digest, "hex"))) return null;
  try {
    return { login, githubUserId: allowedUserId(), exp: Number.MAX_SAFE_INTEGER };
  } catch {
    return null;
  }
}

export async function requireSession(request?: Request) {
  const authorization = request?.headers.get("authorization");
  if (authorization !== null && authorization !== undefined) {
    const session = verifyApiAuthorization(authorization);
    if (!session) throw new Error("UNAUTHORIZED");
    return session;
  }
  const store = await cookies();
  const session = verifySession(store.get(sessionCookie)?.value);
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}
export function setSession(login: string, githubUserId: string) { if (githubUserId !== allowedUserId()) throw new Error("FORBIDDEN"); return { name: sessionCookie, value: signSession({ login, githubUserId, exp: Date.now() + 86_400_000 }), httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 86_400 }; }
export function oauthState() { return randomBytes(24).toString("base64url"); }
