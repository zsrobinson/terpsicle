import { type RefObject, useEffect, useState } from "react";
import { useMediaQuery } from "~/app/use-media-query";

// The marketing page's motion switches. CSS does the moving (marketing.css);
// these decide when scripted motion starts, and skip it for anyone who asked
// for less.

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** True when motion should be skipped: the end state, straight away. */
export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY);
}

/**
 * Arms the scroll reveals inside `root`: every `[data-reveal]` that starts
 * below the fold is hidden (`data-armed`) and shown (`data-in`) as it
 * scrolls in. Anything already on screen, and everything under reduced
 * motion or without IntersectionObserver, simply stays shown.
 */
export function armReveals(root: HTMLElement, reduced: boolean): () => void {
  if (reduced || typeof IntersectionObserver === "undefined") return () => {};
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-in", "");
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.12 },
  );
  for (const el of root.querySelectorAll<HTMLElement>("[data-reveal]")) {
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) continue;
    el.setAttribute("data-armed", "");
    observer.observe(el);
  }
  return () => observer.disconnect();
}

/**
 * Whether `ref`'s element is within `margin` of the viewport yet: true once,
 * then it stays true. Without IntersectionObserver, true straight away.
 */
export function useNear(
  ref: RefObject<Element | null>,
  { margin = "0px", threshold = 0 }: { margin?: string; threshold?: number },
): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin, threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, margin, threshold, near]);
  return near;
}
