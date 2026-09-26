import { OpenScheduleButton, SitePage } from "./site-page";

// `/` for first-time visitors: a placeholder the marketing track replaces.
// Anyone with saved plans or a session never sees it (src/app/landing.ts).

export function MarketingPage() {
  return (
    <SitePage>
      <h1 className="mb-1.5 font-semibold text-xl tracking-tight">Terpsicle</h1>
      <p className="mb-6 text-muted">
        A fast, clear class scheduler for UMD students.
      </p>
      <OpenScheduleButton />
    </SitePage>
  );
}
