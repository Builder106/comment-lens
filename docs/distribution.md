# Developer distribution and launch playbook

This document outlines the messaging, positioning, channels, and dogfooding tactics for introducing Comment Lens to engineers and engineering teams.

## 1. Positioning and core value

Developers are naturally skeptical of automated code quality and artificial intelligence review tools. Most tools generate false positives, add cognitive noise, or enforce bureaucratic comment coverage requirements.

Comment Lens takes the opposite stance:

- **Zero-noise guarantee**: Comment Lens does not enforce docstring coverage or nag developers to add comments to private functions. It inspects only existing comments.
- **Deterministic first**: Rule evaluation runs locally, quickly, and deterministically without sending source code over the network.
- **Maintenance risk over prose style**: Findings highlight real maintenance debt, such as broken local file paths, abandoned task markers without issue links, comments that duplicate symbol names, and comments whose surrounding code changed.
- **Incremental adoption through baselines**: Teams can adopt Comment Lens without fixing years of historical debt. `.comment-lens-baseline.json` grandfather-in existing findings so CI blocks only new issues.

## 2. Core messaging angles

### Angle A: Stale comments introduce subtle bugs
> "The only thing worse than no documentation is documentation that lies."

When code evolves but comments remain untouched, developers waste hours debugging against outdated implementation details. Comment Lens flags comments whose surrounding implementation has drifted.

### Angle B: Deterministic rules, not AI noise
> "Not an AI code-review nag. 100% deterministic rules."

Many code review bots spam pull requests with generic phrasing advice. Comment Lens keeps artificial intelligence strictly optional, opt-in, and bounded to assistive explanation. The core engine is purely deterministic AST parsing with Tree-sitter and Git context analysis.

### Angle C: Zero-friction adoption
> "Audit your comments without fixing five years of legacy debt first."

The primary obstacle to introducing linting is an initial backlog of hundreds of warnings. Comment Lens allows repositories to snapshot their current state with a baseline and enforce standards strictly on subsequent changes.

## 3. High-signal visual assets

Developer attention is won through concrete terminal interactions, diffs, and clean UI states rather than marketing copy:

1. **Terminal demonstration**: A short recorded terminal session showing `comment-lens check . --changed origin/main...HEAD --fail-on high` catching an unresolved task or broken link.
2. **Before / After examples**: Illustrating an echo comment (`// calculate total price` above `calculateTotalPrice()`) contrasted with a clear explanation of an edge-case rounding constraint.
3. **Workspace interface**: Screenshots of the review grid displaying comments, AST parser context, and deterministic scoring traces together.

## 4. Distribution and outreach channels

### Hacker News (Show HN)
Hacker News responds strongly to transparent, local-first developer utilities with zero network lock-in:
- **Angle**: Explain the motivation (e.g. debugging a production incident caused by a stale comment).
- **Technical specifics**: Detail the Tree-sitter parsing engine, Pygments fallback, and local SARIF generation.
- **Quick start**: Emphasize installation via `pip install comment-lens-scanner` and immediate offline use with `comment-lens check .`.

### Communities (r/Python, r/programming, r/devops)
- **r/Python**: Emphasize fast AST extraction without executing target code or downloading grammars at runtime.
- **r/devops & r/github**: Highlight GitHub Actions integration, SARIF annotations, and zero-debt baseline comparisons.

### GitHub Actions ecosystem
Publish a dedicated action wrapper (e.g., `comment-lens-action`) on the GitHub Marketplace to make pull request checks a one-line addition to existing CI workflows.

### Open-source dogfooding
Run `comment-lens scan` across prominent open-source projects to identify actionable issues, such as broken relative links or stale tasks. Submitting targeted, humble pull requests that fix these findings demonstrates the tool's practical utility.
