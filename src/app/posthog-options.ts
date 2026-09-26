// PostHog's settings, loaded with posthog-js (initAnalytics in ./analytics),
// so none of this is in any page's eager bundle.
import type { PostHogConfig } from "posthog-js";
import { noAutocaptureUrlPatterns, scrubEvent } from "~/core/analytics";

/** Marks what's private to the person: names, emails, pictures, block labels. */
export const PRIVATE_SELECTOR = "[data-private]";

/**
 * PostHog's settings. The privacy rules (docs/ANALYTICS.md "Privacy") live
 * here and in ~/core/analytics: every event goes through `scrubEvent`,
 * autocapture skips private elements and private pages, and sessions are
 * never recorded. `privateText` reads the page's private text when a click
 * event needs it.
 */
export function posthogOptions(
  privateText: () => readonly string[],
): Partial<PostHogConfig> {
  return {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    // We never call identify(), so every visitor stays anonymous.
    person_profiles: "identified_only",
    // No cookies; the /ingest proxy strips them anyway.
    persistence: "localStorage",
    capture_pageview: "history_change",
    autocapture: {
      url_ignorelist: noAutocaptureUrlPatterns(),
      // A custom list replaces PostHog's default, so its two are repeated.
      css_selector_ignorelist: [
        PRIVATE_SELECTOR,
        ".ph-no-autocapture",
        "[data-ph-no-autocapture]",
      ],
      capture_copied_text: false,
    },
    // We don't run surveys; don't download their code.
    disable_surveys: true,
    // No session recordings, whatever the PostHog project says (the owner's
    // call; `scrubEvent` drops any recording data too). Nothing may call
    // startSessionRecording().
    disable_session_recording: true,
    before_send: (event) => event && scrubEvent(event, { privateText }),
  };
}

/** Every piece of text in the page's private elements, for `scrubEvent`. */
export function pagePrivateText(root: ParentNode = document): string[] {
  const texts: string[] = [];
  for (const element of root.querySelectorAll(PRIVATE_SELECTOR)) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode())
      texts.push(node.textContent ?? "");
    for (const name of ["alt", "title", "aria-label"]) {
      const value = element.getAttribute(name);
      if (value) texts.push(value);
    }
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    )
      texts.push(element.value);
  }
  return texts;
}
