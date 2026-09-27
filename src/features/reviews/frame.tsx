import { type ReactNode, useEffect } from "react";
import { initAnalytics, track } from "~/app/analytics";
import { SiteHeader } from "~/features/site/site-page";
import { ProductPage } from "~/ui/product-page";

// The frame of Terpsicle Reviews' pages (V2 §1.1): the family bar over a
// reading page (docs/COHESION.md §4), with its footer. Each page puts the
// kit's PageHeader first, then PageSections of ListRows.

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
      <SiteHeader />
      <ProductPage width="reading">{children}</ProductPage>
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
export const PAGE_NOTE = "p-0";

/**
 * A row's one link, answering for the whole row: its `::after` covers the
 * row, which must be `relative`.
 */
export const ROW_LINK = "after:absolute after:inset-0";
