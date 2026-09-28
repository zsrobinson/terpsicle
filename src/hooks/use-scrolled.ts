import { useEffect, useState } from "react";

/**
 * Whether the page has scrolled at all, while `enabled`. False on the
 * server and before the first scroll, so a page that opens at the top
 * renders the same both places. One passive listener; nothing when off.
 */
export function useScrolled(enabled: boolean): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const check = () => setScrolled(window.scrollY > 0);
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, [enabled]);
  return enabled && scrolled;
}
