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

const switcher = (page: Page, term: string) =>
  page.getByRole("button", { name: term, exact: true });

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

test("the catalog is saved in IndexedDB for the next visit", async ({
  page,
}) => {
  await open(page);
  // The app has opened its database once the terms are on screen.
  await expect(switcher(page, "Spring 2027")).toBeVisible();
  // The manifest is committed only once every file it lists is saved.
  await expect
    .poll(() => page.evaluate(readCache), { timeout: 15_000 })
    .toMatchObject({
      pointers: expect.arrayContaining(["mock:catalog/202701/manifest.json"]),
    });
  const { files } = await page.evaluate(readCache);
  expect(files).toBeGreaterThan(0);
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

/**
 * The app's IndexedDB cache: pointer keys and the number of files (runs in
 * the page). Closes its connection, so it never blocks the app's own.
 */
function readCache(): Promise<{ pointers: string[]; files: number }> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("terpsicle");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("manifests")) {
        db.close();
        resolve({ pointers: [], files: 0 });
        return;
      }
      const tx = db.transaction(["manifests", "files"]);
      const keys = tx.objectStore("manifests").getAllKeys();
      const count = tx.objectStore("files").count();
      tx.oncomplete = () => {
        db.close();
        resolve({ pointers: keys.result.map(String), files: count.result });
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}
