export function Source({ context, startLine, hit }: { context: string; startLine: number; hit: number }) {
  return (
    <pre className="lp-code lp-source" tabIndex={0}>
      <code>
        {context.split("\n").map((text, index) => {
          const number = startLine + index;
          return <span key={number} className={number === hit ? "lp-line lp-hit" : "lp-line"} data-n={number}>{text || " "}</span>;
        })}
      </code>
    </pre>
  );
}
