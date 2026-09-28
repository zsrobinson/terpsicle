import { cn } from "cn";
import type { TermTag as Tag } from "~/core/catalog/term-tag";

// One small tag, the same everywhere a term is named (docs/V2.md §5.5): Now
// is quiet but firm (an ink border), Next quieter (a hairline). Other terms
// get none, so the two that matter stand out.

const WORDS: Record<Tag, string> = { now: "Now", next: "Next" };

export function TermTag({
  tag,
  className,
}: {
  tag: Tag | null;
  className?: string;
}) {
  if (!tag) return null;
  return (
    <span
      data-term-tag={tag}
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center border px-1 font-normal text-xs leading-none",
        tag === "now"
          ? "border-fg text-fg"
          : "border-hairline-strong text-muted",
        className,
      )}
    >
      {WORDS[tag]}
    </span>
  );
}

/**
 * The main plan's mark: a small square in Schedule's red, beside the plan's
 * name wherever it's one of two or more (docs/V2.md §5.5). Decorative: the
 * words around it ("main plan") or its tab's label say what it means.
 */
export function MainPlanMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-main-plan-mark=""
      className={cn(
        "inline-block size-[7px] shrink-0 bg-product-schedule-line",
        className,
      )}
    />
  );
}
