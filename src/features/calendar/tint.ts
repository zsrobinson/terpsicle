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

/**
 * A class dimmed while another course's sections show: a faded fill and
 * border with muted text. Fading the whole block with opacity would take
 * its words below AA contrast, and it's still a button.
 */
export function dimmedStyle(color: CourseColor): CSSProperties {
  const t = courseColorTokens(color);
  return {
    backgroundColor: `color-mix(in oklab, ${cssVar(t.bg)} 40%, var(--bg))`,
    borderColor: `color-mix(in oklab, ${cssVar(t.border)} 35%, var(--bg))`,
    color: "var(--muted)",
  };
}

/** The course dot (lists, the hint strip, the color picker). */
export function dotStyle(color: CourseColor): CSSProperties {
  return { backgroundColor: cssVar(courseColorTokens(color).dot) };
}
