import { cn } from "cn";

/** "Testudo Terrapin" → "TT"; one word → its first letter. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/**
 * Someone's initials in ink (the owner: black, not gray; paper in dark).
 * Terpsicle never shows or keeps profile pictures (docs/decisions.md), so
 * this is everyone's mark. Decorative: the name is always next to it.
 * `data-private` keeps it out of analytics (docs/ANALYTICS.md "Privacy").
 */
export function Avatar({
  name,
  size = "sm",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const box =
    size === "lg"
      ? "size-12 text-base"
      : size === "md"
        ? "size-8 text-xs"
        : "size-6 text-2xs";
  return (
    <span
      aria-hidden="true"
      data-private=""
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-accent font-medium text-accent-fg",
        box,
      )}
    >
      {initials(name)}
    </span>
  );
}
