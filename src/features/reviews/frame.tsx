import { type ReactNode, useEffect } from "react";
import { SiteHeader } from "~/features/site/site-page";
import { initAnalytics, track } from "~/lib/analytics";
import { ProductPage } from "~/ui/product-page";

// The frame of Terpsicle Reviews' pages (V2 §1.1): the family bar over a
// reading page (docs/COHESION.md §4), with its footer. Reviews is the one
// product meant to be read on its own, arriving from a search engine, so
// it reads as a public website rather than a dashboard (owner, 2026-09-28):
// the bar stays at the top as you scroll, with no rule under it until you
// do, so the page first reads as one piece; the kit's `display` sizes set
// its type larger and its sections roomier.

export type ReviewsPageName = "home" | "instructor" | "course";

export function ReviewsFrame({
  page,
  children,
}: {
  /** Counted as a page view; left out on /reviews/mine and the policy. */
  page?: ReviewsPageName;
  children: ReactNode;
}) {
  useEffect(() => {
    void initAnalytics();
    if (page) track("reviews_page_viewed", { page });
  }, [page]);
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <div className="sticky top-0 z-20 bg-bg">
        <SiteHeader borderOnScroll />
      </div>
      <ProductPage width="reading" className="gap-6">
        {children}
      </ProductPage>
    </div>
  );
}

/**
 * A `ListRow` on a reading page sits flush with the page's column, under the
 * header and the section labels (the kit's prototype), not inset as in a
 * panel. Pass it as the row's `className`.
 */
export const PAGE_ROW = "px-0";

/**
 * A section's one line of words (a `PanelNote`: "No reviews yet"), set like
 * the section's prose, right under its label. A panel's note pads itself
 * to sit among rows; on a page that padding reads as a gap.
 */
export const PAGE_NOTE = "p-0 text-base";

/**
 * A row's one link, answering for the whole row: its `::after` covers the
 * row, which must be `relative`.
 */
export const ROW_LINK = "after:absolute after:inset-0";
