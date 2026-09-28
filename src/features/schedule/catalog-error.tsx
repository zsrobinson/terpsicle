import { useState } from "react";
import { useCatalog } from "~/state/catalog-store";
import { useActiveTerm } from "~/state/hooks";
import { InlineError } from "~/ui/inline-error";

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
 * Specific words and a way out, in place of the calendar: the kit's inline
 * error with Try again, or Reload when the server publishes a newer format
 * than this tab reads.
 */
export function CatalogError({ message }: { message: string }) {
  const retry = useCatalog((s) => s.retry);
  const stale = useCatalog((s) => s.appStale);
  const [trying, setTrying] = useState(false);
  return (
    <div className="flex h-full items-center justify-center px-6">
      <InlineError
        message={message}
        className="max-w-[360px]"
        reload={stale}
        retryTooltip={stale ? undefined : "Load the catalog again"}
        retrying={trying}
        onRetry={() => {
          setTrying(true);
          void retry().finally(() => setTrying(false));
        }}
      />
    </div>
  );
}
