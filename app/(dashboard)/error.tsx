"use client";

export default function ErrorState({ reset }: { reset: () => void }) {
  return (
    <main className="shell">
      <section className="state-surface" role="alert" aria-labelledby="dashboard-error-title">
        <h1 id="dashboard-error-title">Comment Lens could not load this view.</h1>
        <p>Try the view again. Your repository source is not changed by this action.</p>
        <button className="button button-primary" type="button" onClick={reset}>Try again</button>
      </section>
    </main>
  );
}
