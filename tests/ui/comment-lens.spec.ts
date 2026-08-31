import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Comment Lens dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/repositories", (route) => route.fulfill({ json: { schemaVersion: 1, repositories: [{ id: "repo-1", owner: "Builder106", name: "code-wes-projects", defaultBranch: "main", private: true }] } }));
    await page.route(/\/api\/scans(?:\?|$)/, async (route) => { if (route.request().method() === "POST") await route.fulfill({ status: 202, json: { schemaVersion: 1, scanId: "scan-1", status: "complete" } }); else await route.fulfill({ json: { schemaVersion: 1, scans: [] } }); });
    await page.route(/\/api\/scans\/scan-1\/comments/, (route) => route.fulfill({ json: { schemaVersion: 1, items: [{ commentId: "comment-1", scanId: "scan-1", path: "src/rank.ts", language: "typescript", kind: "line", placement: "leading", rawText: "// similarity score", bodyText: "The similarity score ranks results.", rawSpan: { startByte: 0, endByte: 20, start: { line0: 10, columnByte0: 0 }, end: { line0: 10, columnByte0: 20 }, endExclusive: true, precision: "exact" }, bodySpan: null, fragments: [], tags: [], parser: "tree-sitter", symbol: null, sourceContext: "const rankResults = () => true;\n// similarity score", git: { available: false, primaryCommit: null, blameSpans: [], error: null }, score: { eligible: true, priorityScore: 42, band: "high", ruleSetVersion: "1", findings: [{ ruleId: "restates_symbol", contribution: 14, evidence: {}, explanation: "Repeats the symbol name." }] } }], decisions: [], page: 1, pageSize: 50, total: 1, hasNextPage: false, nextPage: null } }));
    await page.route("**/api/comments/comment-1/assessment", (route) => route.fulfill({ json: { schemaVersion: 1, assessment: { schemaVersion: 1, commentId: "comment-1", providerId: "google", modelId: "gemini-3.5-flash-lite", promptVersion: "1", styleLabel: "template_like", confidence: 0.78, reasons: ["The comment explains an obvious operation."], suggestedRewrite: null, assessedAt: new Date().toISOString() } } }));
    await page.route("**/api/comments/comment-1/review", (route) => route.fulfill({ json: { schemaVersion: 1, decision: { commentId: "comment-1", status: "rewrite", note: null, updatedAt: new Date().toISOString() } } }));
    await page.goto("/");
    const commentsResponse = page.waitForResponse((response) => response.url().includes("/api/scans/scan-1/comments"));
    await page.getByRole("button", { name: "Run scan" }).click();
    await commentsResponse;
    await expect(page.getByRole("button", { name: /similarity score/i })).toBeVisible();
  });

  test("supports queue search and detail selection", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Review code comments" })).toBeVisible();
    const mobileFilters = page.getByRole("button", { name: "Filters", exact: true });
    if (await mobileFilters.isVisible()) await mobileFilters.click();
    await page.getByLabel("Search comments").fill("similarity");
    await expect(page.getByRole("button", { name: /similarity score/i })).toBeVisible();
    if (await mobileFilters.isVisible()) await page.getByRole("button", { name: "Close filters" }).click();
    await page.getByRole("button", { name: /similarity score/i }).click();
    await expect(page.getByRole("heading", { name: "Comment detail" })).toBeVisible();
    await expect(page.getByText("rankResults")).toBeVisible();
  });

  test("reviews without mutating source files", async ({ page }) => {
    if (await page.getByRole("button", { name: "Open detail" }).isVisible()) await page.getByRole("button", { name: "Open detail" }).click();
    await page.getByRole("button", { name: "Assess style" }).click();
    await expect(page.getByRole("status")).toContainText("Template-like");
    await page.getByRole("button", { name: "Rewrite" }).last().click();
    await expect(page.getByText("Rewrite", { exact: true }).last()).toBeVisible();
    await expect(page.getByText(/Source files are read-only/)).toBeVisible();
  });

  test("supports keyboard search and mobile filter controls", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.getByRole("button", { name: "Filters" }).click();
    await expect(page.getByRole("heading", { name: "Filter queue" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Filters" })).toBeFocused();
    await page.keyboard.press("/");
    await expect(page.getByLabel("Search comments")).toBeFocused();
  });

  test("denies unauthenticated API access", async ({ request }) => {
    const response = await request.get("/api/repositories");
    expect(response.status()).toBe(401);
  });

  test("sends filters, sorting, and pagination to the server", async ({ page }) => {
    const mobileFilters = page.getByRole("button", { name: "Filters", exact: true });
    if (await mobileFilters.isVisible()) await mobileFilters.click();
    const request = page.waitForRequest((item) => item.url().includes("/api/scans/scan-1/comments") && item.url().includes("path="));
    await page.getByLabel("Path contains").fill("src/");
    const sent = await request;
    const url = new URL(sent.url());
    expect(url.searchParams.get("path")).toBe("src/");
    expect(url.searchParams.get("pageSize")).toBe("50");
    expect(url.searchParams.get("sort")).toBe("score");
  });

  test("persists review decisions without touching source files", async ({ page }) => {
    if (await page.getByRole("button", { name: "Open detail" }).isVisible()) await page.getByRole("button", { name: "Open detail" }).click();
    const request = page.waitForRequest((item) => item.url().includes("/api/comments/comment-1/review") && item.method() === "PATCH");
    await page.getByRole("button", { name: "Rewrite" }).last().click();
    const sent = await request;
    expect(JSON.parse(sent.postData() ?? "{}")).toMatchObject({ schemaVersion: 1, status: "rewrite" });
    await expect(page.getByText(/Source files are read-only/)).toBeVisible();
  });

  test("shows Gemini assessment failures as a review error", async ({ page }) => {
    await page.unroute("**/api/comments/comment-1/assessment");
    await page.route("**/api/comments/comment-1/assessment", (route) => route.fulfill({ status: 502, json: { schemaVersion: 1, error: { code: "internal_error", message: "Assessment unavailable", requestId: "request-1" } } }));
    if (await page.getByRole("button", { name: "Open detail" }).isVisible()) await page.getByRole("button", { name: "Open detail" }).click();
    await page.getByRole("button", { name: "Assess style" }).click();
    await expect(page.getByRole("alert")).toContainText("Assessment unavailable");
  });

  test("passes axe checks for the selected queue view", async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
