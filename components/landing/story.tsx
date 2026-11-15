"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CodePanel, ProofPanel, TermPanel } from "./panels";

export interface Chapter {
  id: string;
  rail: string;
  body: ReactNode;
}

function Panel({ index, step }: { index: number; step: number }) {
  if (index <= 2) return <CodePanel step={Math.min(index, step) as 0 | 1 | 2} />;
  return index === 3 ? <ProofPanel /> : <TermPanel />;
}

export function Story({ chapters }: { chapters: Chapter[] }) {
  const [observed, setActive] = useState<number | null>(null);
  const active = observed ?? 0;
  const refs = useRef<(HTMLElement | null)[]>([]);
  const snaps = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const phone = window.matchMedia("(max-width: 999px)");
    let observer: IntersectionObserver | undefined;
    const watch = () => {
      observer?.disconnect();
      const targets = phone.matches ? snaps.current : refs.current;
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
          }
        },
        phone.matches ? { threshold: 0.6 } : { rootMargin: "-45% 0px -45% 0px" },
      );
      targets.forEach((node) => node && observer?.observe(node));
    };
    watch();
    phone.addEventListener("change", watch);
    return () => {
      phone.removeEventListener("change", watch);
      observer?.disconnect();
    };
  }, []);

  return (
    <main id="main" tabIndex={-1} className="cl-story">
      <div className="cl-chapters">
        {chapters.map((chapter, index) => (
          <section
            key={chapter.id}
            id={chapter.id}
            data-index={index}
            ref={(node) => { refs.current[index] = node; }}
            className="cl-chapter"
            aria-labelledby={`${chapter.id}-title`}
          >
            {chapter.body}
            <div className="cl-snap" data-index={index} ref={(node) => { snaps.current[index] = node; }}>
              <Panel index={index} step={observed ?? index} />
            </div>
          </section>
        ))}
      </div>
      <div className="cl-stage-col">
        <div className="cl-stage">
          <nav aria-label="Story">
            <ol className="cl-rail">
              {chapters.map((chapter, index) => (
                <li key={chapter.id}>
                  <a href={`#${chapter.id}`} aria-current={index === active ? "step" : undefined}>{chapter.rail}</a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="cl-panels">
            {[0, 3, 4].map((kind) => {
              const shown = kind === 0 ? active <= 2 : kind === active;
              return (
                <div key={kind} data-shown={shown} aria-hidden={!shown} inert={!shown}>
                  {kind === 0 ? <CodePanel step={Math.min(active, 2) as 0 | 1 | 2} /> : <Panel index={kind} step={active} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
