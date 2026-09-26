import type { CSSProperties } from "react";

// What every live preview on the marketing page shares. Each preview is
// self-contained: its own sample data and its own state, never the
// scheduler's stores or IndexedDB (scripts/check-bundle.ts keeps them off
// `/`). They load as they near the viewport (../blocks.tsx).

export interface PreviewProps {
  /** On screen: start the preview's little show (messages arriving, …). */
  active: boolean;
  /** Skip the show: everything in its end state at once. */
  reduced: boolean;
}

/** Says it's made up, so no one reads sample seats or reviews as real. */
export function SampleTag({
  label = "Sample",
  inline = false,
}: {
  label?: string;
  /** In a header's flow, rather than pinned to the corner. */
  inline?: boolean;
}) {
  return (
    <span
      className={`${inline ? "shrink-0" : "absolute top-1.5 right-1.5 z-10"} border border-hairline-strong bg-raised px-1 font-semibold text-2xs text-faint`}
    >
      {label}
    </span>
  );
}

/** A course's tint (styles.css), as the scheduler's blocks wear it. */
export type Tint =
  | "blue"
  | "violet"
  | "lime"
  | "amber"
  | "teal"
  | "orange"
  | "pink";

export function tint(t: Tint): CSSProperties {
  return {
    backgroundColor: `var(--course-${t}-bg)`,
    color: `var(--course-${t}-fg)`,
    borderColor: `var(--course-${t}-border)`,
  };
}

/** CSS custom properties, which React's style type doesn't list. */
export const vars = (v: Record<string, string | number>) => v as CSSProperties;
