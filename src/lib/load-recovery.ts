// Recovering from a deploy: a new version removes the old version's hashed
// files, so a page from before it (an open tab lazily loading a chunk, or
// HTML served just as the deploy switched over) asks for scripts that are
// gone. Reloading once fetches the new HTML and its files; plans, the open
// tab and the drilled-in item are saved, so the person lands where they were.
// If a reload a moment ago didn't help, say so plainly instead of looping.
//
// Only a file that's gone calls for any of that. A chunk loaded on first use
// that didn't arrive because the network dropped is the app's to retry
// (~/lib/lazy-component, the marketing page's tooltips), so this checks
// first: it asks for the file again and acts only on a 404. The one failure
// that's always fatal is the app's own entry, a <script> in the page: then
// no app code runs at all, which is why this is an inline script in the head.
//
// The note never goes into a page that's still starting: a node added to
// <body> before React has taken it over can leave the page drawn but dead.
// It waits for the app to say it has started (`markBooted`, from the root
// layout), and shows then as a small note at the bottom that can be
// dismissed; only a page that never starts gets it in the middle, since
// there's nothing else to use.

import { BOOTED_EVENT } from "./booted";

export const LOAD_RECOVERY_KEY = "terpsicle:reloaded-for-assets";
/** Within this long of the last automatic reload, don't reload again. */
export const LOAD_RECOVERY_WINDOW_MS = 5 * 60 * 1000;
/** After a failure, how long past `load` a page may take to start. */
export const BOOT_WAIT_MS = 10_000;

// Stringified into the document head, so it must be self-contained: no
// imports, no references to anything else in this module.
function recoverFromMissingAssets(
  storageKey: string,
  windowMs: number,
  bootedEvent: string,
  bootWaitMs: number,
) {
  let booted = false;
  let handled = false;
  let noteWanted = false;
  let watching = false;

  const removeNote = () => document.getElementById("load-error")?.remove();

  const showNote = (fatal: boolean) => {
    const render = () => {
      if (document.getElementById("load-error")) return;
      const box = document.createElement("div");
      box.id = "load-error";
      box.setAttribute("role", fatal ? "alert" : "status");
      // Inline styles and system colors: the stylesheet may be what failed.
      // A page that started gets it at the bottom, out of the way.
      box.style.cssText = `position:fixed;left:50%;${fatal ? "top:50%;transform:translate(-50%,-50%)" : "bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%)"};z-index:2147483647;max-width:min(360px,calc(100vw - 32px));padding:12px 14px;border-radius:10px;border:1px solid GrayText;background:Canvas;color:CanvasText;color-scheme:light dark;font:13px/1.45 system-ui,sans-serif;box-shadow:0 4px 16px rgb(0 0 0/.18)`;
      const text = document.createElement("p");
      text.style.margin = "0 0 8px";
      text.textContent =
        "Terpsicle couldn't load all of its files. A new version may be going out right now. Try again in a minute; your plans are saved.";
      const button = (label: string, title: string, onClick: () => void) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.title = title;
        b.style.cssText =
          "font:inherit;padding:4px 10px;margin-right:8px;border-radius:6px;border:1px solid GrayText;background:ButtonFace;color:ButtonText;cursor:pointer";
        b.addEventListener("click", onClick);
        return b;
      };
      box.append(
        text,
        button("Reload", "Reload the page", () => window.location.reload()),
      );
      if (!fatal)
        box.append(button("Dismiss", "Hide this note", () => box.remove()));
      document.body.append(box);
    };
    if (document.body) render();
    else document.addEventListener("DOMContentLoaded", render);
  };

  // The note waits for the app to start; a page that never does gets it in
  // the middle, as all there is.
  const note = () => {
    if (booted) showNote(false);
    else {
      noteWanted = true;
      watchBoot();
    }
  };

  const recover = (fatal: boolean) => {
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
    // The entry failed: React will never take this page over, so the note
    // can go in now.
    if (fatal) showNote(true);
    else note();
  };

  // If a file failed and the app hasn't started well after the page loaded,
  // it isn't going to: that's fatal, whatever failed.
  function watchBoot() {
    if (watching) return;
    watching = true;
    const check = () =>
      setTimeout(() => {
        if (booted) return;
        if (noteWanted || handled) showNote(true);
        else recover(true);
      }, bootWaitMs);
    if (document.readyState === "complete") check();
    else window.addEventListener("load", check);
  }

  window.addEventListener(bootedEvent, () => {
    booted = true;
    // A fatal note from a slow start gives way to the small one.
    if (document.getElementById("load-error")?.getAttribute("role") === "alert")
      removeNote();
    if (noteWanted) showNote(false);
  });

  // A file that didn't arrive: gone (a deploy), or only the network?
  const probe = (url: string) => {
    watchBoot();
    fetch(url, { method: "HEAD", cache: "no-store" }).then(
      (response) => {
        if (response.status === 404 || response.status === 410) recover(false);
      },
      // Offline or flaky: the app asks for it again itself.
      () => {},
    );
  };

  const assetIn = (text: string) =>
    /(?:https?:\/\/[^\s'"]+)?\/assets\/[^\s'"]+\.(?:js|css)/.exec(text)?.[0];

  // A <script> or stylesheet from the build failed to load (errors on
  // elements don't bubble, so listen in the capture phase). A <script> is
  // the entry, so fatal; a stylesheet may only be late, so it's checked.
  // A modulepreload link is left to the import that needs it.
  window.addEventListener(
    "error",
    (event) => {
      const target = event.target;
      if (target instanceof HTMLScriptElement) {
        if (target.src.includes("/assets/")) recover(true);
      } else if (
        target instanceof HTMLLinkElement &&
        target.rel === "stylesheet" &&
        target.href.includes("/assets/")
      )
        probe(target.href);
    },
    true,
  );
  // Vite's lazy-chunk loader: a chunk or its CSS failed. Taken here, so the
  // import settles on nothing rather than throwing into the app, which
  // retries it.
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    const payload = (event as Event & { payload?: { message?: unknown } })
      .payload;
    const url = assetIn(String(payload?.message ?? ""));
    if (url) probe(url);
    else watchBoot();
  });
  // A dynamic import() that failed outside Vite's loader.
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as { message?: unknown } | undefined;
    const message = String(reason?.message ?? reason ?? "");
    if (
      /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
        message,
      )
    ) {
      const url = assetIn(message);
      if (url) probe(url);
      else watchBoot();
    }
  });
}

export const loadRecoveryScript = `(${recoverFromMissingAssets.toString()})(${JSON.stringify(LOAD_RECOVERY_KEY)}, ${LOAD_RECOVERY_WINDOW_MS}, ${JSON.stringify(BOOTED_EVENT)}, ${BOOT_WAIT_MS});`;
