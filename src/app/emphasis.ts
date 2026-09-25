// Color emphasis (docs/UX-REVIEW.md §2.5), as class names so every feature
// says "secondary" or "warn" the same way instead of keeping its own map.
//
// - Text: `primary` is what the row is, `secondary` the facts that support
//   it, `tertiary` only footnotes, placeholders and disabled states.
// - Status colors go on status words and their meters only (fit, seats, a
//   problem's severity, a travel verdict): never on counts, headings or
//   decoration. "4 fit" in a header stays secondary; the row's "Fits" is ok.
// - One filled (accent) button per view, for its primary action.

export const TEXT = {
  primary: "text-fg",
  secondary: "text-muted",
  tertiary: "text-faint",
} as const;

export type Tone = "ok" | "warn" | "error" | "plain" | "muted";

/** A status word's color. `plain` is a neutral fact that still matters ("Current"). */
export const TONE_TEXT: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  error: "text-error",
  plain: "text-fg font-medium",
  muted: "text-muted",
};

/** The soft fill behind a status (the top bar's problem pill, theme tags). */
export const TONE_FILL: Record<Exclude<Tone, "plain" | "muted">, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  error: "bg-error-soft text-error",
};
