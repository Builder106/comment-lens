export function Source({ context, startLine, hit }: { context: string; startLine: number; hit: number }) {
  return (
    <div className="cl-file" tabIndex={0}>
      {context.split("\n").map((text, index) => {
        const number = startLine + index;
        return (
          <div key={number} className={number === hit ? "cl-line cl-hit" : "cl-line"}>
            <span className="cl-num">{number}</span>
            <span className="cl-src">{text || " "}</span>
          </div>
        );
      })}
    </div>
  );
}
