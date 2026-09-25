import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ROUTES_HEADER_BYTES,
  ROUTES_NO_ROUTE,
  ROUTES_UNKNOWN,
  RoutesIndexSchema,
} from "~/core/schema";
import { createHttpClient } from "../http";
import { encodeRoutes, pathFeet, simplifyPath } from "./encode";
import {
  type Entrance,
  fetchEntrances,
  parseTokenScript,
  solveClosest,
  solveRoutes,
} from "./gis";

// Against saved gis.umd.edu responses (src/ingest/__fixtures__/gis).

const raw = (path: string) =>
  readFileSync(new URL(`../__fixtures__/gis/${path}`, import.meta.url), "utf8");

/** An HttpClient whose every request answers with `body`. */
const answering = (body: string) => {
  const seen: RequestInit[] = [];
  const http = createHttpClient({
    fetch: async (_input, init) => {
      if (init) seen.push(init);
      return new Response(body);
    },
  });
  return { http, seen };
};

function entrancesOf(path: string): Entrance[] {
  return JSON.parse(raw(path)).features.map(
    (f: {
      attributes: { LOCATIONID: string };
      geometry: { x: number; y: number };
    }) => ({
      building: f.attributes.LOCATIONID,
      lng: f.geometry.x,
      lat: f.geometry.y,
    }),
  );
}

describe("UMD GIS", () => {
  it("parses the token script", () => {
    expect(parseTokenScript(raw("tokens.redacted.js"))).toEqual({
      token: "REDACTED",
      expires: 1791086407208,
    });
    expect(() => parseTokenScript("var x = 1;")).toThrow(
      /UMD changed its format/,
    );
  });

  it("filters entrances the way UMD's map does", async () => {
    const { http, seen } = answering(raw("entrances-085.json"));
    const standard = await fetchEntrances(http, "t", "standard", ["085"]);
    // IPT has a card-only and an open entrance: standard routes use the open one.
    expect(standard.get("085")).toHaveLength(1);
    const body = new URLSearchParams(String(seen[0]?.body));
    expect(body.get("where")).toContain("LOCATIONID IN ('085')");
    expect(body.get("outSR")).toBe("4326");
  });

  it("takes the shortest entrance-to-entrance walk per destination", async () => {
    const { http, seen } = answering(raw("cf-432-406-standard.json"));
    const best = await solveClosest(
      http,
      "t",
      "standard",
      entrancesOf("entrances-432.json"),
      entrancesOf("entrances-406.json"),
    );
    expect(Math.round(best.get("406")?.feet ?? 0)).toBe(197);
    const body = new URLSearchParams(String(seen[0]?.body));
    // UMD's barrier polygon goes with every solve.
    expect(body.get("polygonBarriers")).toContain("-8566006.92203236");
    expect(body.get("defaultTargetFacilityCount")).toBe("3");
  });

  it("treats 'No solution found' as no route, not a failure", async () => {
    const { http } = answering(raw("cf-085-084-accessible.json"));
    const best = await solveClosest(
      http,
      "t",
      "accessible",
      entrancesOf("entrances-085.json"),
      [],
    );
    expect(best.size).toBe(0);
  });

  it("reads route geometry keyed by request id", async () => {
    const { http } = answering(raw("route-multi-039-to-20-standard.json"));
    const paths = await solveRoutes(http, "t", "standard", []);
    expect(paths.size).toBe(20);
    const toMartin = paths.get("039-088");
    expect(Math.round(toMartin?.feet ?? 0)).toBe(3689);
    // The simplified path keeps its ends and stays within a few percent of the length.
    const simple = simplifyPath(toMartin?.path ?? []);
    expect(simple.length).toBeLessThan((toMartin?.path.length ?? 0) / 2);
    expect(simple[0]).toEqual(
      (toMartin?.path[0] ?? []).map((v) => Math.round(v * 1e6) / 1e6),
    );
    expect(pathFeet(simple)).toBeGreaterThan(
      0.97 * pathFeet(toMartin?.path ?? []),
    );
  });
});

describe("routes binary", () => {
  it("lays out the header, index and matrices as DATA.md §4.2 says", () => {
    const index = {
      buildings: ["CSI", "IRB", "VMH"],
      modes: ["standard", "accessible"] as ["standard", "accessible"],
    };
    const standard = [0, 197, 4262, 197, 0, undefined, 4262, undefined, 0];
    const accessible = [0, 197, null, 197, 0, null, null, null, 0];
    const bytes = encodeRoutes(index, [standard, accessible]);
    const view = new DataView(bytes.buffer);

    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("TRPR");
    expect(view.getUint16(4, true)).toBe(1);
    expect(view.getUint16(6, true)).toBe(3);
    expect(view.getUint8(8)).toBe(2);
    const length = view.getUint32(12, true);
    const decoded = RoutesIndexSchema.parse(
      JSON.parse(
        new TextDecoder().decode(
          bytes.slice(ROUTES_HEADER_BYTES, ROUTES_HEADER_BYTES + length),
        ),
      ),
    );
    expect(decoded).toEqual(index);
    const data =
      ROUTES_HEADER_BYTES +
      length +
      ((4 - ((ROUTES_HEADER_BYTES + length) % 4)) % 4);
    expect(data % 4).toBe(0);
    expect(bytes.length).toBe(data + 2 * 2 * 3 * 3);
    const cell = (m: number, i: number, j: number) =>
      view.getUint16(data + 2 * (m * 9 + i * 3 + j), true);
    expect(cell(0, 0, 1)).toBe(197);
    expect(cell(0, 2, 0)).toBe(4262);
    expect(cell(0, 1, 2)).toBe(ROUTES_UNKNOWN);
    expect(cell(1, 0, 2)).toBe(ROUTES_NO_ROUTE);
    expect(cell(1, 1, 1)).toBe(0);
  });

  it("rejects unsorted buildings and wrong-sized matrices", () => {
    const modes = ["standard", "accessible"] as ["standard", "accessible"];
    expect(() =>
      encodeRoutes({ buildings: ["IRB", "CSI"], modes }, [
        [0, 1, 1, 0],
        [0, 1, 1, 0],
      ]),
    ).toThrow(/sorted/);
    expect(() =>
      encodeRoutes({ buildings: ["CSI", "IRB"], modes }, [[0, 1, 1], [0]]),
    ).toThrow(/2×2/);
  });
});
