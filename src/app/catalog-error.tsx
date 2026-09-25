import { RotateCw } from "lucide-react";
import { useState } from "react";
import { useCatalog } from "~/state/catalog-store";
import { useActiveTerm } from "~/state/hooks";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";

/**
 * Why the catalog can't show, when there's nothing saved to fall back on:
 * the terms list, or the open term's manifest, failed with no cached copy.
 * Null otherwise (saved data on screen is never an error; the top bar says
 * "Offline · showing saved data" quietly instead).
 */
export function useCatalogFailure(): string | null {
  const { termId } = useActiveTerm();
  const termsError = useCatalog((s) => (s.terms ? null : s.termsError));
  const termFailed = useCatalog((s) => {
    const t = termId ? s.byTerm[termId] : undefined;
    return t?.manifestState === "error" && !t.manifest;
  });
  const offline = useCatalog((s) => s.network === "offline");
  const stale = useCatalog((s) => s.appStale);
  if (termsError) return termsError;
  if (!termFailed) return null;
  if (stale)
    return "Terpsicle has been updated since this page opened. Reload to load this term's courses.";
  return offline
    ? "Couldn't reach terpsicle.com to load this term's courses. Check your connection and try again."
    : "This term's courses didn't load correctly. Try again in a minute.";
}

/**
 * Specific words and a way out, in place of the calendar: try again, or
 * reload when the server publishes a newer format than this tab reads.
 */
export function CatalogError({ message }: { message: string }) {
  const retry = useCatalog((s) => s.retry);
  const stale = useCatalog((s) => s.appStale);
  const [trying, setTrying] = useState(false);
  return (
    <div
      role="alert"
      className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <p className="max-w-[360px] text-[13px] text-fg">{message}</p>
      {stale ? (
        <WithTooltip label="Reload the page to get the latest Terpsicle">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            <RotateCw size={13} aria-hidden="true" />
            Reload
          </Button>
        </WithTooltip>
      ) : (
        <WithTooltip label="Load the catalog again">
          <Button
            variant="outline"
            size="sm"
            disabled={trying}
            onClick={() => {
              setTrying(true);
              void retry().finally(() => setTrying(false));
            }}
          >
            <RotateCw size={13} aria-hidden="true" />
            {trying ? "Trying…" : "Try again"}
          </Button>
        </WithTooltip>
      )}
    </div>
  );
}
