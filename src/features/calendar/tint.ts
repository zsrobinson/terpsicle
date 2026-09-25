import type { CSSProperties } from "react";
import { courseColorTokens } from "~/core/color";
import type { CourseColor } from "~/core/schema";

// Course tints as inline CSS variables. Tailwind can't see class names built
// from a palette id, so each id maps to its theme tokens (src/styles.css)
// here, and both themes follow automatically.

const cssVar = (token: string) => `var(--${token})`;

/** Soft fill, darker text and a matching border: a placed class. */
export function tintStyle(color: CourseColor): CSSProperties {
  const t = courseColorTokens(color);
  return {
    backgroundColor: cssVar(t.bg),
    borderColor: cssVar(t.border),
    color: cssVar(t.fg),
  };
}

/**
 * A ghost: the course's border and text on a paler fill. Opaque, so the
 * dimmed classes under it don't show through its label.
 */
export function ghostStyle(color: CourseColor): CSSProperties {
  const t = courseColorTokens(color);
  return {
    backgroundColor: `color-mix(in oklab, ${cssVar(t.bg)} 55%, var(--bg))`,
    borderColor: cssVar(t.border),
    color: cssVar(t.fg),
  };
}

/** The course dot (lists, the hint strip, the color picker). */
export function dotStyle(color: CourseColor): CSSProperties {
  return { backgroundColor: cssVar(courseColorTokens(color).dot) };
}
