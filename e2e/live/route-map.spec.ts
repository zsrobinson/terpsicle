import { expect, test } from "@playwright/test";
import {
  type DeptChunk,
  deptChunkKey,
  type Manifest,
  manifestKey,
  routeGeometryKey,
  TERMS_KEY,
  type TermsFile,
} from "../../src/core/schema";
import { encodeShare } from "../../src/core/share/share";

// The route map on real tiles (SPEC §3.7): two real back-to-back classes in
// different buildings, whose route UMD's network has a path for, open in
// connection details as a MapLibre map reading geo/tiles.pmtiles with range
// requests. Needs WebGL (SwiftShader in headless Chromium: see
// playwright.live.config.ts).

const DEPTS = ["CMSC", "ENEE", "MATH", "STAT", "ECON", "BMGT", "ENGL", "PHYS"];

type Stop = {
  key: string;
  course: string;
  days: string;
  start: number;
  end: number;
  building: string;
};

test("connection details draw the route on campus tiles", async ({
  page,
  request,
}) => {
  const json = async <T>(key: string): Promise<T> => {
    const response = await request.get(`/data/${key}`);
    expect(response.status(), key).toBe(200);
    return (await response.json()) as T;
  };
  const { terms } = await json<TermsFile>(TERMS_KEY);
  const term = [...terms]
    .sort((a, b) => b.id.localeCompare(a.id))
    .find(
      (t) =>
        t.status === "active" && (t.season === "fall" || t.season === "spring"),
    );
  if (!term) throw new Error("terms.json has no active fall or spring term");
  const manifest = await json<Manifest>(manifestKey(term.id));

  // Every timed, in-person meeting in a few big departments.
  const stops: Stop[] = [];
  for (const dept of manifest.departments.filter((d) =>
    DEPTS.includes(d.code),
  )) {
    const chunk = await json<DeptChunk>(
      deptChunkKey(term.id, dept.code, dept.hash),
    );
    for (const course of chunk.courses)
      for (const section of course.sections) {
        if (section.meetings.length !== 1) continue;
        const [m] = section.meetings;
        if (!m?.timed || m.online || !m.building) continue;
        stops.push({
          key: `${course.code}-${section.code}`,
          course: course.code,
          days: m.days.join(""),
          start: m.start,
          end: m.end,
          building: m.building,
        });
      }
  }

  // Two sections, 10–15 minutes apart on the same days, in buildings UMD's
  // network has a standard route between.
  let pair: [Stop, Stop] | null = null;
  let tries = 0;
  outer: for (const a of stops)
    for (const b of stops) {
      const gap = b.start - a.end;
      if (
        a.course === b.course ||
        a.building === b.building ||
        a.days !== b.days ||
        gap < 10 ||
        gap > 15
      )
        continue;
      if (++tries > 25) break outer;
      const route = await request.get(
        `/data/${routeGeometryKey(a.building, b.building, "standard")}`,
      );
      if (route.status() === 200) {
        pair = [a, b];
        break outer;
      }
    }
  if (!pair) throw new Error("No back-to-back pair with a route to draw");
  const [a, b] = pair;

  const tiles: number[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/data/geo/tiles.pmtiles")) tiles.push(r.status());
  });
  const param = encodeShare({
    v: 1,
    termId: term.id,
    sections: [a.key, b.key],
  });
  await page.goto(`/?plan=${param}`);
  await page.getByRole("button", { name: "Travel", exact: true }).click();
  await page
    .getByRole("button", { name: new RegExp(`^${a.course} to ${b.course}`) })
    .first()
    .click({ timeout: 60_000 });

  const map = page.getByTestId("route-map");
  await expect(map).toBeVisible();
  await expect(map.locator("canvas")).toBeVisible();
  await expect(
    map.getByRole("img", {
      name: `Map of the walking route from ${a.building} to ${b.building}`,
    }),
  ).toBeVisible();
  await expect(page.getByText("Map unavailable for this route")).toHaveCount(0);
  await expect(map.getByText("OpenStreetMap")).toBeVisible();
  // Tiles come in as byte ranges.
  await expect.poll(() => tiles.includes(206), { timeout: 20_000 }).toBe(true);
  // Let the tiles draw, then keep a picture for the report.
  await page.waitForTimeout(2_000);
  await test.info().attach("route-map", {
    body: await page
      .getByRole("complementary", { name: "Sidebar" })
      .screenshot(),
    contentType: "image/png",
  });
});
