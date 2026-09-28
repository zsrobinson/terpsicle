import { useEffect } from "react";
import { PageHeader } from "~/ui/page-header";
import { OpenScheduleButton, SitePage } from "./site-page";

// Any path no route matches (an old link, a typo): say so, and offer the way in.

export function NotFoundPage() {
  // A route's head doesn't apply to the not-found page, and the tab should
  // say what happened (WCAG 2.4.2), not just "Terpsicle".
  useEffect(() => {
    document.title = "Page not found · Terpsicle";
  }, []);
  return (
    <SitePage notFound>
      <PageHeader
        title="Page not found"
        status="There's nothing at this address."
      />
      <OpenScheduleButton />
    </SitePage>
  );
}
