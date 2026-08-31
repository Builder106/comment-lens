import test from "node:test";
import assert from "node:assert/strict";
import { assertScanOwner } from "../../lib/server/data";
test("scan ownership rejects a different GitHub user", () => { assert.throws(() => assertScanOwner({ ownerId: "42" }, { login: "other", githubUserId: "43", exp: Date.now() + 1000 }), /FORBIDDEN/); });
test("scan ownership accepts the owning GitHub user", () => { assert.doesNotThrow(() => assertScanOwner({ ownerId: "42" }, { login: "owner", githubUserId: "42", exp: Date.now() + 1000 })); });
