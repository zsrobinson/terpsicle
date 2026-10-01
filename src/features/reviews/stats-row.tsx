import { type RefObject, useEffect, useRef, useState } from "react";
import type { PlanetTerpTotals } from "~/core/schema";

// /reviews' numbers (owner, 2026-09-29: as PlanetTerp's front page counts
// its courses, professors, reviews and grades). They count up from 0 the
// first time they come into view, once; with Reduce Motion they're simply
// there. The server's HTML has the real numbers, so a page without its
// script, or read before it runs, says the same.

/** How long the count takes. */
const DURATION_MS = 1200;

/** Fast, then settling: the last digits turn over slowly. */
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** 0 to 1 over the count; 1 before it starts and when it's skipped. */
function useCountUp(ref: RefObject<HTMLElement | null>): number {
  const [progress, setProgress] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (
      !el ||
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / DURATION_MS);
          setProgress(easeOut(t));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        setProgress(0);
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref]);
  return progress;
}

export function StatsRow({ totals }: { totals: PlanetTerpTotals }) {
  const ref = useRef<HTMLDListElement>(null);
  const progress = useCountUp(ref);
  const stats: [string, number][] = [
    ["Courses", totals.courses],
    ["Professors", totals.professors],
    ["Reviews", totals.reviews],
    ["Course grades", totals.grades],
  ];
  return (
    <dl ref={ref} className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      {stats.map(([label, n]) => (
        // The number over its label, but the label first for a screen reader.
        <div key={label} className="flex min-w-0 flex-col-reverse gap-0.5">
          <dt className="emph-secondary text-base">{label}</dt>
          <dd className="tnum font-semibold text-2xl text-fg md:text-3xl">
            {/* A screen reader gets the number, not each step of the count. */}
            <span aria-hidden="true">
              {Math.round(n * progress).toLocaleString("en-US")}
            </span>
            <span className="sr-only">{n.toLocaleString("en-US")}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
