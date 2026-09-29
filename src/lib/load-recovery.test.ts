import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markBooted } from "./booted";
import {
  BOOT_WAIT_MS,
  LOAD_RECOVERY_KEY,
  loadRecoveryScript,
} from "./load-recovery";

/** What each run of the head script listens for, to undo between tests. */
const installed: [string, EventListenerOrEventListenerObject, unknown][] = [];

/** Runs the head script, as a page load would. */
function install() {
  const add = window.addEventListener.bind(window);
  const spy = vi
    .spyOn(window, "addEventListener")
    .mockImplementation((type, listener, options) => {
      installed.push([type, listener, options]);
      add(type, listener, options);
    });
  new Function(loadRecoveryScript)();
  spy.mockRestore();
}

/** A build file in the page that fails to load, as after a deploy removed it. */
function failToLoad(src: string) {
  const script = document.createElement("script");
  // Not JavaScript, so the test DOM doesn't try to fetch it.
  script.type = "text/plain";
  script.src = src;
  document.head.append(script);
  script.dispatchEvent(new Event("error"));
  script.remove();
}

/** A <link> from the build that fails to load. */
function linkFails(rel: string, href: string) {
  const link = document.createElement("link");
  link.rel = rel;
  link.href = href;
  // Not appended: the test DOM would fetch it.
  document.head.dispatchEvent(new Event("error"));
  const event = new Event("error");
  Object.defineProperty(event, "target", { value: link });
  window.dispatchEvent(event);
}

/** Vite's loader couldn't load a chunk (its event, with the browser's words). */
function chunkFails(file = "/assets/pieces-OLD.js") {
  const event = Object.assign(
    new Event("vite:preloadError", { cancelable: true }),
    {
      payload: new TypeError(
        `Failed to fetch dynamically imported module: http://localhost${file}`,
      ),
    },
  );
  window.dispatchEvent(event);
  return event;
}

/** Asking for the file again: gone (404), or no network at all. */
function fileIs(answer: "gone" | "there" | "unreachable") {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(() =>
      answer === "unreachable"
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Promise.resolve(
            new Response(null, { status: answer === "gone" ? 404 : 200 }),
          ),
    );
}

const note = () => document.getElementById("load-error");
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("load recovery", () => {
  let reload: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});
  });
  afterEach(() => {
    for (const [type, listener, options] of installed.splice(0))
      window.removeEventListener(
        type,
        listener,
        options as boolean | EventListenerOptions | undefined,
      );
    sessionStorage.clear();
    note()?.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("reloads once when the entry is missing, then explains instead of looping", () => {
    // First page: the entry script 404s. Reload to get the new version.
    install();
    failToLoad("/assets/index-OLD.js");
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(LOAD_RECOVERY_KEY)).not.toBeNull();
    expect(note()).toBeNull();

    // The reloaded page fails too, moments later: no second reload. No app
    // code runs, so the note goes in the middle at once.
    install();
    failToLoad("/assets/index-STILL-MISSING.js");
    expect(reload).toHaveBeenCalledTimes(1);
    expect(note()).toHaveAttribute("role", "alert");
    expect(note()).toHaveTextContent(
      "Terpsicle couldn't load all of its files. A new version may be going out right now.",
    );
    expect(note()?.querySelector("button")).toHaveTextContent("Reload");
  });

  it("reloads once for a lazy chunk the deploy removed", async () => {
    fileIs("gone");
    install();
    const event = chunkFails();
    // Handled here, so Vite settles the import rather than throwing it on.
    expect(event.defaultPrevented).toBe(true);
    await settle();
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost/assets/pieces-OLD.js",
      expect.objectContaining({ method: "HEAD", cache: "no-store" }),
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("leaves a chunk that only the network lost to the app, which retries it", async () => {
    fileIs("unreachable");
    install();
    chunkFails();
    await settle();
    markBooted();
    expect(reload).not.toHaveBeenCalled();
    expect(note()).toBeNull();
  });

  it("never adds its note to a page that's still starting, then shows it small once it has", async () => {
    // A reload a moment ago didn't help: the note is what's left.
    sessionStorage.setItem(LOAD_RECOVERY_KEY, String(Date.now()));
    fileIs("gone");
    install();
    chunkFails();
    await settle();
    expect(reload).not.toHaveBeenCalled();
    expect(note()).toBeNull();

    markBooted();
    // At the bottom, out of the way, and it can be dismissed.
    expect(note()).toHaveAttribute("role", "status");
    expect(note()?.style.top).toBe("");
    const dismiss = [...(note()?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent === "Dismiss",
    );
    dismiss?.click();
    expect(note()).toBeNull();
  });

  it("treats a page that never starts after a failure as fatal", async () => {
    vi.useFakeTimers();
    fileIs("unreachable");
    install();
    chunkFails();
    await vi.advanceTimersByTimeAsync(BOOT_WAIT_MS + 1);
    // jsdom's document is already loaded, so the wait counts from now.
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("checks a stylesheet that failed, and leaves module preloads to their imports", async () => {
    fileIs("gone");
    install();
    linkFails("modulepreload", "/assets/route-states-OLD.js");
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    linkFails("stylesheet", "/assets/styles-OLD.css");
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("ignores files that aren't part of the build", () => {
    install();
    failToLoad("https://example.com/widget.js");
    expect(reload).not.toHaveBeenCalled();
  });
});
