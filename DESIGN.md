# Comment Lens website design

## Product story

Comment Lens helps developers find code comments that may need attention. Its findings include the rule, source location, and code context that explain why a comment appeared in the review queue.

The hosted dashboard is the current product surface. The local command line tool and configurable CI checks are roadmap work. Any prototype must label those flows as planned.

## Composition: a review session

Organize the page around one changed-comment review. Put a command panel beside an evidence ledger so a developer can connect an action to its result. Keep one repository in view as the reader switches among local use, CI, and team history.

This layout follows the product's shared scanner. The local command reports findings, CI can enforce selected rules, and the dashboard keeps team review history. Do not use a standard hero, a stack of feature cards, or a separate benefits section.

## Page structure

Use a compact top navigation for the product name, documentation, and workspace. Below it, keep the main work area visible without requiring a scroll through marketing copy.

The command panel shows the roadmap example:

```bash
comment-lens check --changed origin/main...HEAD --fail-on high
```

Label this as a planned CLI preview. Include a copy control in the prototype, but do not imply that the command is already available.

Beside the command, show a small evidence ledger. Each finding should identify its rule, file path, line, and relevant comment context. Selecting a finding should reveal the evidence used by the rule. Do not present a score without explaining how it was produced.

Provide three workspace modes: local, CI, and team history. Changing modes should update the example command and the adjacent result. Use the team history mode to show the existing dashboard flow: repository scan, review queue, decisions, and export.

Keep product boundaries close to these controls. Say that scans are read-only, that the CLI is planned, and that uploading local results requires an explicit action. Keep optional assisted review separate from deterministic findings.

## Visual direction

Extend the dashboard's cool paper, graphite, and cobalt palette. Use the existing sans and monospace font stacks, thin rules, restrained corner radii, and a dark code surface. Let the command and evidence carry the visual weight. Avoid decorative gradients, status dots, accent rails, and small uppercase labels above headings.

Use sentence case for headings. Keep code, paths, and rule names in monospace. Use plain text for state labels so meaning does not depend on color.

## Interaction and accessibility

Make the workspace mode controls keyboard accessible and expose the selected state to assistive technology. Keep a visible focus outline. Give the copy control a clear label and announce its result with a polite live region.

On narrow screens, place the command before the evidence ledger and keep both readable without horizontal page scrolling. Let long commands scroll inside their code region. Respect reduced-motion preferences and use motion only to clarify a mode change.

## Claims and limits

The prototype may describe the current hosted dashboard as a review workspace with repository connection, scan progress, filtering, review decisions, and export. It must not present roadmap CLI or CI features as released. It must not describe Comment Lens as a general AI code reviewer or imply that it modifies repository files.
