import { z } from "zod";
import type { TravelMode } from "~/core/schema";
import type { HttpClient } from "../http";

// UMD's campus routing network (gis.umd.edu ArcGIS Server; RESEARCH.md §5.3).
// Mirrors what UMD's own map app does (maps.umd.edu/map/js/dynamicRouting.js)
// so our distances match it: the same barrier polygon, and card-only
// entrances left out of standard routes.

export const TOKEN_URL = "https://maps.umd.edu/api/PortalToken/tokens.js";
const NAVIGATION = "https://gis.umd.edu/arcgis/rest/services/Navigation";

const service = (mode: TravelMode) =>
  `${NAVIGATION}/${mode === "accessible" ? "DynamicRoutingAccessible" : "DynamicRouting"}`;

/**
 * UMD's map app always sends this one barrier (`ColeConstPoly`, web
 * mercator), a closed walkway between Knight Hall and the Clarice Smith
 * center. Kept as data: drop it when UMD's app does.
 */
export const ROUTING_BARRIERS = [
  [
    [-8566006.92203236, 4719849.920474799],
    [-8566180.099674555, 4719860.669431901],
    [-8566188.459974522, 4720094.757831004],
    [-8566004.533375226, 4720100.729473839],
    [-8566006.92203236, 4720100.729473839],
    [-8566006.92203236, 4719849.920474799],
  ],
] as const;

const barriersParam = JSON.stringify({
  type: "features",
  features: ROUTING_BARRIERS.map((ring) => ({
    geometry: { rings: [ring], spatialReference: { wkid: 102100 } },
  })),
});

export interface GisToken {
  token: string;
  expires: number;
}

/** `var tokenJSON = {…"token": "…", "expires": 1791086407208…}` */
export function parseTokenScript(text: string): GisToken {
  const m = /"token":\s*"([^"]+)"[\s\S]*?"expires":\s*(\d+)/.exec(text);
  if (!m?.[1] || !m[2]) {
    throw new Error(
      `${TOKEN_URL} has no "token"/"expires" pair; UMD changed its format`,
    );
  }
  return { token: m[1], expires: Number(m[2]) };
}

export async function fetchToken(http: HttpClient): Promise<GisToken> {
  try {
    return parseTokenScript(await http.text(TOKEN_URL));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Couldn't get a routing token from ${TOKEN_URL}: ${message}. maps.umd.edu serves an incomplete TLS chain; run with NODE_EXTRA_CA_CERTS including scripts/certs/umd-intermediates.pem.`,
    );
  }
}

export interface Entrance {
  building: string;
  lng: number;
  lat: number;
}

const EntranceApiSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        LOCATIONID: z.string().nullable(),
        Accessible: z.string().nullable(),
        Card_Acces: z.string().nullable(),
      }),
      geometry: z.object({ x: z.number(), y: z.number() }),
    }),
  ),
});

const ArcGisErrorSchema = z.object({
  error: z.object({
    code: z.number().optional(),
    message: z.string().optional(),
    details: z.array(z.string()).optional(),
  }),
});

/**
 * ArcGIS answers HTTP 200 with `{"error":{"code":503,…"was unavailable"}}`
 * when a service instance is busy; retry those like a 503.
 */
async function postArcGis(
  http: HttpClient,
  url: string,
  body: URLSearchParams,
  attempts = 4,
  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
): Promise<unknown> {
  let json: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    json = await http.json(url, { method: "POST", body });
    const code = ArcGisErrorSchema.safeParse(json).data?.error.code;
    if (code === undefined || ![500, 502, 503, 504].includes(code)) return json;
  }
  return json;
}

function arcGisError(json: unknown): string | null {
  const parsed = ArcGisErrorSchema.safeParse(json);
  if (!parsed.success) return null;
  const { code, message, details } = parsed.data.error;
  return `ArcGIS ${code ?? "error"}: ${[message, ...(details ?? [])].filter(Boolean).join(" ")}`;
}

/**
 * Routable entrances per building number for a mode, filtered the way UMD's
 * map filters them: standard drops card-only entrances (unless a building has
 * nothing else); accessible drops entrances marked not accessible.
 */
export async function fetchEntrances(
  http: HttpClient,
  token: string,
  mode: TravelMode,
  buildingNumbers: readonly string[],
): Promise<Map<string, Entrance[]>> {
  const where = `WEBMAP = 'Yes' AND NAV_USE = 'Yes' AND Entr_Type <> 'Emergency Exit' AND LOCATIONID IN (${buildingNumbers
    .map((n) => `'${n.replaceAll("'", "")}'`)
    .join(",")})`;
  const body = new URLSearchParams({
    f: "json",
    where,
    returnGeometry: "true",
    outFields: "LOCATIONID,Accessible,Card_Acces",
    outSR: "4326",
    token,
  });
  const json = await postArcGis(
    http,
    `${service(mode)}/MapServer/13/query`,
    body,
  );
  const error = arcGisError(json);
  if (error) throw new Error(`Entrances (${mode}): ${error}`);
  const parsed = EntranceApiSchema.parse(json);

  const raw = new Map<
    string,
    { e: Entrance; card: boolean; accessible: boolean }[]
  >();
  for (const f of parsed.features) {
    const building = f.attributes.LOCATIONID;
    if (!building) continue;
    const list = raw.get(building) ?? [];
    list.push({
      e: { building, lng: f.geometry.x, lat: f.geometry.y },
      card: f.attributes.Card_Acces === "Yes",
      accessible: f.attributes.Accessible !== "No",
    });
    raw.set(building, list);
  }
  const out = new Map<string, Entrance[]>();
  for (const [building, list] of raw) {
    const usable =
      mode === "accessible"
        ? list.filter((x) => x.accessible)
        : list.some((x) => !x.card)
          ? list.filter((x) => !x.card)
          : list;
    if (usable.length > 0)
      out.set(
        building,
        usable.map((x) => x.e),
      );
  }
  return out;
}

const features = (entrances: readonly Entrance[]) =>
  JSON.stringify({
    type: "features",
    doNotLocateOnRestrictedElements: true,
    // Only `Name`: ArcGIS field names are case-insensitive, so any NAME attribute would overwrite it.
    features: entrances.map((e) => ({
      geometry: { x: e.lng, y: e.lat, spatialReference: { wkid: 4326 } },
      attributes: { Name: e.building },
    })),
  });

const CfApiSchema = z.object({
  routes: z
    .object({
      features: z.array(
        z.object({
          attributes: z.object({
            IncidentID: z.number(),
            FacilityID: z.number(),
            Total_Length: z.number(),
          }),
        }),
      ),
    })
    .optional(),
});

export interface Closest {
  /** Destination building number. */
  to: string;
  feet: number;
  from: Entrance;
  toEntrance: Entrance;
}

/**
 * Shortest walks from one building (any of its entrances) to each of the
 * given buildings, in one closest-facility solve. Buildings with no route are
 * absent from the result.
 */
export async function solveClosest(
  http: HttpClient,
  token: string,
  mode: TravelMode,
  from: readonly Entrance[],
  to: readonly Entrance[],
): Promise<Map<string, Closest>> {
  const body = new URLSearchParams({
    f: "json",
    returnDirections: "false",
    returnFacilities: "false",
    returnIncidents: "false",
    returnBarriers: "false",
    returnPolygonBarriers: "false",
    returnPolylineBarriers: "false",
    returnCFRoutes: "true",
    useHierarchy: "false",
    outSR: "4326",
    outputLines: "esriNAOutputLineNone",
    defaultTargetFacilityCount: String(to.length),
    incidents: features(from),
    facilities: features(to),
    polygonBarriers: barriersParam,
    token,
  });
  const json = await postArcGis(
    http,
    `${service(mode)}/NAServer/Closest%20Facility/solveClosestFacility`,
    body,
  );
  const best = new Map<string, Closest>();
  const error = arcGisError(json);
  if (error) {
    // "No solution found": nothing reachable from here in this mode.
    if (/no solution|no "facilities" found/i.test(error)) return best;
    throw new Error(`Closest facility (${mode}): ${error}`);
  }
  for (const route of CfApiSchema.parse(json).routes?.features ?? []) {
    const { IncidentID, FacilityID, Total_Length } = route.attributes;
    const origin = from[IncidentID - 1];
    const target = to[FacilityID - 1];
    if (!origin || !target) continue;
    const prior = best.get(target.building);
    if (!prior || Total_Length < prior.feet) {
      best.set(target.building, {
        to: target.building,
        feet: Total_Length,
        from: origin,
        toEntrance: target,
      });
    }
  }
  return best;
}

const RouteApiSchema = z.object({
  routes: z
    .object({
      features: z.array(
        z.object({
          attributes: z.object({ Name: z.string(), Total_Length: z.number() }),
          geometry: z
            .object({ paths: z.array(z.array(z.array(z.number()))) })
            .optional(),
        }),
      ),
    })
    .optional(),
});

export interface RouteRequest {
  id: string;
  from: Entrance;
  to: Entrance;
}

/** Path geometry for many entrance-to-entrance walks in one solve, keyed by request id. */
export async function solveRoutes(
  http: HttpClient,
  token: string,
  mode: TravelMode,
  requests: readonly RouteRequest[],
): Promise<Map<string, { feet: number; path: [number, number][] }>> {
  const stops = requests.flatMap((r) =>
    [r.from, r.to].map((e, i) => ({
      geometry: { x: e.lng, y: e.lat, spatialReference: { wkid: 4326 } },
      attributes: { Name: `${r.id}#${i}`, RouteName: r.id, Sequence: i + 1 },
    })),
  );
  const body = new URLSearchParams({
    f: "json",
    outSR: "4326",
    returnDirections: "false",
    returnRoutes: "true",
    returnStops: "false",
    returnBarriers: "false",
    returnPolygonBarriers: "false",
    returnPolylineBarriers: "false",
    outputLines: "esriNAOutputLineTrueShape",
    findBestSequence: "false",
    stops: JSON.stringify({
      type: "features",
      features: stops,
      doNotLocateOnRestrictedElements: true,
    }),
    polygonBarriers: barriersParam,
    token,
  });
  const json = await postArcGis(
    http,
    `${service(mode)}/NAServer/Route/solve`,
    body,
  );
  const error = arcGisError(json);
  if (error) throw new Error(`Route solve (${mode}): ${error}`);
  const out = new Map<string, { feet: number; path: [number, number][] }>();
  for (const route of RouteApiSchema.parse(json).routes?.features ?? []) {
    const path = (route.geometry?.paths ?? [])
      .flat()
      .map((p) => [p[0] ?? 0, p[1] ?? 0] as [number, number]);
    if (path.length >= 2)
      out.set(route.attributes.Name, {
        feet: route.attributes.Total_Length,
        path,
      });
  }
  return out;
}
