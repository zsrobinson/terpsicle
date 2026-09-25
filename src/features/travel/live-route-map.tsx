import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "cn";
import {
  addProtocol,
  Map as MapLibre,
  Marker,
  setWorkerUrl,
} from "maplibre-gl";
// MapLibre finds its worker next to its own file, which Vite moves; hand it
// Vite's bundle of the worker instead (one file, with its shared code).
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { Protocol } from "pmtiles";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BuildingCode, RouteGeometry } from "~/core/schema";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { boundsOf } from "./geo";
import { readMapColors, routeMapStyle } from "./map-style";
import { useDarkTheme } from "./use-dark-theme";

// The route on real campus tiles: MapLibre GL reading `geo/tiles.pmtiles`
// with HTTP range requests. This module is its own chunk, loaded only when a
// connection's details open in live mode, so MapLibre never weighs on the
// main bundle.

let setUp = false;
function setUpMapLibre() {
  if (setUp) return;
  setWorkerUrl(workerUrl);
  addProtocol("pmtiles", new Protocol().tile);
  setUp = true;
}

export function LiveRouteMap({
  route,
  from,
  to,
  tilesUrl,
  onUnavailable,
}: {
  route: RouteGeometry;
  from: BuildingCode;
  to: BuildingCode;
  /** An absolute URL to `geo/tiles.pmtiles`. */
  tilesUrl: string;
  /** No WebGL here: the caller draws the route without tiles instead. */
  onUnavailable: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const dark = useDarkTheme();
  const [loaded, setLoaded] = useState(false);
  /** The theme the map's current style was built for. */
  const styledDark = useRef(dark);
  const [labels] = useState(() => ({
    start: document.createElement("div"),
    end: document.createElement("div"),
  }));
  // The latest callback, without re-creating the map when it changes.
  const unavailable = useRef(onUnavailable);
  unavailable.current = onUnavailable;

  // One map per route; it's torn down with the view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the theme is applied by the effect below, without rebuilding the map
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    setUpMapLibre();
    const b = boundsOf(route.coordinates);
    let instance: MapLibre;
    try {
      instance = new MapLibre({
        container: element,
        style: routeMapStyle({
          tilesUrl,
          route,
          dark,
          colors: readMapColors(document.documentElement),
        }),
        bounds: [b.west, b.south, b.east, b.north],
        fitBoundsOptions: { padding: FIT_PADDING, maxZoom: 17.5 },
        attributionControl: false,
        // A small map inside a scrolling panel: scrolling moves the panel,
        // not the map. Drag, pinch and double-click still zoom and pan.
        scrollZoom: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxZoom: 19,
        minZoom: 12,
        fadeDuration: 0,
      });
    } catch (error) {
      console.info("The route map needs WebGL", error);
      unavailable.current();
      return;
    }
    instance.touchZoomRotate.disableRotation();
    instance.keyboard.disableRotation();
    // Fit again whenever the box changes size (the drawer snapping, the
    // sidebar opening): the route always fills the map, never runs off it.
    const refit = () => {
      instance.resize();
      instance.fitBounds([b.west, b.south, b.east, b.north], {
        padding: FIT_PADDING,
        maxZoom: 17.5,
        animate: false,
      });
    };
    const resizes = new ResizeObserver(refit);
    resizes.observe(element);
    instance.once("load", () => {
      refit();
      setLoaded(true);
    });
    const start = route.coordinates[0];
    const end = route.coordinates.at(-1);
    const markers = [
      start &&
        new Marker({ element: labels.start, anchor: "bottom", offset: [0, -9] })
          .setLngLat([start[0], start[1]])
          .addTo(instance),
      end &&
        new Marker({ element: labels.end, anchor: "bottom", offset: [0, -9] })
          .setLngLat([end[0], end[1]])
          .addTo(instance),
    ];
    map.current = instance;
    styledDark.current = dark;
    return () => {
      resizes.disconnect();
      for (const m of markers) m?.remove();
      instance.remove();
      map.current = null;
    };
  }, [route, tilesUrl, labels]);

  // Theme changes restyle the map in place.
  useEffect(() => {
    const instance = map.current;
    if (!instance || styledDark.current === dark) return;
    styledDark.current = dark;
    instance.setStyle(
      routeMapStyle({
        tilesUrl,
        route,
        dark,
        colors: readMapColors(document.documentElement),
      }),
    );
  }, [dark, route, tilesUrl]);

  return (
    <div className="relative h-full w-full" data-testid="route-map">
      <div
        ref={container}
        className={cn(
          "absolute inset-0 transition-opacity duration-200",
          loaded ? "opacity-100" : "opacity-0",
        )}
        role="img"
        aria-label={`Map of the walking route from ${from} to ${to}`}
      />
      {loaded ? null : <Skeleton className="absolute inset-0 rounded-none" />}
      {createPortal(<EndLabel code={from} />, labels.start)}
      {createPortal(<EndLabel code={to} />, labels.end)}
      <div className="absolute right-0 bottom-0 rounded-tl-md bg-raised/85 px-1.5 py-px text-2xs text-muted [&_a:hover]:text-fg [&_a]:underline-offset-2 [&_a:hover]:underline">
        <WithTooltip label="Map tiles by Protomaps">
          <a href="https://protomaps.com" target="_blank" rel="noreferrer">
            Protomaps
          </a>
        </WithTooltip>{" "}
        ©{" "}
        <WithTooltip label="Map data from OpenStreetMap contributors (ODbL)">
          <a
            href="https://openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap
          </a>
        </WithTooltip>
      </div>
    </div>
  );
}

/** Room above the route for the end labels, and a margin elsewhere. */
const FIT_PADDING = { top: 44, bottom: 30, left: 30, right: 30 };

function EndLabel({ code }: { code: string }) {
  return (
    <span className="ident pointer-events-none block rounded-md border border-hairline-strong bg-raised px-1.5 py-px font-medium text-fg text-xs shadow-xs">
      {code}
    </span>
  );
}
