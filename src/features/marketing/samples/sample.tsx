import type { CSSProperties, ReactNode } from "react";
import { Mark } from "~/app/brand/mark";
import type { MarketingProduct } from "../products";

// What the five live samples on the marketing page share. Each sample is
// self-contained: its own sample data and state, never the scheduler's
// stores or IndexedDB (scripts/check-bundle.ts keeps those off `/`). They
// render on the server like the rest of the page, and come alive once
// hydrated.

export interface SampleProps {
  /** On screen: start the sample's little show (messages arriving, …). */
  active: boolean;
  /** Skip the show: everything in its end state at once. */
  reduced: boolean;
}

/**
 * The card every sample sits in: an Ink card (keyline and offset) with a
 * title row, a "Sample" tag so nobody reads made-up seats or reviews as
 * real, and a polite live region for what changed.
 */
export function SampleCard({
  product,
  title,
  status,
  children,
  className = "",
}: {
  product: MarketingProduct;
  title: ReactNode;
  /** The last thing that changed, read out by screen readers. */
  status?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-sample={product}
      className={`w-full border border-keyline bg-raised text-fg shadow-offset ${className}`}
    >
      <div className="flex h-9 items-center gap-2 border-hairline border-b px-3">
        <Mark id={product} size={16} />
        <div className="min-w-0 flex-1 truncate font-semibold text-base">
          {title}
        </div>
        <SampleTag />
      </div>
      {children}
      <output aria-live="polite" className="sr-only">
        {status}
      </output>
    </div>
  );
}

export function SampleTag() {
  return (
    <span className="shrink-0 border border-hairline-strong px-1 font-semibold text-2xs text-faint">
      Sample
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
  | "pink"
  | "green"
  | "cyan"
  | "indigo";

export function tint(t: Tint): CSSProperties {
  return {
    backgroundColor: `var(--course-${t}-bg)`,
    color: `var(--course-${t}-fg)`,
    borderColor: `var(--course-${t}-border)`,
  };
}

/** The dot beside a course's name, in its tint. */
export function dot(t: Tint): CSSProperties {
  return { backgroundColor: `var(--course-${t}-dot)` };
}

/** "10:00" from minutes since midnight; "10:00am" with the period. */
export function clock(minutes: number, period = false): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour = ((h + 11) % 12) + 1;
  const text = `${hour}:${String(m).padStart(2, "0")}`;
  return period ? `${text}${h < 12 ? "am" : "pm"}` : text;
}
