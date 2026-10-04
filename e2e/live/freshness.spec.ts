import { expect, test } from "@playwright/test";
import {
  ManifestSchema,
  manifestKey,
  TERMS_KEY,
  TermsFileSchema,
} from "../../src/core/schema";

// Runs in monitoring only: an upstream outage shouldn't block a code fix.
test("active terms have recent catalog and seats crawls", async ({
  request,
}) => {
  const response = await request.get(`/data/${TERMS_KEY}`);
  expect(response.ok()).toBe(true);
  const { terms } = TermsFileSchema.parse(await response.json());
  const active = terms.filter((term) => term.status === "active");
  expect(active.length).toBeGreaterThan(0);
  const now = Date.now();
  for (const term of active) {
    await test.step(term.name, async () => {
      const response = await request.get(`/data/${manifestKey(term.id)}`);
      expect(response.ok()).toBe(true);
      const manifest = ManifestSchema.parse(await response.json());
      expect(
        now - Date.parse(manifest.catalogCrawledAt),
        "catalog crawl age",
      ).toBeLessThan(36 * 60 * 60 * 1000);
      expect(manifest.seats, "seats have been fetched").not.toBeNull();
      const seatsAge = now - Date.parse(manifest.seats?.fetchedAt ?? "");
      expect(seatsAge, "seats fetch age").toBeLessThan(60 * 60 * 1000);
      expect(seatsAge, "fetch time is not in the future").toBeGreaterThan(
        -5 * 60 * 1000,
      );
    });
  }
});
