import { expect, test } from "@playwright/test";

// Plan's course index from the query cache (docs/DATA.md §5.2, §5.5): once
// the course list and a department have loaded, a reload with /data out of
// reach, then the browser offline, still shows the course's title and
// finds courses. The mock data comes over HTTP here (`MOCK_DATA_OVER_HTTP_KEY`
// in src/state/data-source.ts), so there are real requests to cut.

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-09-26T16:00:00Z"));
  await page.addInitScript(() =>
    localStorage.setItem("terpsicle:mock-data", "http"),
  );
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** The query cache's row keys, without holding its database open. */
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

test("the course index works offline from what was saved", {
  tag: "@critical",
}, async ({ page, context, isMobile }) => {
  // One layout is enough: this is about the data, not the drawer.
  test.skip(isMobile, "desktop only");
  await page.goto("/plan");
  await page.getByLabel("I started at UMD in").click();
  await page.getByRole("option", { name: "Fall 2025" }).click();
  await page.getByRole("button", { name: "or add courses yourself" }).click();
  const spring = page.getByRole("region", { name: "Spring 2027", exact: true });
  await spring
    .getByRole("button", { name: "Add a course to Spring 2027" })
    .click();
  const search = page.getByRole("searchbox", { name: "Search courses" });
  await search.fill("CMSC351");
  await page
    .getByRole("button", { name: "Add CMSC351 to Spring 2027", exact: true })
    .click();
  await expect(spring.getByText("Algorithms")).toBeVisible();

  // The manifest, the course list and CMSC's file are saved.
  await expect
    .poll(() => page.evaluate(readQueryCache), { timeout: 15_000 })
    .toEqual(
      expect.arrayContaining([
        expect.stringContaining('"mock","courses/manifest.json"'),
        expect.stringMatching(/"mock","courses\/search\.[0-9a-f]+\.json"/),
        expect.stringMatching(/"mock","courses\/dept\/CMSC\.[0-9a-f]+\.json"/),
      ]),
    );

  // /data out of reach: the page still loads (the plan is on this device),
  // and the course's title comes from the query cache.
  let cut = 0;
  await page.route("**/data/**", (route) => {
    cut++;
    return route.abort("internetdisconnected");
  });
  await page.reload();
  await expect(spring.getByText("CMSC351")).toBeVisible();
  await expect(spring.getByText("Algorithms")).toBeVisible();
  // The page did ask (the manifest's check), and was cut off.
  await expect.poll(() => cut).toBeGreaterThan(0);

  // Then the browser offline: Search still finds courses from the saved list.
  await context.setOffline(true);
  await spring
    .getByRole("button", { name: "Add a course to Spring 2027" })
    .click();
  await search.fill("intro psych");
  await expect(
    page.getByRole("button", {
      name: "Add PSYC100 to Spring 2027",
      exact: true,
    }),
  ).toBeVisible();
  await context.setOffline(false);
});
