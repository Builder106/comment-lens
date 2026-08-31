export default function Loading() {
  return (
    <main className="shell" aria-busy="true">
      <div className="loading-card">
        <span className="loading-line loading-line-wide" />
        <span className="loading-line" />
        <span className="loading-line loading-line-short" />
      </div>
    </main>
  );
}
