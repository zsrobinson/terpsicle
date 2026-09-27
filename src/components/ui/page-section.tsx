import { cn } from "cn";
import type { ReactNode } from "react";

// A group of things on a page, under the page's title (docs/COHESION.md §3,
// Phase 2): a hairline on top and a small label, never a box. Settings'
// Account, Reviews' Grades, Export's checklist. It's the weakest grouping
// that works (UX-PRINCIPLES §2); a box is for a `Card`, which you press.
//
// Named PageSection, not Section: a section is a course's offering
// (CONTEXT.md).

export function PageSection({
  title,
  aside,
  headingLevel = 2,
  children,
  className,
}: {
  title: ReactNode;
  /** Muted words or one quiet control at the label's right ("3 watching"). */
  aside?: ReactNode;
  /** `h2` under a page's `h1`; `h3` inside another section. */
  headingLevel?: 2 | 3;
  children: ReactNode;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section
      className={cn(
        // A rule between sections; the first one in its column has the page
        // header's rule (or its container's edge) above it already.
        "flex flex-col gap-2 border-hairline border-t pt-3 first:border-t-0 first:pt-0",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <Heading className="font-semibold text-base">{title}</Heading>
        {aside ? <div className="text-muted text-xs">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}
