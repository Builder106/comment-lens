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

1. **Choose the source.** If GitHub is disconnected or no repository is available, show the exact next action. Otherwise show the repository, ref, selected scan, and its state together. Before starting a scan, state that it reads repository files and retains comments with short context.
2. **Wait for a complete scan.** Show queued, running, and failed states in the same repository context. A failed or incomplete scan must not appear as a finished review queue.
3. **Find a comment.** Order the queue by review priority by default. Each row should show a path and line, comment excerpt, leading rule when one exists, priority, and review state. Search, sort, and filters help narrow the queue without hiding its scan context.
4. **Inspect the evidence.** Selecting a row opens the comment with short source context, deterministic findings, score explanation, and available provenance. A protected comment or a comment with no triggered rule needs a plain explanation instead of an unexplained number.
5. **Record the decision.** Keep, Rewrite, Delete, and Unsure record review intent and may include a private note. They do not edit repository files. The selected state should remain visible in the queue and detail view. Export decisions from the same workspace.

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

## Landing page (2026-11-14)

The landing page replaces the signed-out workspace welcome on `/`. The hosted workspace moves to `/workspace`. The audience is developers who maintain a repository and would run the CLI before they sign in anywhere. The hosted workspace is limited to one GitHub account, so the page leads with the CLI and does not invite strangers to sign in.

### Concept card

```
Idea:        The page is the output of `comment-lens check` on a real project, and the visitor sets the gate that decides its exit status.
Metaphor:    A CI report: summary line, findings with severity and baseline state, then an exit status.
Anchor:      Comment Lens produces a report with `new`, `existing` and `resolved` findings and exit status 0, 1 or 2. A first run on a real repository finds far more than anyone will fix, and the baseline is what makes a gate usable.
Signature:   The gate. Four `--fail-on` levels and a baseline switch re-label every finding (blocking, advisory, existing) and flip the exit line between 0 and 1. Every number comes from a real run of the CLI.
Emotion:     In three seconds: this is real output, I can read it, and I could run it on my repository today.
Motion verb: Stamp. A label changes by settling 2px into place in 140 ms. Nothing counts up, slides or fades in on scroll.
Screenshot:  The summary block reading `Blocking: 53` and `exit 1`, beside the baseline switch that takes it to `exit 0`.
Structure:   The site is one report. A fixed console on the left holds the claim, the install line and the gate. The report scrolls on the right. The rule table inside the report is the navigation and links to one page per rule. One unit is a finding; opening it shows the comment, its evidence and a permalink.
Escape hatch: The report is plain text in a table and `<details>` elements, and every rule has its own URL. A static table of all eight gate outcomes sits below the controls for readers without JavaScript.
```

### Data honesty

- The findings come from `comment-lens` run on `pwndbg/pwndbg` at a pinned commit. The baseline was created at an older pinned commit of the same project. Exit codes in the gate table are the exit codes the CLI returned. `scripts/landing-report.py` rebuilds `lib/landing/report.json` from those runs.
- The page lists a sample of the findings and says how many exist. It does not rank or characterize the project.
- Install instructions use the git URL until a package is published.

### System

- Palette: the workspace palette. Ground `#f4f5f7`, surface `#ffffff`, ink `#24272b`, muted `#5b6066`, line `#d9dde3`, cobalt `#315cc6`, cobalt text `#23449d`. Muted text darkened from `#72777c` (4.14:1) to pass AA on the ground.
- State labels are words (`blocking`, `advisory`, `existing`, `resolved`), never color alone.
- Type: Schibsted Grotesk for prose and headings, JetBrains Mono for the report. Report headings use the report's own form, `path:line: rule (severity, state)`.
- Idle state: still. A report does not move at rest. The gate change and the open/close of a finding carry the motion. Reduced motion removes the stamp.

### Structure plan

```
Desktop (1200+)                                  Phone (390)
+-----------------+-------------------------+    +---------------------------+
| Comment Lens    | # Comment Lens report   |    | Comment Lens   Rules  Docs|
| h1, pitch       | Repository, Commit,     |    | h1, pitch                 |
| install         | Comments, Blocking      |    | install                   |
| GATE            | By rule (table, links)  |    | GATE                      |
|  --fail-on  o o | Findings (details)      |    | # report summary          |
|  [x] baseline   | Run it on your repo     |    | By rule                   |
| exit 1          | What it does not do     |    | Findings                  |
| (sticky)        | Hosted workspace        |    | Run it                    |
+-----------------+-------------------------+    | [sticky] exit 1 | 53 block|
                                                 +---------------------------+
/rules/<rule>: the same console column, the rule's definition, config, one real finding.
404: the report with `error: ... does not exist` and `exit 2`.
```
