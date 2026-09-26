import { useEffect, useState } from "react";
import { ProductBlocks } from "./blocks";
import { ClosingSection, MarketingFooter, MarketingHeader } from "./frame";
import { Hero } from "./hero";

// `/` for first visits (docs/V2.md §2): the hero, where five tangled lines
// straighten into the five products, then a block per product with a live
// sample, in color order, and the footer. Returning visitors never see it
// (returning.ts), except at `/?stay`. Its stylesheet is linked from the
// route's head (src/routes/index.tsx), beside the app's.

export function MarketingPage() {
  // "ready" once hydrated: the samples answer clicks from then on. The
  // e2e tests wait for it before pressing anything.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <div
      data-marketing={ready ? "ready" : "loading"}
      className="mk-page min-h-dvh bg-bg text-fg"
    >
      <MarketingHeader />
      <main>
        <Hero />
        <ProductBlocks />
        <ClosingSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
