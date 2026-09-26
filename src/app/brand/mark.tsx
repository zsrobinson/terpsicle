import { drawMark, type MarkId, type MarkLayer, type MarkRole } from "./marks";

// A mark in the page, colored by tokens, so it follows the theme (the
// umbrella's tile is paper in light and near-black in dark; product tiles
// keep their color and swap the offset). The drawing is in ./marks. Each
// glyph has its own paint token (`product-<id>-fg`: paper, or ink on Todo's
// yellow; marks.ts GLYPH_PAINT), and a keyline drawn in one theme only
// (Todo's, in light) hides in the other.

/** Fill (and, for the keyline, stroke) classes per mark and role. */
const PAINT: Record<
  MarkId,
  Record<MarkRole, { fill: string; stroke: string }>
> = {
  umbrella: {
    tile: { fill: "fill-umbrella-tile", stroke: "stroke-umbrella-tile" },
    glyph: { fill: "fill-umbrella-glyph", stroke: "stroke-umbrella-glyph" },
    keyline: {
      fill: "fill-umbrella-keyline",
      stroke: "stroke-umbrella-keyline",
    },
    offset: { fill: "fill-umbrella-offset", stroke: "stroke-umbrella-offset" },
  },
  schedule: {
    tile: { fill: "fill-product-schedule", stroke: "stroke-product-schedule" },
    glyph: {
      fill: "fill-product-schedule-fg",
      stroke: "stroke-product-schedule-fg",
    },
    keyline: { fill: "fill-keyline", stroke: "stroke-keyline" },
    offset: { fill: "fill-mark-offset", stroke: "stroke-mark-offset" },
  },
  reviews: {
    tile: { fill: "fill-product-reviews", stroke: "stroke-product-reviews" },
    glyph: {
      fill: "fill-product-reviews-fg",
      stroke: "stroke-product-reviews-fg",
    },
    keyline: { fill: "fill-keyline", stroke: "stroke-keyline" },
    offset: { fill: "fill-mark-offset", stroke: "stroke-mark-offset" },
  },
  chat: {
    tile: { fill: "fill-product-chat", stroke: "stroke-product-chat" },
    glyph: {
      fill: "fill-product-chat-fg",
      stroke: "stroke-product-chat-fg",
    },
    keyline: { fill: "fill-keyline", stroke: "stroke-keyline" },
    offset: { fill: "fill-mark-offset", stroke: "stroke-mark-offset" },
  },
  plan: {
    tile: { fill: "fill-product-plan", stroke: "stroke-product-plan" },
    glyph: {
      fill: "fill-product-plan-fg",
      stroke: "stroke-product-plan-fg",
    },
    keyline: { fill: "fill-keyline", stroke: "stroke-keyline" },
    offset: { fill: "fill-mark-offset", stroke: "stroke-mark-offset" },
  },
  todo: {
    tile: { fill: "fill-product-todo", stroke: "stroke-product-todo" },
    glyph: {
      fill: "fill-product-todo-fg",
      stroke: "stroke-product-todo-fg",
    },
    keyline: {
      fill: "fill-product-todo-keyline",
      stroke: "stroke-product-todo-keyline",
    },
    offset: { fill: "fill-mark-offset", stroke: "stroke-mark-offset" },
  },
};

/** A layer drawn in one theme only hides in the other. */
const ONLY_IN = { light: "dark:hidden", dark: "hidden dark:inline" } as const;

/**
 * One of the six marks at `size` px. With a `label` it's an image with that
 * name; without one it's decoration beside words that already say it.
 */
export function Mark({
  id,
  size,
  label,
  className,
}: {
  id: MarkId;
  size: number;
  label?: string;
  className?: string;
}) {
  const { viewBox, layers } = drawMark(id, size);
  const paint = PAINT[id];
  const shapes = layers.map((layer, i) => (
    <Layer
      // The layers of one mark never reorder.
      // biome-ignore lint/suspicious/noArrayIndexKey: see above
      key={i}
      layer={layer}
      paint={paint[layer.role]}
    />
  ));
  const common = { width: size, height: size, viewBox, className };
  return label ? (
    <svg role="img" aria-label={label} data-mark={id} {...common}>
      {shapes}
    </svg>
  ) : (
    <svg aria-hidden="true" data-mark={id} {...common}>
      {shapes}
    </svg>
  );
}

function Layer({
  layer,
  paint,
}: {
  layer: MarkLayer;
  paint: { fill: string; stroke: string };
}) {
  switch (layer.kind) {
    case "rect":
      return (
        <rect
          x={layer.x}
          y={layer.y}
          width={layer.size}
          height={layer.size}
          className={paint.fill}
        />
      );
    case "outline":
      return (
        <rect
          x={layer.x}
          y={layer.y}
          width={layer.size}
          height={layer.size}
          fill="none"
          strokeWidth={layer.width}
          className={
            layer.only ? `${paint.stroke} ${ONLY_IN[layer.only]}` : paint.stroke
          }
        />
      );
    case "halo":
      return (
        <path
          d={layer.d}
          strokeWidth={layer.width}
          strokeLinejoin="miter"
          className={`${paint.fill} ${paint.stroke}`}
        />
      );
    case "path":
      return (
        <path
          d={layer.d}
          opacity={layer.opacity < 1 ? layer.opacity : undefined}
          className={paint.fill}
        />
      );
  }
}
