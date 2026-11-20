# Comment Lens website design

Comment Lens is a workspace for reviewing hosted scans. It shares findings with the local CLI, CI checks and baselines, maintenance reports, and VS Code adapter.

## The job

A maintainer chooses a repository and scan, finds a comment that needs attention, checks the evidence, records a review decision, and exports the result. One repository and one scan stay in view throughout that work.

Comment Lens identifies comments worth reviewing. A score sets review priority; it is not a verdict about the comment or its author. Every finding needs a rule, source location, and explanation that a developer can inspect without using AI.

## What the reference sites teach us

The research compared [CyberChef](https://github.com/gchq/CyberChef), [Regex101](https://regex101.com/), [jwt.io](https://www.jwt.io/), [Carbon](https://carbon.now.sh/), [DevDocs](https://devdocs.io/), [Can I Use](https://caniuse.com/), and [JSONLint](https://jsonlint.com/json-formatter). Their useful common pattern is a clear task, visible feedback, and an action beside the result. Apply that pattern to Comment Lens:

| Pattern | Workspace decision |
| --- | --- |
| Put the task first | After sign-in, show the selected repository and scan or the next action needed to reach a review queue. |
| Keep input, controls, and result together | Place repository and scan context above the queue. Keep the selected comment and its evidence beside the queue on wide screens. |
| Explain results where they appear | Show the rule, path, line, comment, short source context, and reason for each selected finding. Explain what the score means nearby. |
| Reveal depth as needed | Keep search and common filters close to the queue. Put detailed filters, maintenance history, and optional AI guidance behind clear controls. |
| Support the next action | Keep the review decision and note with the selected comment. Keep export near the completed review work. |
| Earn trust | Explain what a scan reads and retains. Show what an optional AI request sends before the user makes it. Keep code and reports selectable as text. |

Apply these interaction patterns in Comment Lens's existing visual language.

## Primary review journey

1. Choose the source. If GitHub is disconnected or no repository is available, show the exact next action. Otherwise show the repository, ref, selected scan, and its state together. Before starting a scan, state that it reads repository files and retains comments with short context.
2. Wait for a complete scan. Show queued, running, and failed states in the same repository context. A failed or incomplete scan must not appear as a finished review queue.
3. Find a comment. Order the queue by review priority by default. Each row should show a path and line, comment excerpt, leading rule when one exists, priority, and review state. Search, sort, and filters help narrow the queue without hiding its scan context.
4. Inspect the evidence. Selecting a row opens the comment with short source context, deterministic findings, score explanation, and available provenance. A protected comment or a comment with no triggered rule needs a plain explanation instead of an unexplained number.
5. Record the decision. Keep, Rewrite, Delete, and Unsure record review intent and may include a private note. They do not edit repository files. The selected state should remain visible in the queue and detail view. Export decisions from the same workspace.

The local CLI, CI checks, and editor diagnostics use the scanner's findings and identifiers. Link to their instructions from the workspace and documentation. The hosted review journey remains the main task on this page.

## Supporting views

Maintenance history is a secondary view of hosted scans and an explicitly opened local or CI summary. Label each report's source and coverage. A partial or failed report cannot establish that a finding was resolved. An imported summary stays in the browser tab and is not uploaded.

Optional Gemini guidance belongs to one selected finding. Keep deterministic evidence visible first. The request sends the comment and that rule's evidence by default; including stored short code context requires a separate choice. Guidance can suggest what to review or text to copy into a note, but it cannot change scores, decisions, CI policy, or repository files. The existing style assessment remains a separate action.

## Layout and visual direction

Use a compact header for Comment Lens, documentation, and the workspace. Keep the repository and scan context above the working area. On wide screens, pair the queue with the selected comment's evidence and review controls. Place filters close to the queue and let detailed options open when requested. On narrow screens, show the queue first and open the detail as a focused panel with a clear way back.

Use neutral gray-white surfaces, graphite text, and cobalt accents, with sans and monospace type, thin rules, and restrained corners. Paths, rules, refs, and code use monospace. The comment and evidence carry the visual weight. Use words for states and decisions so color is never the only signal. Avoid decorative gradients, status dots, accent rails, and small uppercase labels above headings.

### Composition and craft

The page is a working document for one scan. A compact source bar establishes the repository, ref, scan, and export. The queue forms its left margin; the selected comment, code, findings, and decision read as the main document on the right. The selected finding's score contribution becomes a horizontal evidence trace beside its explanation. Trace lengths come from the scanner's `contribution` values and are labeled in text. This helps reviewers compare rule evidence without turning it into an analytics chart. Build the layout around the selected comment and its evidence, with the queue close by for comparison.

Use three clear type steps: a 30-36px workspace title, 18-22px comment and panel headings, and 14-16px body text. Reserve 12-13px monospace for paths, refs, rule IDs, and code. Keep the queue dense enough to compare comments; give the selected source and explanation generous line height and space. Rules divide the source bar, queue rows, and evidence entries only. Avoid boxes around every piece of metadata. Use sentence case labels and visible text states rather than a wall of tiny uppercase labels.

CyberChef informs the proximity of source, controls, and result. Regex101 informs rule feedback beside the examined text. DevDocs informs the dense, searchable queue and open reading area. The replacement frontend starts from a blank surface while keeping the API contracts, hosted review journey, and neutral gray-white and cobalt palette.

## Interaction and accessibility

Keyboard users must be able to choose a repository and scan, filter the queue, open a comment, read its evidence, record a decision, and export. Give selected rows and pressed decisions an announced state. Move focus into a mobile detail panel and return it to the opening control when the panel closes. Announce scan updates, failures, saved decisions, and copy results without interrupting reading.

Keep source context and exported results as selectable text. Let long paths and code wrap or scroll inside their own region without forcing horizontal page scrolling. Preserve visible focus and readable contrast. Respect reduced-motion settings; use motion only when it helps explain a state change.

## Review criteria for the replacement workspace

- A developer can tell which repository, ref, and scan produced the queue.
- A selected comment shows why it needs attention before any optional AI request.
- A review decision is visible after selection and can be exported.
- Empty, loading, failed, protected, and filtered states each explain what happened and what to do next.
- The interface makes scan retention, local summary import, and optional AI data sharing clear at the point of use.

Browser coverage should be added for these journeys before restoring a release gate.

## Landing page (2026-11-15)

The first landing page (2026-11-14) was a `comment-lens check` report with a `--fail-on` toy. It read as generated: markdown `#` prefixes on headings, four tables of another project's numbers, every block the same weight. This version replaces it. The hosted workspace stays at `/workspace`.

### What the reference sites taught

Ruff, Biome, Vale, Bun, Ghostty, Charm, Knip, esbuild, Oxc and Zed, studied 2026-11-15:

- One short claim, set large, then one supporting line and an install command with a copy button.
- One proof, not a data dump. esbuild is barely styled and still convincing because one chart carries it.
- The product shown where it lives: a real terminal (Ghostty), a real editor (Zed), or Vale's guideline, rule and squiggle panels.
- A mark built on one idea (Knip's scissors, Bun's dumpling).
- Short pages that hand off to the docs.

### Concept card

```
Idea:        Follow one real comment through its own git history until Comment Lens flags it.
Metaphor:    A blame view. Every line carries the date git says it last changed.
Anchor:      nearby_code_changed compares the blame date of a comment with the blame date of the
             code beside it. No other linter reads the age of a comment against its code.
Signature:   The story stage. The real file at three commits: the comment's own commit (2018),
             the commit that removed the check it describes (2022), and the head commit (2026),
             where an amber highlight sweeps over the comment and a squiggle draws under it.
Emotion:     In three seconds: this is real code from a real project, and I have comments like this.
Motion verb: Replace like a diff. A changed line slides out upward while its new text slides in from
             below, and its blame date changes with it. Only lines that really changed move.
Screenshot:  The highlighted comment over `if disable_colors:`, with the two dates 2018-01-12 and
             2022-10-08 below it.
Structure:   The home page is one sticky stage beside five chapters (2018 comment, 2022 code change,
             2026 check, baseline, exit 1). The chapter rail above the stage is the in-page
             navigation. After the story, an index of the eleven rules (one page each) and the commands.
Escape hatch: Every chapter is a real section with an id, the rail links are plain anchors, and every
             rule has its own URL. Without JavaScript each phone snapshot shows its own state.
```

Concepts considered and dropped: a lens over a file that dims code and focuses comments (taken from the product name, fits any focus tool), and a terminal session as the page (fits any CLI). The blame view is the only one built on a fact of this tool.

### Data honesty

- The story file is `pwndbg/color/syntax_highlight.py`. `scripts/landing-drift.py` builds `lib/landing/drift.json` from `git blame` in a full clone, with dates in UTC so they match the finding's evidence. `tests/server/landing-drift.test.ts` checks that the first state is the comment's commit, that the head state's blame matches the evidence, and that the comment text never changes.
- The commit that removed the check, `13e1608` ("Cleanup dependencies (#1251)"), replaced a `try: import pygments ... except ImportError` block with a plain import. The copy says exactly that and no more.
- The terminal panel is the real `comment-lens compare --fail-on high` output, trimmed to its header and one blocking finding. The trims are marked with the number of omitted lines, and the exit status is the one the command returned.
- Bar chart numbers and rule counts come from `lib/landing/report.json`, as before.

### System

- Palette: ground `#fbfbfc`, ink `#111317`, muted `#545a62`, line `#e2e4e8`, amber `#f2b705` (the highlight, always under ink text), panel `#121417` with panel ink `#e6e8eb` and panel muted `#8e959e`. Diff green `#7ee2a0` marks only the code line a finding cites.
- Type: Instrument Sans for prose and headings, Geist Mono for code, data and the rail. Familjen Grotesk was tried first and dropped: its spacing broke at body sizes ("Pyt hon").
- Mark: drawn in Glaxnimate (`design/marks/`). A `//` comment marker whose second stroke has drifted out of step with the first. The workspace header uses it too.
- Shape: 10 to 12px radius on dark panels, none elsewhere.
- Motion: CSS transitions on `transform`, `opacity` and `clip-path`, driven by one `IntersectionObserver` that sets the active chapter. No scroll listeners, no animation loop, no GSAP: the motion is discrete state changes, so a library adds nothing. Primary links answer with the amber highlight sweep. On load, the stage file enters like blame output, one line at a time from the top, and the mark's amber stroke slips out of step; both are CSS keyframes that run once. Reduced motion removes every transition and animation and shows final states.
- Idle state: the terminal caret blinks. Everything else rests, by decision; the story moves only when the reader does.

### Structure plan

```
Desktop (1000+)                                       Phone (390)
+-------------------+-------------------------------+ +---------------------------+
| // Comment Lens   |                Rules Docs GitHub| | //          Rules Docs GH |
| h1 claim          | [2018][2022][2026][base][exit]| | h1, lede, install         |
| lede, install     | +---------------------------+ | | [file at 2018]            |
|                   | | file at the active commit | | | 2022 chapter text         |
| 2022 chapter      | | blame | n | code          | | | [file at 2022]            |
| 2026 chapter      | | evidence: two dates       | | | 2026 chapter text         |
| baseline chapter  | +---------------------------+ | | [file at 2026, flagged]   |
| exit 1 chapter    |  (sticky; swaps to the chart  | | baseline text, [chart]    |
|                   |   and the terminal)           | | exit 1 text, [terminal]   |
+-------------------+-------------------------------+ | Rules (grouped), Run it   |
| Eleven rules: group title | rule rows with counts | | footer                    |
| Run it: three commands, limits paragraph          | +---------------------------+
+---------------------------------------------------+
/rules/<rule>: one column document with a real pwndbg example.
404: "This page has no history." with the real `git blame` error.
```
