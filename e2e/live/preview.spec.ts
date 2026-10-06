import { expect, type Page, test } from "@playwright/test";
import {
  type DeptChunk,
  deptChunkKey,
  type Manifest,
  manifestKey,
  TERMS_KEY,
  type TermsFile,
} from "../../src/core/schema";
import { encodeShare } from "../../src/core/share/share";

// Real data on a deployment (playwright.live.config.ts): the default term's
// catalog loads from /data (production R2 on a PR preview), a real section
// shows on the calendar, and the next visit starts from the query cache in
// IndexedDB (DATA.md §5.5) without refetching departments. Logs what the
// first visit downloaded against guide sizes (BUILD §5); correctness,
// rather than upstream catalog size, is the deployment gate.

/**
 * BUILD §5's "first load < 1.5 MB compressed": everything over the wire until
 * the plan is on the calendar (app, fonts, terms, manifest, seats, the
 * departments it needs).
 */
const FIRST_LOAD_BUDGET = 1.5 * 1024 * 1024;
/**
 * After that the rest of the term's departments stream into the cache in the
 * background (search needs them all). Report their total against a guide:
 * 1.11 MB for Spring 2027's 199 departments at the time of writing, plus
 * headroom for a bigger term.
 */
const CATALOG_DATA_BUDGET = 1.4 * 1024 * 1024;

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** Bytes over the wire (compressed) per request, from Chrome's network log. */
async function measure(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const urls = new Map<string, string>();
  const totals = { data: 0, app: 0, deptRequests: 0 };
  cdp.on("Network.requestWillBeSent", (e) => {
    urls.set(e.requestId, e.request.url);
    if (/\/data\/catalog\/[^/]+\/dept\//.test(e.request.url))
      totals.deptRequests++;
  });
  cdp.on("Network.loadingFinished", (e) => {
    const url = urls.get(e.requestId) ?? "";
    if (url.includes("/data/")) totals.data += e.encodedDataLength;
    else totals.app += e.encodedDataLength;
  });
  return totals;
}

test("the default term's real courses load, then come from the cache", async ({
  page,
  request,
}) => {
  const json = async <T>(key: string): Promise<T> => {
    const response = await request.get(`/data/${key}`);
    expect(response.status(), key).toBe(200);
    return (await response.json()) as T;
  };
  // The term people are registering for (SPEC §3.0), and a real section in it.
  const { terms } = await json<TermsFile>(TERMS_KEY);
  const term = [...terms]
    .sort((a, b) => b.id.localeCompare(a.id))
    .find(
      (t) =>
        t.status === "active" && (t.season === "fall" || t.season === "spring"),
    );
  if (!term) throw new Error("terms.json has no active fall or spring term");
  const manifest = await json<Manifest>(manifestKey(term.id));
  const cmsc = manifest.departments.find((d) => d.code === "CMSC");
  if (!cmsc) throw new Error(`${term.name} has no CMSC department`);
  const chunk = await json<DeptChunk>(deptChunkKey(term.id, "CMSC", cmsc.hash));
  const found = chunk.courses
    .flatMap((c) => c.sections.map((s) => ({ course: c, section: s })))
    .find(({ section }) => section.meetings.some((m) => m.timed));
  if (!found) throw new Error("No timed CMSC section");
  const key = `${found.course.code}-${found.section.code}`;
  const param = encodeShare({ v: 1, termId: term.id, sections: [key] });

  const first = await measure(page);
  const started = Date.now();
  await page.goto(`/schedule?plan=${param}`);
  await expect(page.getByText(term.name).first()).toBeVisible();
  const calendar = page.getByRole("region", { name: "Week calendar" });
  await expect(
    calendar
      .getByRole("button", {
        name: new RegExp(`^${found.course.code} ${found.section.code}`),
      })
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  const sectionMs = Date.now() - started;
  const firstLoad = first.app + first.data;
  await expect(page.getByRole("alert")).toHaveCount(0);
  // The whole term is saved: the manifest (saved first, DATA.md §5.5) and
  // every department it lists.
  const termFiles = [
    manifestKey(term.id),
    ...manifest.departments.map((d) => deptChunkKey(term.id, d.code, d.hash)),
  ];
  await expect
    .poll(
      async () => {
        const saved = new Set(await page.evaluate(savedKeys));
        return termFiles.filter((k) => !saved.has(k));
      },
      { timeout: 60_000 },
    )
    .toEqual([]);
  const catalogMs = Date.now() - started;
  const firstVisit = { ...first };

  const second = await measure(page);
  const reloaded = Date.now();
  await page.reload();
  await expect(
    calendar
      .getByRole("button", {
        name: new RegExp(`^${found.course.code} ${found.section.code}`),
      })
      .first(),
  ).toBeVisible();
  const repeatMs = Date.now() - reloaded;
  // Let background revalidation run; it must not refetch departments.
  await page.waitForTimeout(3_000);
  expect(second.deptRequests, "repeat visit refetched departments").toBe(0);

  const kb = (n: number) => `${Math.round(n / 1024)} KB`;
  const report = [
    `${term.name}: ${manifest.departments.length} departments, ${key} on the calendar`,
    `First visit: ${sectionMs} ms to the section, ${catalogMs} ms to the whole catalog`,
    `First load (until the plan shows): ${kb(firstLoad)} of ${kb(FIRST_LOAD_BUDGET)}`,
    `First visit transfer: app ${kb(firstVisit.app)}, data ${kb(firstVisit.data)} of ${kb(CATALOG_DATA_BUDGET)} (${firstVisit.deptRequests} department files)`,
    `Repeat visit: ${repeatMs} ms to the section, ${second.deptRequests} department files, data ${kb(second.data)}`,
  ].join("\n");
  console.log(report);
  test.info().annotations.push({ type: "load", description: report });
});

/**
 * The R2 keys of the live files saved in the query cache (runs in the page;
 * closes its connection so it never blocks the app's).
 */
function savedKeys(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("terpsicle-query");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("rows")) {
        db.close();
        resolve([]);
        return;
      }
      const request = db.transaction("rows").objectStore("rows").getAllKeys();
      request.onsuccess = () => {
        db.close();
        // `published:<family>-["published","live","<R2 key>"]`
        resolve(
          request.result.flatMap((key) => {
            const text = String(key);
            try {
              const parsed: unknown = JSON.parse(
                text.slice(text.indexOf("-") + 1),
              );
              return Array.isArray(parsed) && parsed[1] === "live"
                ? [String(parsed[2])]
                : [];
            } catch {
              return [];
            }
          }),
        );
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    };
  });
}

test("/ shows the marketing page to a first visit, and /privacy loads", async ({
  page,
}) => {
  // Google's OAuth consent screen links to /privacy and checks that it loads.
  await page.goto("/");
  // The hero's button; the closing section repeats it.
  await expect(
    page.getByRole("link", { name: "View schedule" }).first(),
  ).toBeVisible();
  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { name: "Privacy", level: 1 }),
  ).toBeVisible();
});

test("our Reviews pages go to PlanetTerp while they're off", async ({
  page,
}) => {
  // REVIEWS_PAGES_ENABLED is unset on previews (wrangler.jsonc), and on
  // production once it switches to version A; until then production serves
  // the pages, so read the flag the app is told rather than assume it.
  const me = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/me" && r.ok(),
  );
  await page.goto("/schedule");
  const { flags } = (await (await me).json()) as {
    flags: { reviewsPages: boolean };
  };
  test.skip(flags.reviewsPages, "This deployment has our Reviews pages on.");
  // Each address answers a 302 to its PlanetTerp twin, not followed here.
  for (const [path, to] of [
    ["/reviews", "https://planetterp.com"],
    ["/reviews/cmsc351", "https://planetterp.com/course/CMSC351"],
  ] as const) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(302);
    expect(response.headers().location, path).toBe(to);
  }
});

test("the public product pages render and hydrate", async ({ page }) => {
  for (const path of ["/chat", "/plan", "/todo"]) {
    await test.step(path, async () => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("main")).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 1 }).first(),
      ).toBeVisible();
      await expect(page.locator("[data-slot=page-skeleton]")).toHaveCount(0);
    });
  }
});
