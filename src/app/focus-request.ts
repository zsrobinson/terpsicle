import { useEffect, useRef } from "react";
import type { RailTab } from "~/core/schema";
import { useUi } from "~/state/ui-store";

// Kept out of ./panel so pages outside the scheduler (Chat) can use the
// panel pieces without the scheduler's stores.

/**
 * Focuses an element when the shell asks this tab to (e.g. `/` focuses the
 * search box): `const ref = useFocusRequest<HTMLInputElement>("search")`.
 */
export function useFocusRequest<T extends HTMLElement>(tab: RailTab) {
  const ref = useRef<T>(null);
  const request = useUi((s) => s.focusRequest);
  useEffect(() => {
    if (request?.tab === tab) ref.current?.focus();
  }, [request, tab]);
  return ref;
}
