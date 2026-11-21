# Developer distribution notes

Notes on introducing Comment Lens to developers and engineering teams: what to say, what to show, and where to say it.

## Positioning

Comment Lens looks at comments that already exist and gives a reviewer the evidence behind each finding.

- It does not enforce docstring coverage or ask anyone to add comments to private functions.
- Rules run locally and send no source code over the network.
- A finding can point to a broken local path, a task marker with no issue link, a comment that repeats a symbol name, or code that changed beside a comment. A reviewer decides what needs attention.
- A baseline in `.comment-lens-baseline.json` records the current findings, so CI can block only new ones.

## Messages

Each message below is tied to something the product does. Use plain statements and a real example, such as the pwndbg comment on the home page, instead of slogans.

Stale comments cause bugs. When code changes and the comment beside it does not, the comment may no longer describe the implementation, and Comment Lens flags those cases for review.

The rules are deterministic. The core engine uses Tree-sitter, with a Pygments fallback, plus Git history. AI is optional and only explains a finding you select.

A team can adopt it without clearing the backlog. A baseline records the findings a team has already seen, so CI blocks only new ones.

## What to show

- The home page. It follows one real pwndbg comment through its git history until Comment Lens flags it, so it works as the lead demo for a post.
- The demo recording (`public/demo.mp4`, also `docs/media/demo.gif` for the README): a real run on pallets/flask that exits 1, then exits 0 once a baseline is recorded.
- A before and after pair: an echo comment (`// calculate total price` above `calculateTotalPrice()`) next to a comment that explains an edge-case rounding constraint.
- Screenshots of the review workspace with comments, parser context and scoring traces side by side.

## Channels

Hacker News (Show HN): say what the tool does and how to try it. Start with the author's real reason for building it, such as a production incident caused by a stale comment, if that is what happened. Mention Tree-sitter parsing with a Pygments fallback and local SARIF output. For the quick start, use `python3 -m pip install comment-lens-scanner` and `comment-lens check .`.

Reddit: in r/Python, lead with fast extraction that does not execute target code or download grammars at runtime. In r/devops and r/github, lead with the GitHub Actions integration, SARIF annotations and baseline comparison.

GitHub Marketplace: publish an action wrapper, for example `comment-lens-action`, so adding the check to a workflow takes one line.

Open-source projects: run `comment-lens scan` on projects you do not maintain to look for real problems, such as broken relative links or stale tasks. Check each finding against the code before proposing a focused fix.
