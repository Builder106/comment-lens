export default function Loading() {
  return (
    <main className="shell" aria-busy="true">
      <section className="state-surface loading-card" aria-label="Loading Comment Lens">
        <span className="loading-line loading-line-wide" />
        <span className="loading-line" />
        <span className="loading-line loading-line-short" />
      </section>
    </main>
  );
}
