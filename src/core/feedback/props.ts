// Small, zod-free helpers the page's activity log (src/lib/activity-log.ts)
// shares with `buildFeedbackContext`: the log loads with every page, so it
// can't bring the feedback schemas with it.

/** How many app actions the log keeps and a report carries. */
export const ACTIVITY_LOG_SIZE = 50;

/** An analytics-style property value: short, never free text. */
export type PropValue = string | number | boolean | null;

/** `text` cut to `max` characters, with an ellipsis when cut. */
export const cut = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

const PROP_KEY = /^[A-Za-z0-9_]{1,40}$/;

/** At most `max` valid keys, strings cut to 200: the schema's record. */
export function boundedProps(
  props: Readonly<Record<string, unknown>>,
  max: number,
): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const [key, value] of Object.entries(props)) {
    if (Object.keys(out).length >= max) break;
    if (!PROP_KEY.test(key)) continue;
    if (typeof value === "string") out[key] = cut(value, 200);
    else if (typeof value === "number")
      out[key] = Number.isFinite(value) ? value : null;
    else if (typeof value === "boolean" || value === null) out[key] = value;
    // Arrays of short values (Generate's wildcards) read as one line.
    else if (Array.isArray(value))
      out[key] = cut(value.filter((v) => typeof v !== "object").join(","), 200);
  }
  return out;
}
