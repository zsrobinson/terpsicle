import { cn } from "cn";
import { Star } from "lucide-react";

// Stars, every product's: gold with a darker gold line in light mode (the
// fill alone is too pale on paper to read as a shape, and the old dark
// yellow read as brown; owner, 2026-09-29), one gold in dark mode. A rating
// fills as much of each star as it has: 4.6 is four stars and three fifths.

/** A rating as it's read out: 4, 4.5, 4.6 (never 4.0). */
export function starsWords(rating: number): string {
  return `${Number(rating.toFixed(1))} out of 5 stars`;
}

/** One gold star, beside a number ("★ 4.2"); decoration, since the number says it. */
export function StarMark({
  size = 11,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Star
      size={size}
      aria-hidden="true"
      className={cn("shrink-0 fill-star text-star-line", className)}
    />
  );
}

/** Five stars, filled to `rating` (fractions too), read out as "4.6 out of 5 stars". */
export function Stars({
  rating,
  size = 12,
  className,
}: {
  rating: number;
  /** 12 in a row; 14 over a review's words; 22 beside the big number. */
  size?: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={starsWords(rating)}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <StarPart key={n} size={size} fill={rating - (n - 1)} />
      ))}
    </span>
  );
}

/** One star, `fill` of it (0 to 1, clamped) in gold from the left. */
export function StarPart({ size, fill }: { size: number; fill: number }) {
  const part = Math.min(1, Math.max(0, fill));
  return (
    <span
      aria-hidden="true"
      className="relative inline-block shrink-0"
      style={{ width: size, height: size }}
    >
      <Star size={size} className="absolute inset-0 text-hairline-strong" />
      {part > 0 ? (
        <span
          className="absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: `${part * 100}%` }}
        >
          <Star size={size} className="fill-star text-star-line" />
        </span>
      ) : null}
    </span>
  );
}
