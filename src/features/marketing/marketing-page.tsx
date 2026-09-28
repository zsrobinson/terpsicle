import { useEffect, useState } from "react";
import { MarketingFooter, MarketingHeader } from "./frame";
import { ClosingSection, ConnectSection } from "./sections";
import { Story } from "./story/story";

// `/` for first visits (docs/V2.md §2, docs/DESIGN.md §8): the story (the
// hero's words over the plain week, then one step per product while the
// week stays in view and each product lands on it), how the five connect,
// and the way in. Returning visitors never see it (returning.ts), except at
// `/?stay`. Its stylesheet is linked from the route's head
// (src/routes/index.tsx), beside the app's.

export function MarketingPage() {
  // "ready" once hydrated: the demos answer clicks from then on. The e2e
  // tests wait for it before pressing anything.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <div
      data-marketing={ready ? "ready" : "loading"}
      className="mk-page min-h-dvh bg-bg text-fg"
    >
      <MarketingHeader />
      <main>
        <Story />
        <ConnectSection />
        <ClosingSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
