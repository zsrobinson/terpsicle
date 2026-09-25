import { useId } from "react";
import type { BuildingCode, RouteGeometry } from "~/core/schema";
import { pathData, projectToBox } from "./geo";

// The route on a plain themed background, without map tiles: what mock mode
// shows (fixtures have no tiles), and what live mode falls back to when the
// browser can't run WebGL. It's the same path UMD's routing network found,
// never a straight line, just without the campus drawn under it.

const WIDTH = 320;
const HEIGHT = 200;
const PADDING = 34;

export function RouteDrawing({
  route,
  from,
  to,
}: {
  route: RouteGeometry;
  from: BuildingCode;
  to: BuildingCode;
}) {
  // Several details views can be mounted at once (drill levels stay mounted).
  const dots = `route-dots-${useId()}`;
  const { points } = projectToBox(route.coordinates, WIDTH, HEIGHT, PADDING);
  const d = pathData(points);
  const start = points[0];
  const end = points.at(-1);
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="block h-full w-full"
      role="img"
      aria-label={`Walking route from ${from} to ${to}`}
      data-testid="route-drawing"
    >
      <defs>
        <pattern id={dots} width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" className="fill-hairline-strong" />
        </pattern>
      </defs>
      <rect width={WIDTH} height={HEIGHT} className="fill-panel" />
      <rect width={WIDTH} height={HEIGHT} fill={`url(#${dots})`} />
      <path
        d={d}
        fill="none"
        className="stroke-panel"
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={d}
        fill="none"
        className="stroke-fg"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-testid="route-line"
      />
      {start ? <Endpoint at={start} label={from} kind="start" /> : null}
      {end ? <Endpoint at={end} label={to} kind="end" /> : null}
    </svg>
  );
}

function Endpoint({
  at: [x, y],
  label,
  kind,
}: {
  at: readonly [number, number];
  label: string;
  kind: "start" | "end";
}) {
  // Labels sit above the point, or below it near the top edge.
  const below = y < 30;
  const width = label.length * 6.6 + 12;
  const left = Math.min(Math.max(x - width / 2, 4), WIDTH - width - 4);
  const top = below ? y + 9 : y - 27;
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={5}
        strokeWidth={2.5}
        className={
          kind === "start" ? "fill-raised stroke-fg" : "fill-fg stroke-raised"
        }
      />
      <rect
        x={left}
        y={top}
        width={width}
        height={18}
        rx={5}
        className="fill-raised stroke-hairline-strong"
        strokeWidth={1}
      />
      <text
        x={left + width / 2}
        y={top + 12.5}
        textAnchor="middle"
        className="ident fill-fg font-medium"
        fontSize={11}
      >
        {label}
      </text>
    </g>
  );
}
