import test from "node:test";
import assert from "node:assert/strict";
import { signSession, verifySession } from "../../lib/server/auth";
process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-chars";
process.env.ALLOWED_GITHUB_USER_ID = "42";
test("session signatures round trip and reject tampering", () => { const value = signSession({ login: "tester", githubUserId: "42", exp: Date.now() + 1000 }); assert.equal(verifySession(value)?.login, "tester"); assert.equal(verifySession(value + "x"), null); });
test("expired sessions are rejected", () => { const value = signSession({ login: "tester", githubUserId: "42", exp: Date.now() - 1 }); assert.equal(verifySession(value), null); });
test("sessions for another GitHub user are rejected", () => { const value = signSession({ login: "tester", githubUserId: "43", exp: Date.now() + 1000 }); assert.equal(verifySession(value), null); });
test("weak session configuration fails closed", () => { process.env.SESSION_SECRET = "short"; assert.throws(() => signSession({ login: "tester", githubUserId: "42", exp: Date.now() + 1000 })); process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-chars"; delete process.env.ALLOWED_GITHUB_USER_ID; assert.throws(() => signSession({ login: "tester", githubUserId: "42", exp: Date.now() + 1000 })); process.env.ALLOWED_GITHUB_USER_ID = "42"; });
