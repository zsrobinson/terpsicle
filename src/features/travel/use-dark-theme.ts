import { useSyncExternalStore } from "react";

// Whether the page is in the dark theme right now. The theme lives on
// `<html class="dark">` (src/app/theme.ts), set by the toggle or the system;
// the map's style has to follow it in JavaScript, since WebGL can't read CSS.

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");

export function useDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, isDark, () => false);
}
