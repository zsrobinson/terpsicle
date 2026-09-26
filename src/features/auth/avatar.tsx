import { cn } from "cn";
import { useState } from "react";

/** "Testudo Terrapin" → "TT"; one word → its first letter. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/**
 * Someone's Google picture (our cached copy), or their initials when there
 * isn't one or it fails to load. Decorative: the name is always next to it.
 * `data-private` keeps it out of session recordings (V2.md §11).
 */
export function Avatar({
  name,
  src,
  size = "sm",
}: {
  name: string;
  src: string | null;
  size?: "sm" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const box = size === "lg" ? "size-12 text-base" : "size-6 text-2xs";
  if (src && !failed)
    return (
      <img
        src={src}
        alt=""
        data-private=""
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full bg-hover object-cover", box)}
      />
    );
  return (
    <span
      aria-hidden="true"
      data-private=""
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-hover font-medium text-muted",
        box,
      )}
    >
      {initials(name)}
    </span>
  );
}
