// Recovering from a deploy: a new version removes the old version's hashed
// files, so a page from before it (an open tab lazily loading a chunk, or
// HTML served just as the deploy switched over) asks for scripts that are
// gone. Reloading once fetches the new HTML and its files; plans, the open
// tab and the drilled-in item are saved, so the person lands where they were.
// If a reload a moment ago didn't help, say so plainly instead of looping.
//
// It runs as an inline script in the document head, before the app's own
// scripts, because a missing entry script means no app code runs at all.

export const LOAD_RECOVERY_KEY = "terpsicle:reloaded-for-assets";
/** Within this long of the last automatic reload, don't reload again. */
export const LOAD_RECOVERY_WINDOW_MS = 5 * 60 * 1000;

// Stringified into the document head, so it must be self-contained: no
// imports, no references to anything else in this module.
function recoverFromMissingAssets(storageKey: string, windowMs: number) {
  let handled = false;

  const showError = () => {
    const render = () => {
      if (document.getElementById("load-error")) return;
      const box = document.createElement("div");
      box.id = "load-error";
      box.setAttribute("role", "alert");
      // Inline styles and system colors: the stylesheet may be what failed.
      box.style.cssText =
        "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;max-width:min(360px,calc(100vw - 32px));padding:12px 14px;border-radius:10px;border:1px solid GrayText;background:Canvas;color:CanvasText;color-scheme:light dark;font:13px/1.45 system-ui,sans-serif;box-shadow:0 4px 16px rgb(0 0 0/.18)";
      const text = document.createElement("p");
      text.style.margin = "0 0 8px";
      text.textContent =
        "Terpsicle couldn't load all of its files. A new version may be going out right now. Try again in a minute; your plans are saved.";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Reload";
      button.title = "Reload the page";
      button.style.cssText =
        "font:inherit;padding:4px 10px;border-radius:6px;border:1px solid GrayText;background:ButtonFace;color:ButtonText;cursor:pointer";
      button.addEventListener("click", () => window.location.reload());
      box.append(text, button);
      document.body.append(box);
    };
    if (document.body) render();
    else document.addEventListener("DOMContentLoaded", render);
  };

  const recover = () => {
    if (handled) return;
    handled = true;
    const now = Date.now();
    let last = 0;
    try {
      last = Number(window.sessionStorage.getItem(storageKey)) || 0;
      if (now - last > windowMs) {
        window.sessionStorage.setItem(storageKey, String(now));
        window.location.reload();
        return;
      }
    } catch {
      // No sessionStorage means no loop guard: don't risk reloading forever.
    }
    showError();
  };

  // A <script> or stylesheet from the build failed to load (errors on
  // elements don't bubble, so listen in the capture phase).
  window.addEventListener(
    "error",
    (event) => {
      const target = event.target as HTMLScriptElement | HTMLLinkElement | null;
      if (!target || target === (window as unknown as EventTarget)) return;
      const url =
        (target as HTMLScriptElement).src || (target as HTMLLinkElement).href;
      if (typeof url === "string" && url.includes("/assets/")) recover();
    },
    true,
  );
  // Vite's lazy-chunk loader: a chunk or its CSS failed.
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    recover();
  });
  // A dynamic import() that failed outside Vite's loader.
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as { message?: unknown } | undefined;
    const message = String(reason?.message ?? reason ?? "");
    if (
      /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
        message,
      )
    )
      recover();
  });
}

export const loadRecoveryScript = `(${recoverFromMissingAssets.toString()})(${JSON.stringify(LOAD_RECOVERY_KEY)}, ${LOAD_RECOVERY_WINDOW_MS});`;
