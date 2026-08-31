"use client";

export default function ErrorState({ reset }: { reset: () => void }) {
  return (
    <main className="shell">
      <section className="empty-state" role="alert">
        <p className="section-label">Dashboard error</p>
        <h1>Comment Lens could not load this view.</h1>
        <p>Try the view again. Your repository source is not changed by this action.</p>
        <button className="button button-primary" type="button" onClick={reset}>Try again</button>
      </section>
    </main>
  );
}
