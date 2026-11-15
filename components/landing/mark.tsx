// Drawn in Glaxnimate: design/marks/mark.svg. A `//` comment marker whose second
// stroke has drifted out of step with the first.
export function Mark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <polygon points="8,54 18,54 34,10 24,10" fill="currentColor" />
      <polygon className="cl-mark-drift" fill="#f2b705" points="28,58 38,58 54,14 44,14" />
    </svg>
  );
}
