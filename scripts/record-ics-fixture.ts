// Records a real ELMS calendar feed as a golden fixture for parseIcs
// (docs/V3.md §3.6, owner action 2). The feed link is a secret, so it's read
// from stdin, never taken as an argument (that would put it in shell
// history), and nothing this script prints mentions it. The feed is redacted
// (scripts/lib/ics-fixture.ts) before it's written; read the file before
// committing it.
//
//   pnpm tsx scripts/record-ics-fixture.ts [--fake-titles]
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { isElmsUrl, parseFeedLink, parseIcs } from "../src/core/todo";
import { redactFeed } from "./lib/ics-fixture";
import { isMain, ROOT } from "./lib/source-files";

const OUT_DIR = path.join(ROOT, "src/core/todo/__fixtures__");
const MAX_REDIRECTS = 2;

/** Fetches the feed like the Worker will: ELMS hosts only, even across redirects. Errors never carry the URL. */
async function fetchFeed(url: string): Promise<string> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response;
    try {
      response = await fetch(current, { redirect: "manual" });
    } catch {
      throw new Error("ELMS didn't answer. Try again in a minute.");
    }
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      const next = new URL(location, current).href;
      if (!isElmsUrl(next))
        throw new Error("ELMS redirected somewhere that isn't ELMS.");
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`ELMS answered HTTP ${response.status}.`);
    return await response.text();
  }
  throw new Error("ELMS redirected too many times.");
}

async function main() {
  const fakeTitles = process.argv.includes("--fake-titles");
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const pasted = await rl.question(
    "Paste your ELMS calendar feed link (Calendar → Calendar Feed) and press Enter:\n",
  );
  rl.close();

  const url = parseFeedLink(pasted);
  if (!url) {
    console.error(
      "That isn't an ELMS calendar link. In ELMS, open Calendar, click Calendar Feed, and copy the link.",
    );
    process.exitCode = 1;
    return;
  }

  const text = await fetchFeed(url);
  if (!parseIcs(text).recognized) {
    console.error("ELMS didn't send back a calendar.");
    process.exitCode = 1;
    return;
  }
  // The script's own run date names the file; scripts may read the clock.
  const recordedOn = new Date().toISOString().slice(0, 10);
  const redacted = redactFeed(text, { fakeTitles, recordedOn });
  const parse = parseIcs(redacted);
  const file = path.join(OUT_DIR, `elms-${recordedOn}.ics`);
  writeFileSync(file, redacted);
  console.log(
    `Wrote ${path.relative(ROOT, file)}: ${parse.items.length} items, ${parse.skipped} skipped.`,
  );
  console.log(
    "Read it before committing, then add it to FEEDS in src/core/todo/__fixtures__/feeds.ts.",
  );
}

if (isMain(import.meta.url)) {
  main().catch((error: unknown) => {
    // Only our own messages: a fetch error can carry the URL.
    console.error(
      error instanceof Error && error.message.startsWith("ELMS")
        ? error.message
        : "Recording failed.",
    );
    process.exitCode = 1;
  });
}
