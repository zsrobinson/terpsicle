import type { ComponentProps, CSSProperties, ReactNode } from "react";

// What every live preview on the marketing page shares. Each preview is
// self-contained: its own sample data and its own state, never the
// scheduler's stores or IndexedDB (scripts/check-bundle.ts keeps them off
// `/`). They load as they near the viewport (../blocks.tsx).
//
// They import nothing the scheduler also imports but the tooltip: a module
// both pages share is split into chunks of its own, which costs both pages.
// So the block hands each preview its mark, and SampleButton draws the Ink
// button here.

export interface PreviewProps {
  /** On screen: start the preview's little show (messages arriving, …). */
  active: boolean;
  /** Skip the show: everything in its end state at once. */
  reduced: boolean;
  /** The product's mark, for the preview's header. */
  mark?: ReactNode;
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

const PRESS =
  "active:translate-x-(--offset) active:translate-y-(--offset) active:shadow-none";
const SAMPLE_BUTTON = {
  outline: `border border-fg bg-raised text-fg shadow-offset hover:bg-hover ${PRESS}`,
  filled: "bg-accent text-accent-fg",
};
const SAMPLE_SIZE = {
  row: "h-6 px-2 text-sm",
  sm: "h-7 px-2.5",
  icon: "size-7",
};

/** The Ink button (src/components/ui/button.tsx), in the sizes the samples use. */
export function SampleButton({
  look = "outline",
  size = "row",
  className = "",
  ...props
}: ComponentProps<"button"> & {
  look?: keyof typeof SAMPLE_BUTTON;
  size?: keyof typeof SAMPLE_SIZE;
}) {
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-semibold transition-colors focus-visible:outline-offset-2 ${SAMPLE_BUTTON[look]} ${SAMPLE_SIZE[size]} ${className}`}
      {...props}
    />
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
