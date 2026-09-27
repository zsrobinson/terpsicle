import { PageHeader } from "~/ui/page-header";
import { OpenScheduleButton, SitePage } from "./site-page";

// Any path no route matches (an old link, a typo): say so, and offer the way in.

export function NotFoundPage() {
  return (
    <SitePage notFound>
      <PageHeader title="Page not found" />
      <p className="text-muted">There's nothing at this address.</p>
      <OpenScheduleButton />
    </SitePage>
  );
}
