import { useEffect, useRef } from "react";
import { AccountSection } from "~/features/auth/account-page";
import { useSeatWatches } from "~/state/seat-watches";
import { Skeleton } from "~/ui/skeleton";
import { useSeatWatchesSync } from "./seat-watches";
import { WatchingList } from "./watching-list";

// Settings → "Watching for a seat" (`/settings#watching`, from the account
// menu): every section you watch, with Stop. Loaded only when signed in.

const WATCHING_ID = "watching";

export function SeatWatchesSection() {
  useSeatWatchesSync();
  const loaded = useSeatWatches((s) => s.watches !== null);
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
    <AccountSection title="Watching for a seat" id={WATCHING_ID}>
      {loaded ? <WatchingList /> : <Skeleton className="h-4 w-48" />}
      <p className="text-sm">
        We email you when a seat opens in a section you watch. Watches end when
        the term does.
      </p>
    </AccountSection>
  );
}
