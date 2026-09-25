import {
  Component,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useState,
} from "react";
import { track } from "~/app/analytics";
import { clientConfig } from "~/app/config";
import { type Connection, TILES_KEY } from "~/core/schema";
import { useCatalog } from "~/state/catalog-store";
import { useRouteGeometry } from "~/state/data-hooks";
import { Skeleton } from "~/ui/skeleton";
import { RouteDrawing } from "./route-drawing";

// The map of the actual route (SPEC §3.7): the path UMD's routing network
// found, on campus tiles. Never a straight line: without geometry the map is
// hidden, with one quiet line saying so.
//
// Live data draws it with MapLibre on `geo/tiles.pmtiles`. Mock mode has no
// tiles (fixtures stay offline), so it draws the same path on a plain themed
// background, as does a browser without WebGL.

const loadLiveMap = () => import("./live-route-map");
const LiveRouteMap = lazy(() =>
  loadLiveMap().then((m) => ({ default: m.LiveRouteMap })),
);

function tilesUrl(): string {
  return new URL(
    `${clientConfig.dataBaseUrl.replace(/\/+$/, "")}/${TILES_KEY}`,
    window.location.href,
  ).href;
}

export function RouteMap({ connection }: { connection: Connection }) {
  const { from, to, mode } = connection;
  const kind = useCatalog((s) => s.reader?.kind ?? null);
  const { geometry, state } = useRouteGeometry(
    from.building,
    to.building,
    mode,
  );
  const [webgl, setWebgl] = useState(true);
  const live = kind === "live" && webgl;

  // Start fetching MapLibre alongside the route, not after it.
  useEffect(() => {
    if (kind === "live") void loadLiveMap();
  }, [kind]);

  const settled = state === "ready" || state === "error";
  const hasGeometry = geometry !== null;
  useEffect(() => {
    if (settled) track("route_map_shown", { mode, hasGeometry });
  }, [settled, hasGeometry, mode]);

  if (settled && !geometry)
    return (
      <p className="text-[11.5px] text-faint" data-testid="route-map-missing">
        Map unavailable for this route
      </p>
    );

  return (
    <div className="relative aspect-[8/5] w-full overflow-hidden rounded-lg border border-hairline bg-panel">
      {!geometry ? (
        <Skeleton className="absolute inset-0 rounded-none" />
      ) : live ? (
        <IfMapFails
          fallback={
            <RouteDrawing
              route={geometry}
              from={from.building}
              to={to.building}
            />
          }
        >
          <Suspense
            fallback={<Skeleton className="absolute inset-0 rounded-none" />}
          >
            <LiveRouteMap
              route={geometry}
              from={from.building}
              to={to.building}
              tilesUrl={tilesUrl()}
              onUnavailable={() => setWebgl(false)}
            />
          </Suspense>
        </IfMapFails>
      ) : (
        <RouteDrawing route={geometry} from={from.building} to={to.building} />
      )}
    </div>
  );
}

/** The map's chunk failed to load (offline, a deploy in between): draw it without tiles. */
class IfMapFails extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.error(error);
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
