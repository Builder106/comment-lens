import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const repository = {
  id: "repo-1",
  owner: "Builder106",
  name: "code-wes-projects",
  defaultBranch: "main",
  private: true,
};

const completedScan = {
  scanId: "scan-1",
  status: "complete",
  repository: "Builder106/code-wes-projects",
  ref: "main",
  resolvedCommit: "abc123456789",
  commentCount: 1,
  fileCount: 1,
  chunkCount: 1,
  diagnostics: [],
  createdAt: "2026-08-31T12:00:00.000Z",
  completedAt: "2026-08-31T12:01:00.000Z",
};

const comment = {
  commentId: "comment-1",
  scanId: "scan-1",
  path: "src/rank.ts",
  language: "typescript",
  kind: "line",
  placement: "leading",
  rawText: "// similarity score",
  bodyText: "The similarity score ranks results.",
  rawSpan: {
    startByte: 0,
    endByte: 20,
    start: { line0: 10, columnByte0: 0 },
    end: { line0: 10, columnByte0: 20 },
    endExclusive: true,
    precision: "exact",
  },
  bodySpan: null,
  fragments: [],
  tags: [],
  parser: "tree-sitter",
  symbol: null,
  sourceContext: "const rankResults = () => true;\n// similarity score",
  git: { available: false, primaryCommit: null, blameSpans: [], error: null },
  score: {
    eligible: true,
    priorityScore: 42,
    band: "high",
    ruleSetVersion: "1",
    findings: [{ ruleId: "restates_symbol", contribution: 14, evidence: {}, explanation: "Repeats the symbol name." }],
  },
};

async function installDashboardRoutes(page: Page, options: { scans?: unknown[]; scanCreateError?: string } = {}) {
  const scans = options.scans ?? [];
  await page.route("**/api/repositories", (route) => route.fulfill({ json: { schemaVersion: 1, repositories: [repository] } }));
  await page.route(/\/api\/scans(?:\?|$)/, async (route) => {
    if (route.request().method() === "POST") {
      if (options.scanCreateError) {
        await route.fulfill({ status: 502, json: { schemaVersion: 1, error: { code: "scan_failed", message: options.scanCreateError, requestId: "request-1" } } });
        return;
      }
      await route.fulfill({ status: 202, json: { schemaVersion: 1, ...completedScan } });
      return;
    }
    await route.fulfill({ json: { schemaVersion: 1, scans } });
  });
  await page.route("**/api/scans/scan-1", (route) => route.fulfill({ json: { schemaVersion: 1, ...completedScan } }));
  await page.route(/\/api\/scans\/scan-1\/comments/, (route) => route.fulfill({
    json: { schemaVersion: 1, items: [comment], decisions: [], page: 1, pageSize: 50, total: 1, hasNextPage: false, nextPage: null },
  }));
  await page.route("**/api/comments/comment-1/assessment", (route) => route.fulfill({
    json: {
      schemaVersion: 1,
      assessment: {
        schemaVersion: 1,
        commentId: "comment-1",
        providerId: "google",
        modelId: "gemini-3.5-flash-lite",
        promptVersion: "1",
        styleLabel: "template_like",
        confidence: 0.78,
        reasons: ["The comment explains an obvious operation."],
        suggestedRewrite: null,
        assessedAt: new Date().toISOString(),
      },
    },
  }));
  await page.route("**/api/comments/comment-1/review", (route) => route.fulfill({
    json: { schemaVersion: 1, decision: { commentId: "comment-1", status: "rewrite", note: null, updatedAt: new Date().toISOString() } },
  }));
}

async function openReviewQueue(page: Page) {
  await installDashboardRoutes(page);
  await page.goto("/");
  const commentsResponse = page.waitForResponse((response) => response.url().includes("/api/scans/scan-1/comments"));
  await page.getByRole("button", { name: /start scan|run scan/i }).click();
  await commentsResponse;
  await expect(page.getByRole("button", { name: /similarity score/i })).toBeVisible();
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe("Comment Lens dashboard phases", () => {
  test("presents one GitHub connection action before authentication", async ({ page }) => {
    await page.route("**/api/repositories", (route) => route.fulfill({
      status: 401,
      json: { schemaVersion: 1, error: { code: "unauthenticated", message: "Authentication required" } },
    }));
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /connect a repository/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /connect github/i })).toHaveAttribute("href", "/api/auth/github");
    await expect(page.getByRole("button", { name: /start scan|run scan/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /review queue/i })).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test("explains GitHub App access when authentication has no repositories", async ({ page }) => {
    await page.route("**/api/repositories", (route) => route.fulfill({ json: { schemaVersion: 1, repositories: [] } }));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /no repository access/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /refresh repositories/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /review queue/i })).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test("shows selected repository and one scan action before the first scan", async ({ page }) => {
    await installDashboardRoutes(page);
    await page.goto("/");
    await expect(page.getByLabel("Repository context").getByText("Builder106/code-wes-projects")).toBeVisible();
    await expect(page.getByLabel("Repository context").getByText("main")).toBeVisible();
    await expect(page.getByText(/retains comments and short context/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /start scan/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /review queue/i })).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test("shows scan-start failures instead of silently staying ready", async ({ page }) => {
    await installDashboardRoutes(page, { scanCreateError: "Workflow dispatch failed." });
    await page.goto("/");
    await page.getByRole("button", { name: /start scan/i }).click();
    await expect(page.getByRole("alert")).toContainText("Workflow dispatch failed.");
    await expect(page.getByRole("button", { name: /start scan/i })).toBeEnabled();
    await expect(page.getByRole("heading", { name: /scan in progress/i })).toHaveCount(0);
  });

  test("reports queued scans without exposing a review queue", async ({ page }) => {
    await installDashboardRoutes(page, { scans: [{ ...completedScan, status: "queued", completedAt: null }] });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /scan in progress/i })).toBeVisible();
    await expect(page.getByRole("status")).toContainText(/read-only/i);
    await expect(page.getByRole("heading", { name: /review queue/i })).toHaveCount(0);
  });

  test("reports failures with an explicit retry action", async ({ page }) => {
    await installDashboardRoutes(page, { scans: [{ ...completedScan, status: "failed", completedAt: null }] });
    await page.goto("/");
    await expect(page.getByRole("alert").filter({ hasText: /scan failed/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /retry scan/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /review queue/i })).toHaveCount(0);
    await expectNoAxeViolations(page);
  });
});

test.describe("Comment Lens review workspace", () => {
  test.beforeEach(({ page }) => openReviewQueue(page));

  test("uses semantic queue and selected detail surfaces", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /review queue/i })).toBeVisible();
    await expect(page.getByLabel(/comments? queue/i)).toBeVisible();
    await page.getByRole("button", { name: /similarity score/i }).click();
    await expect(page.getByRole("complementary", { name: /comment detail/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /comment detail/i })).toBeVisible();
    await expect(page.getByLabel(/source context/i)).toContainText("rankResults");
    await expect(page.getByRole("heading", { name: /deterministic findings/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /assess style/i })).toBeVisible();
    for (const decision of ["Keep", "Rewrite", "Delete", "Unsure"]) {
      await expect(page.getByRole("button", { name: decision, exact: true })).toBeVisible();
    }
  });

  test("keeps Gemini assessment secondary and preserves source read-only behavior", async ({ page }) => {
    await page.getByRole("button", { name: /similarity score/i }).click();
    await page.getByRole("button", { name: /assess style/i }).click();
    await expect(page.getByRole("status")).toContainText(/template-like/i);
    await page.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(page.getByText(/source files are read-only/i)).toBeVisible();
  });

  test("sends server-side filtering, sorting, and review updates", async ({ page }) => {
    const request = page.waitForRequest((item) => item.url().includes("/api/scans/scan-1/comments") && item.url().includes("path="));
    const filterToggle = page.getByRole("button", { name: /^filters$/i });
    if (await filterToggle.isVisible()) await filterToggle.click();
    await page.getByLabel(/path contains/i).fill("src/");
    const url = new URL((await request).url());
    expect(url.searchParams.get("path")).toBe("src/");
    expect(url.searchParams.get("pageSize")).toBe("50");
    expect(url.searchParams.get("sort")).toBe("score");

    const closeFilters = page.getByRole("button", { name: /close filters/i });
    if (await closeFilters.isVisible()) await closeFilters.click();

    await page.getByRole("button", { name: /similarity score/i }).click();
    const reviewRequest = page.waitForRequest((item) => item.url().includes("/api/comments/comment-1/review") && item.method() === "PATCH");
    await page.getByRole("button", { name: "Rewrite", exact: true }).click();
    expect(JSON.parse((await reviewRequest).postData() ?? "{}")).toMatchObject({ schemaVersion: 1, status: "rewrite" });
  });

  test("announces Gemini assessment failures", async ({ page }) => {
    await page.unroute("**/api/comments/comment-1/assessment");
    await page.route("**/api/comments/comment-1/assessment", (route) => route.fulfill({
      status: 502,
      json: { schemaVersion: 1, error: { code: "internal_error", message: "Assessment unavailable", requestId: "request-1" } },
    }));
    await page.getByRole("button", { name: /similarity score/i }).click();
    await page.getByRole("button", { name: /assess style/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Assessment unavailable" })).toBeVisible();
  });

  test("passes axe checks for queue and selected detail states", async ({ page }) => {
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: /similarity score/i }).click();
    await expectNoAxeViolations(page);
  });
});

test.describe("Comment Lens keyboard and reflow", () => {
  test("keeps the skip link, OAuth action, and start scan operable from the keyboard", async ({ page }) => {
    await page.route("**/api/repositories", (route) => route.fulfill({
      status: 401,
      json: { schemaVersion: 1, error: { code: "unauthenticated", message: "Authentication required" } },
    }));
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /skip to workspace/i })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /connect github/i })).toBeFocused();

    await page.unroute("**/api/repositories");
    await installDashboardRoutes(page);
    await page.reload();
    const startScan = page.getByRole("button", { name: /start scan/i });
    await startScan.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /similarity score/i })).toBeVisible();
  });

  test("supports slash search, queue navigation, close-and-restore-focus, and review actions", async ({ page }) => {
    await openReviewQueue(page);
    await page.setViewportSize({ width: 320, height: 800 });
    const filters = page.getByRole("button", { name: /^filters$/i });
    await filters.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("complementary", { name: /comment filters/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(filters).toBeFocused();
    await page.keyboard.press("/");
    await expect(page.getByLabel(/search comments/i)).toBeFocused();
    await page.keyboard.press("Escape");
    await page.keyboard.press("j");
    await expect(page.getByRole("complementary", { name: /comment detail/i })).toBeVisible();
    await page.getByRole("button", { name: /close detail/i }).focus();
    await page.keyboard.press("Enter");
    await expect(filters).toBeFocused();
    await page.getByRole("button", { name: /open detail/i }).click();
    await page.getByRole("button", { name: "Keep", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/marked src\/rank\.ts as keep/i)).toBeVisible();
  });

  for (const width of [1280, 768, 414, 375, 320]) {
    test(`keeps essential workspace controls reachable at ${width}px`, async ({ page }) => {
      await openReviewQueue(page);
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("heading", { name: /review queue/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /similarity score/i })).toBeVisible();
      await expect(page.getByLabel(/sort comments/i)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    });
  }

  test("passes axe in the mobile workspace and error state", async ({ page }) => {
    await openReviewQueue(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await expectNoAxeViolations(page);
    await page.unroute("**/api/repositories");
    await page.route("**/api/repositories", (route) => route.fulfill({
      status: 500,
      json: { schemaVersion: 1, error: { code: "internal_error", message: "Repository service unavailable" } },
    }));
    await page.reload();
    await expect(page.getByRole("alert").filter({ hasText: /repository service unavailable/i })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
