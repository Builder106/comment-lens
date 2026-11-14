# Developer distribution and launch playbook

Notes on introducing Comment Lens to developers and engineering teams, including messaging, demonstrations, and ways to use it on real projects.

## 1. Positioning and core value

Comment Lens focuses on existing comments and gives reviewers evidence for each finding:

- **Existing comments only**: The scanner does not enforce docstring coverage or ask developers to add comments to private functions.
- **Deterministic first**: Local rule evaluation runs without sending source code over the network.
- **Maintenance evidence**: Findings can point to broken local paths, task markers without issue links, comments that duplicate symbol names, and changes to surrounding code. A reviewer still decides what needs attention.
- **Baselines**: Teams can record existing findings in `.comment-lens-baseline.json` and configure CI to block only new ones.

## 2. Core messaging angles

### Angle A: Stale comments introduce subtle bugs
> "The only thing worse than no documentation is documentation that lies."

When code changes but a nearby comment does not, the comment may no longer describe the implementation. Comment Lens flags those cases for review.

### Angle B: Deterministic rules, not AI noise
> "Not an AI code-review nag. 100% deterministic rules."

AI assistance is optional and limited to explaining selected findings. The core engine uses deterministic parsing and Git context analysis; Tree-sitter is the primary parser, with a Pygments fallback.

### Angle C: Zero-friction adoption
> "Audit your comments without fixing five years of legacy debt first."

A baseline records findings a team has already reviewed, so it can adopt checks without resolving the entire backlog first.

## 3. High-signal visual assets

Show the tool through terminal output, diffs, and the review workspace:

1. **Terminal demonstration**: A short recorded terminal session showing `comment-lens check . --changed origin/main...HEAD --fail-on high` catching an unresolved task or broken link.
2. **Before / After examples**: Illustrating an echo comment (`// calculate total price` above `calculateTotalPrice()`) contrasted with a clear explanation of an edge-case rounding constraint.
3. **Workspace interface**: Screenshots of the review grid displaying comments, AST parser context, and deterministic scoring traces together.

## 4. Distribution and outreach channels

### Hacker News (Show HN)
For a Show HN post, explain what the tool does and how to try it:
- **Angle**: Explain the motivation (e.g. debugging a production incident caused by a stale comment).
- **Technical specifics**: Detail the Tree-sitter parsing engine, Pygments fallback, and local SARIF generation.
- **Quick start**: Show the repository installation described in the README and local use with `comment-lens check .`. Update this when a package is published.

### Communities (r/Python, r/programming, r/devops)
- **r/Python**: Emphasize fast AST extraction without executing target code or downloading grammars at runtime.
- **r/devops & r/github**: Highlight GitHub Actions integration, SARIF annotations, and zero-debt baseline comparisons.

### GitHub Actions ecosystem
Publish a dedicated action wrapper (e.g., `comment-lens-action`) on the GitHub Marketplace to make pull request checks a one-line addition to existing CI workflows.

### Open-source dogfooding
Run `comment-lens scan` on open-source projects to look for actionable issues, such as broken relative links or stale tasks. Verify each finding against the code before proposing a focused fix.
