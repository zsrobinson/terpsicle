import { cn } from "cn";
import type { ReactNode } from "react";

// A group of things on a page, under the page's title (docs/COHESION.md §3,
// Phase 2): a hairline on top and a heading, never a box. Settings'
// Account, Reviews' Grades, Export's checklist. It's the weakest grouping
// that works (UX-PRINCIPLES §2); a box is for a `Card`, which you press.
//
// Named PageSection, not Section: a section is a course's offering
// (CONTEXT.md).

/**
 * Each size's title, a step up from what it heads: on a reading page, larger
 * type carries the hierarchy (docs/DESIGN.md §7.8). A page's sections sit
 * between its `h1` (`text-xl`) and their 13px content. One nested in another
 * (`h3`) is its content's size, set apart by weight alone.
 * `src/components/design-tokens.test.ts` holds these to the type scale.
 */
export const PAGE_SECTION_TITLE = {
  page: "emph-heading text-lg",
  nested: "emph-heading text-base",
  side: "emph-title text-xl",
  display: "emph-title text-2xl",
} as const;

export function PageSection({
  title,
  aside,
  headingLevel = 2,
  size = "page",
  children,
  className,
}: {
  title: ReactNode;
  /** Muted words or one quiet control at the label's right ("3 watching"). */
  aside?: ReactNode;
  /** `h2` under a page's `h1`; `h3` inside another section. */
  headingLevel?: 2 | 3;
  /**
   * `display`: a public reading page's section, set larger and roomier.
   * `side`: its narrow column's, a step down from `display` and up from
   * `page`, so what's inside (a term, a name, a count) still reads smaller.
   */
  size?: "page" | "display" | "side";
  children: ReactNode;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section
      className={cn(
        // A rule between sections; the first one in its column, or the one
        // right under a page header, has the header's rule (or its
        // container's edge) above it already.
        size === "side"
          ? // A narrow column's sections stand apart by space alone (owner,
            // 2026-09-30: "we don't need a hairline on top of courses/grades").
            "flex flex-col gap-4"
          : "flex flex-col border-hairline border-t first:border-t-0 first:pt-0 [[data-slot=page-header]+&]:border-t-0 [[data-slot=page-header]+&]:pt-0",
        size === "page" ? "gap-2 pt-3" : size === "display" && "gap-4 pt-6",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-baseline justify-between gap-3",
          // A phone puts the aside under the larger title, not beside it.
          size === "display" &&
            "max-sm:flex-col max-sm:items-start max-sm:gap-1",
        )}
      >
        <Heading
          className={
            PAGE_SECTION_TITLE[
              size === "page" && headingLevel === 3 ? "nested" : size
            ]
          }
        >
          {title}
        </Heading>
        {aside ? (
          <div
            className={cn(
              size === "page" ? "emph-meta" : "emph-secondary text-base",
              // Under the title, it has the column's width to fill.
              size === "display" && "max-sm:self-stretch",
            )}
          >
            {aside}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
