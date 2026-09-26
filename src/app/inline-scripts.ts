import { returningCheckScript } from "~/features/marketing/returning";
import { installPromptInitScript } from "~/features/pwa/install-capture";
import { loadRecoveryScript } from "./load-recovery";
import { sidebarWidthInitScript } from "./sidebar-width";
import { themeInitScript } from "./theme";
import { zodJitlessScript } from "./zod-jitless";

// Every inline <script> the HTML carries, by name. The CSP allows inline
// scripts by hash only (docs/V2.md §12), so each one's text must be known
// when the app is built.
//
// This file is evaluated in Node at build time (scripts/inline-scripts.ts):
// the text becomes a string literal in `virtual:terpsicle/inline-scripts`
// and its hash goes into the Worker's CSP. So:
//
// - To add one, write its source where it belongs (a self-contained function
//   stringified with its arguments, like theme.ts), add it here, and render
//   it with `<InlineScript name="…" />` (inline-script.tsx), or in a route's
//   `head()` as `{ children: INLINE_SCRIPTS.<name> }`. Never render the
//   source string itself: the bundler prints functions differently in each
//   build, so its text wouldn't match the hash.
// - Keep this file and what it imports free of browser globals at the top
//   level: Node runs it.
// - Nothing else is hand-maintained; the hashes follow the source.

export const INLINE_SCRIPT_SOURCES = {
  theme: themeInitScript,
  sidebarWidth: sidebarWidthInitScript,
  loadRecovery: loadRecoveryScript,
  zodJitless: zodJitlessScript,
  /** Chrome's `beforeinstallprompt` can fire before the app's scripts load. */
  installPrompt: installPromptInitScript,
  /** `/` only, in its route's `head()` (src/routes/index.tsx). */
  returningCheck: returningCheckScript,
} as const satisfies Record<string, string>;

export type InlineScriptName = keyof typeof INLINE_SCRIPT_SOURCES;
