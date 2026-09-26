import type { FeedSource } from "../../schema";
import elms from "./synthetic-elms-2026-09.ics?raw";
import file from "./synthetic-file-gradescope.ics?raw";

/**
 * Every saved feed, by file name, with the source it's read as. Both are
 * synthetic, shaped like a Canvas feed and a dropped export; a real feed
 * recorded with `scripts/record-ics-fixture.ts` is added here too (README.md)
 * and every test runs over it.
 */
export const FEEDS: Readonly<
  Record<string, { text: string; source: FeedSource }>
> = {
  "synthetic-elms-2026-09": { text: elms, source: "elms" },
  "synthetic-file-gradescope": { text: file, source: "file" },
};
