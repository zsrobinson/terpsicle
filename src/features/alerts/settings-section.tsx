import { useEffect, useRef } from "react";
import { InlineError } from "~/ui/inline-error";
import { PageSection } from "~/ui/page-section";
import { RowSkeleton } from "~/ui/skeleton";
import { useSeatWatches, useSeatWatchesSync } from "./seat-watches";
import { WatchingList } from "./watching-list";

// Settings → "Watching for a seat" (`/settings#watching`, from the account
// menu): every section you watch, with Stop. Loaded only when signed in.

const WATCHING_ID = "watching";

export function SeatWatchesSection() {
  useSeatWatchesSync();
  const list = useSeatWatches();
  const loaded = list.data !== undefined;
  const scrolled = useRef(false);
  // The section appears after /api/me answers, too late for the browser's
  // own jump to #watching.
  useEffect(() => {
    if (!loaded || scrolled.current) return;
    scrolled.current = true;
    if (window.location.hash === `#${WATCHING_ID}`)
      document.getElementById(WATCHING_ID)?.scrollIntoView?.();
  }, [loaded]);
  return (
    // The link target is a wrapper: the kit's section takes no id.
    <div id={WATCHING_ID} className="scroll-mt-4">
      <PageSection title="Watching for a seat">
        {loaded ? (
          <WatchingList />
        ) : list.isError ? (
          <InlineError
            message="We couldn't load the sections you're watching. Check your connection and try again."
            onRetry={() => void list.refetch()}
          />
        ) : (
          <RowSkeleton
            rows={1}
            inset={false}
            label="Loading the sections you're watching"
          />
        )}
        <p className="text-muted text-sm">
          We let you know when a seat opens in a section you watch. Watches end
          when the term does.
        </p>
      </PageSection>
    </div>
  );
}
