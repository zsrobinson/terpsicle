import { cn } from "cn";
import { Search, X } from "lucide-react";
import type * as React from "react";
import { WithTooltip } from "./tooltip";

// One field for every product (docs/COHESION.md §3, Phase 2), replacing five
// text inputs and four search boxes: one height scale (32px on a desktop,
// 44px on phones, where the text is 16px so iOS doesn't zoom; styles.css),
// one border (hairline-strong) and one focus rule (the 2px ink ring).

const FIELD =
  "h-11 w-full min-w-0 border border-hairline-strong bg-raised text-base text-fg placeholder:text-muted disabled:opacity-50 md:h-8";

/** A text field. Label it: a `<label>`, or `aria-label` when there's no room. */
function Input({
  className,
  type = "text",
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(FIELD, "px-2.5", className)}
      {...props}
    />
  );
}

/**
 * A text area: the field's border, fill, type and focus, at the height its
 * `rows` give (a review, a note to a moderator). Label it like `Input`.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 border border-hairline-strong bg-raised px-2.5 py-1.5 text-base text-fg leading-5 placeholder:text-muted disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A search box: the magnifier, the field and, once there's text, Clear. The
 * box draws the focus ring, so the icon and Clear sit inside it.
 */
function SearchField({
  className,
  value,
  onClear,
  clearLabel = "Clear the search",
  hint,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & {
  /** Shows Clear while there's text. Esc in the field is the caller's. */
  onClear?: () => void;
  clearLabel?: string;
  /** In Clear's place while the field is empty: its shortcut (`<Kbd>/</Kbd>`). */
  hint?: React.ReactNode;
}) {
  const hasText = typeof value === "string" && value !== "";
  return (
    <div
      data-slot="search-field"
      className={cn(
        FIELD,
        "flex items-center gap-2 pl-2.5 focus-within:focus-outline has-disabled:opacity-50",
        className,
      )}
    >
      <Search size={14} aria-hidden="true" className="shrink-0 text-muted" />
      <input
        type="search"
        value={value}
        className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      {onClear && hasText ? (
        <WithTooltip label={clearLabel}>
          <button
            type="button"
            aria-label={clearLabel}
            onClick={onClear}
            className="flex size-11 shrink-0 items-center justify-center text-muted hover:text-fg md:size-7"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </WithTooltip>
      ) : hint ? (
        // A shortcut means nothing without a keyboard (QA S11: Plan's "/" on
        // a phone), so a touch screen keeps just the edge's spacer.
        <>
          <span className="flex shrink-0 items-center pr-2 pointer-coarse:hidden">
            {hint}
          </span>
          <span className="hidden w-0.5 shrink-0 pointer-coarse:block" />
        </>
      ) : (
        // Keeps the text clear of the right edge when there's no button.
        <span className="w-0.5 shrink-0" />
      )}
    </div>
  );
}

export { Input, SearchField, Textarea };
