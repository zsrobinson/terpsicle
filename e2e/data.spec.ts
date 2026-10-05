import { expect, type Page, test } from "@playwright/test";

// Terms and the catalog cache on `pnpm dev:mock` (SPEC §3.0, DATA.md §5.1):
// the switcher with past terms, the remembered term, and the IndexedDB copy
// that makes the next visit instant.

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function open(page: Page) {
  await page.goto("/schedule");
  await expect(page.locator('[data-slot="app-bar"]')).toBeVisible();
}

/**
 * The term's control: the term switcher on a desktop ("Spring 2027"), the
 * term and plan's one control on a phone ("Spring 2027, Plan A").
 */
const switcher = (page: Page, term: string) =>
  page
    .getByRole("banner")
    .getByRole("button", { name: new RegExp(`^${term}(,|$)`) });

test("switch to a past term and back; the last one is remembered", async ({
  page,
}) => {
  await open(page);
  await switcher(page, "Spring 2027").click();
  const menu = page.getByRole("menu");
  await expect(menu.getByText("Past terms")).toBeVisible();
  await menu.getByRole("menuitemradio", { name: /Summer 2026/ }).click();

  await expect(switcher(page, "Summer 2026")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Week calendar" }),
  ).toBeVisible();

  await page.reload();
  await expect(switcher(page, "Summer 2026")).toBeVisible();

  await switcher(page, "Summer 2026").click();
  await page
    .getByRole("menu")
    .getByRole("menuitemradio", { name: /Spring 2027/ })
    .click();
  await expect(switcher(page, "Spring 2027")).toBeVisible();
});

/** The mock data over HTTP, so there are real requests to cut. */
async function overHttp(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("terpsicle:mock-data", "http"),
  );
}

const planOnScreen = (page: Page) =>
  expect(
    page
      .getByRole("region", { name: "Week calendar" })
      .getByRole("button", { name: /^CMSC351 0301/ })
      .first(),
  ).toBeVisible();

test("the catalog is saved on this device, in the query cache", async ({
  page,
}) => {
  await overHttp(page);
  await page.goto("/schedule?demo=1");
  await planOnScreen(page);

  // The term list, the manifest, the plan's departments and the seats are
  // saved (DATA.md §5.5).
  await expect
    .poll(() => page.evaluate(readQueryCache), { timeout: 15_000 })
    .toEqual(
      expect.arrayContaining([
        expect.stringContaining('"mock","catalog/terms.json"'),
        expect.stringContaining('"mock","catalog/202701/manifest.json"'),
        expect.stringMatching(
          /"mock","catalog\/202701\/dept\/CMSC\.[0-9a-f]+\.json"/,
        ),
        expect.stringMatching(
          /"mock","catalog\/202701\/seats\.[0-9a-f]+\.json"/,
        ),
      ]),
    );
  // The old data cache's tables went with LOCAL_DB_VERSION 7.
  expect(await page.evaluate(readOldCacheTables)).toEqual([]);
});

test("a reload with /data out of reach starts from what's saved", {
  tag: "@critical",
}, async ({ page, isMobile }) => {
  // This one searches with the "/" shortcut and the sidebar's search box,
  // which the phone layout doesn't have (search opens in the drawer there,
  // and search.spec.ts covers that). What it reads is saved the same way
  // on both layouts, which the test above checks on each.
  test.skip(isMobile, "searches from the desktop sidebar");
  await overHttp(page);
  await page.goto("/schedule?demo=1");
  // "/" needs the scheduler with the demo in, which its plan's rows show,
  // waited for as an action would (on a cold page that can take most of
  // 5 s). The search below waits for the term's catalog.
  await page.getByTestId("course-row-CMSC351").waitFor();
  const searchFor = async (text: string) => {
    await page.keyboard.press("/");
    await page.getByRole("combobox", { name: "Search courses" }).fill(text);
  };
  await searchFor("cmsc 351");
  // Search waits for the whole term, so the whole term has loaded.
  const result = page.locator('[data-course-result="CMSC351"]');
  await expect(result).toContainText("4 sections", { timeout: 15_000 });
  await expect
    .poll(() => page.evaluate(readQueryCache), { timeout: 15_000 })
    .toEqual(
      expect.arrayContaining([
        expect.stringContaining('"mock","catalog/202701/manifest.json"'),
      ]),
    );

  // /data out of reach: the catalog comes from this device, search finds
  // the course with its sections, and the bar says so quietly.
  let cut = 0;
  await page.route("**/data/**", (route) => {
    cut++;
    return route.abort("internetdisconnected");
  });
  await page.reload();
  await planOnScreen(page);
  await searchFor("cmsc 351");
  await expect(result).toContainText("4 sections", { timeout: 15_000 });
  await expect(page.getByText("Offline · showing saved data")).toBeVisible();
  // The page did ask (the manifest's check), and was cut off.
  await expect.poll(() => cut).toBeGreaterThan(0);
});

test("Terpsicle's review numbers come through the query cache and are saved", async ({
  page,
}) => {
  await page.goto("/schedule/course/CMSC351");
  // 88 on PlanetTerp at 4.6, and the mock's 9 on Terpsicle at 3.33.
  await expect(
    page.getByRole("button", {
      name: /^Jada Abernathy ?rated 4\.5 of 5, 97 reviews/,
    }),
  ).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => page.evaluate(readQueryCache), { timeout: 15_000 })
    .toEqual(
      expect.arrayContaining([
        expect.stringContaining('"mock","reviews/manifest.json"'),
        expect.stringMatching(/"mock","reviews\/dept\/CMSC\.[0-9a-f]+\.json"/),
      ]),
    );

  // Next visit, the numbers are there with the rest of the page.
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: /^Jada Abernathy ?rated 4\.5 of 5, 97 reviews/,
    }),
  ).toBeVisible();
});

/** The query cache's row keys (DATA.md §5.5), without holding its database open. */
function readQueryCache(): Promise<string[]> {
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
      const tx = db.transaction("rows");
      const keys = tx.objectStore("rows").getAllKeys();
      tx.oncomplete = () => {
        db.close();
        resolve(keys.result.map(String));
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

/** The data cache tables left in the plans' database (none since version 7). */
function readOldCacheTables(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("terpsicle");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const names = [...db.objectStoreNames].filter(
        (n) => n === "manifests" || n === "files",
      );
      db.close();
      resolve(names);
    };
  });
}
