import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SectionSchema } from "~/core/schema";
import { normalizeSections } from "./soc/normalize";
import { createSectionsParser } from "./soc/parse-sections";

// BUILD.md §5: each cron stays within its CPU limit on a full term. The seats
// job runs every 5 minutes with 30 s of CPU; nearly all of it is parsing
// sections pages. A full Spring 2027 crawl was 37.4 MB of sections HTML
// (RESEARCH.md §5.1.2); this replays the saved pages up to that size through
// the same streaming parse + normalize + validate path the job uses.

const FULL_TERM_BYTES = 37_400_000;
/** Generous for slow CI machines; locally this takes about 1.5 s. */
const BUDGET_MS = 10_000;

const dir = new URL("./__fixtures__/soc/202701/sections/", import.meta.url);
const pages = readdirSync(dir).map((f) =>
  readFileSync(new URL(f, dir), "utf8"),
);

describe("seats job CPU", () => {
  it(`parses a full term's sections in under ${BUDGET_MS / 1000} s`, () => {
    const cpu = process.cpuUsage();
    let bytes = 0;
    let sections = 0;
    const sectionsSchema = z.array(SectionSchema);
    while (bytes < FULL_TERM_BYTES) {
      for (const html of pages) {
        const parser = createSectionsParser((raw) => {
          const normalized = normalizeSections(raw);
          sections += sectionsSchema.parse(normalized.sections).length;
        });
        // 64 KB chunks, like a network stream.
        for (let i = 0; i < html.length; i += 65_536)
          parser.write(html.slice(i, i + 65_536));
        parser.end();
        bytes += html.length;
      }
    }
    const used = process.cpuUsage(cpu);
    const ms = (used.user + used.system) / 1000;
    console.info(
      `seats parse: ${(bytes / 1e6).toFixed(1)} MB, ${sections} sections, ${Math.round(ms)} ms CPU`,
    );
    expect(sections).toBeGreaterThan(7000);
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});
