import { INSTALL_PROMPT_STASH } from "./install-capture";

// The head script that keeps Chrome's install prompt (install-capture.ts).
// Only src/lib/inline-scripts.ts imports this, at build time: kept apart so
// the app's own bundle doesn't carry the script's source as well.

// Stringified into the document head, so it must be self-contained: no
// imports, no references to anything else in this module.
function stashInstallPrompt(key: string) {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    (window as unknown as Record<string, unknown>)[key] = event;
  });
  window.addEventListener("appinstalled", () => {
    (window as unknown as Record<string, unknown>)[key] = undefined;
  });
}

export const installPromptInitScript = `(${stashInstallPrompt.toString()})(${JSON.stringify(INSTALL_PROMPT_STASH)});`;
