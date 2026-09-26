import { OpenScheduleButton, SitePage } from "./site-page";

// Any path no route matches (an old link, a typo): say so, and offer the way in.

export function NotFoundPage() {
  return (
    <SitePage>
      <h1 className="mb-1.5 font-semibold text-xl tracking-tight">
        Page not found
      </h1>
      <p className="mb-6 text-muted">There's nothing at this address.</p>
      <OpenScheduleButton />
    </SitePage>
  );
}
