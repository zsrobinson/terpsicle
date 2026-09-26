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
// shows on the calendar, and the next visit starts from the IndexedDB cache
// without refetching departments. Logs what the first visit downloaded, and
// holds it to the budgets below (BUILD §5: regressions fail CI).

/**
 * BUILD §5's "first load < 1.5 MB compressed": everything over the wire until
 * the plan is on the calendar (app, fonts, terms, manifest, seats, the
 * departments it needs).
 */
const FIRST_LOAD_BUDGET = 1.5 * 1024 * 1024;
/**
 * After that the rest of the term's departments stream into the cache in the
 * background (search needs them all). Their total is held to its own budget:
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
  // Every department is in once the manifest is committed to the cache.
  await expect
    .poll(() => page.evaluate(savedKeys), { timeout: 60_000 })
    .toContain(manifestKey(term.id));
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
  expect(firstLoad, "first load over budget").toBeLessThan(FIRST_LOAD_BUDGET);
  expect(firstVisit.data, "catalog data over budget").toBeLessThan(
    CATALOG_DATA_BUDGET,
  );
});

/** Pointer keys in the app's IndexedDB cache (runs in the page; closes its connection). */
function savedKeys(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("terpsicle");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("manifests")) {
        db.close();
        resolve([]);
        return;
      }
      const request = db
        .transaction("manifests")
        .objectStore("manifests")
        .getAllKeys();
      request.onsuccess = () => {
        db.close();
        resolve(request.result.map(String));
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
  await expect(
    page.getByRole("link", { name: "Open Terpsicle" }),
  ).toBeVisible();
  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { name: "Privacy", level: 1 }),
  ).toBeVisible();
});
