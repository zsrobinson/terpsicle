import { afterEach, describe, expect, it, vi } from "vitest";
import { LOAD_RECOVERY_KEY, loadRecoveryScript } from "./load-recovery";

/** Runs the head script, as a page load would. */
const install = () => new Function(loadRecoveryScript)();

/** A build file that fails to load, as after a deploy removed it. */
function failToLoad(src: string) {
  const script = document.createElement("script");
  // Not JavaScript, so the test DOM doesn't try to fetch it.
  script.type = "text/plain";
  script.src = src;
  document.head.append(script);
  script.dispatchEvent(new Event("error"));
  script.remove();
}

describe("load recovery", () => {
  afterEach(() => {
    sessionStorage.clear();
    document.getElementById("load-error")?.remove();
    vi.restoreAllMocks();
  });

  it("reloads once when a build file is missing, then explains instead of looping", () => {
    const reload = vi
      .spyOn(window.location, "reload")
      .mockImplementation(() => {});

    // First page: the entry script 404s. Reload to get the new version.
    install();
    failToLoad("/assets/index-OLD.js");
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(LOAD_RECOVERY_KEY)).not.toBeNull();
    expect(document.getElementById("load-error")).toBeNull();

    // The reloaded page fails too, moments later: no second reload.
    install();
    failToLoad("/assets/index-STILL-MISSING.js");
    expect(reload).toHaveBeenCalledTimes(1);
    const alert = document.getElementById("load-error");
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert).toHaveTextContent(
      "Terpsicle couldn't load all of its files. A new version may be going out right now.",
    );
    expect(alert?.querySelector("button")).toHaveTextContent("Reload");
  });

  it("recovers from a lazy chunk that Vite couldn't load", () => {
    const reload = vi
      .spyOn(window.location, "reload")
      .mockImplementation(() => {});
    install();
    const event = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(event);
    expect(reload).toHaveBeenCalledTimes(1);
    // Handled here, so Vite doesn't throw it on to the app as well.
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores files that aren't part of the build", () => {
    const reload = vi
      .spyOn(window.location, "reload")
      .mockImplementation(() => {});
    install();
    failToLoad("https://example.com/widget.js");
    expect(reload).not.toHaveBeenCalled();
  });
});
