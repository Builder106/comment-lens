# Marks

Both files were drawn with the Glaxnimate MCP server. Redraw them there and copy the path data into the components that inline them.

- `mark.svg`: the Comment Lens mark, a `//` comment marker whose second stroke has drifted out of step with the first, the way a comment drifts from the code beside it. Inlined in `components/landing/mark.tsx`. The icons in `app/` and `public/` draw the same two strokes on a light tile, so they stay visible on dark browser themes.
- `squiggle.svg`: the reviewer's wavy underline drawn under a stale comment in the home page's history panel. Its path is a constant in `components/landing/panels.tsx`.
