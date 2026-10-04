import { describe, expect, it } from "vitest";
import { findImportProblems } from "./check-imports";
import { findTermIds, isExempt } from "./check-term-ids";
import { findTrackedFileProblems, MAX_BYTES } from "./check-tracked-files";

describe("findTermIds", () => {
  it.each(["202701", "202605", "202608", "202612"])("flags %s", (id) => {
    expect(findTermIds("src/lib/x.ts", `const t = "${id}";`)).toEqual([
      `src/lib/x.ts:1:12  "${id}"`,
    ]);
  });

  it("ignores numbers that aren't term ids", () => {
    expect(
      findTermIds("src/lib/x.ts", "const a = 202602; const b = 2026;"),
    ).toEqual([]);
  });

  it("exempts fixtures, parser goldens and tests", () => {
    expect(isExempt("src/fixtures/terms.ts")).toBe(true);
    expect(isExempt("src/ingest/__fixtures__/soc.html")).toBe(true);
    expect(isExempt("src/core/time.test.ts")).toBe(true);
    expect(isExempt("src/core/time.ts")).toBe(false);
  });
});

describe("findImportProblems", () => {
  it("allows relative imports inside a folder and alias imports across", () => {
    const text =
      'import { a } from "./a";\nimport { b } from "../catalog/b";\nimport { c } from "~/ingest/c";';
    expect(findImportProblems("src/core/time/x.ts", text)).toEqual([]);
  });

  it("flags relative imports that cross folders", () => {
    const text = 'import { a } from "../../ingest/a";';
    expect(findImportProblems("src/core/time/x.ts", text)).toEqual([
      'src/core/time/x.ts:1:14  "../../ingest/a": crosses from src/core into src/ingest; import it as "~/ingest/…"',
    ]);
  });

  it("allows asset imports from the src root (styles)", () => {
    expect(
      findImportProblems(
        "src/routes/__root.tsx",
        'import css from "../styles.css?url";',
      ),
    ).toEqual([]);
  });

  it("flags our modules imported only for their effect, outside tests", () => {
    const text = [
      'import "~/lib/register-things";',
      'import "./boot";',
      'import "../styles.css";',
      'import "maplibre-gl/dist/maplibre-gl.css";',
      'import "fake-indexeddb/auto";',
      'import { used } from "./used";',
      'import type { T } from "~/core/t";',
    ].join("\n");
    expect(
      findImportProblems("src/features/x/y.tsx", text).map(
        (p) => p.split(": ")[0],
      ),
    ).toEqual([
      'src/features/x/y.tsx:1:1  "~/lib/register-things"',
      'src/features/x/y.tsx:2:1  "./boot"',
    ]);
    expect(findImportProblems("src/features/x/y.test.tsx", text)).toEqual([]);
  });

  it("flags imports from reference/", () => {
    const text = 'import { x } from "../../reference/prototype/src/core";';
    expect(findImportProblems("src/lib/x.ts", text)[0]).toContain(
      "never import from reference/",
    );
  });

  it("flags clock reads in core but not in its tests", () => {
    const text =
      "const t = Date.now();\nconst d = new Date();\nconst ok = new Date(0);";
    expect(findImportProblems("src/core/x.ts", text)).toHaveLength(2);
    expect(findImportProblems("src/core/x.test.ts", text)).toEqual([]);
    expect(findImportProblems("src/server/x.ts", text)).toEqual([]);
  });
});

describe("the haptic rule", () => {
  it("flags the haptic trick imported outside the kit, by alias or path", () => {
    expect(
      findImportProblems(
        "src/features/todo/x.tsx",
        'import { HapticTap } from "~/ui/haptic";',
      ),
    ).toEqual([
      'src/features/todo/x.tsx:1:22  "~/ui/haptic": only src/components/ui may import the haptic trick; use a kit control\'s `haptic` prop (docs/decisions.md, "Haptics live in the kit")',
    ]);
    expect(
      findImportProblems(
        "src/routes/x.tsx",
        'import { HapticTap } from "../components/ui/haptic.tsx";',
      ),
    ).toHaveLength(1);
    expect(
      findImportProblems(
        "src/components/ui/deeper/x.tsx",
        'import { HapticTap } from "../haptic";',
      ),
    ).toHaveLength(1);
  });

  it("allows it inside the kit, and other kit modules anywhere", () => {
    expect(
      findImportProblems(
        "src/components/ui/button.tsx",
        'import { HapticTap } from "./haptic";',
      ),
    ).toEqual([]);
    expect(
      findImportProblems(
        "src/components/ui/toast.tsx",
        'import { HapticTap } from "~/ui/haptic";',
      ),
    ).toEqual([]);
    expect(
      findImportProblems(
        "src/features/todo/x.tsx",
        'import { Button } from "~/ui/button";\nimport { h } from "./haptic";',
      ),
    ).toEqual([]);
  });
});

describe("the sealed feed link rule", () => {
  const text =
    'db.prepare("SELECT url_enc FROM todo_feeds");\nawait openFeedLink(keys, owner, sealed);';

  it("flags url_enc and openFeedLink outside crypto.ts and fetch.ts", () => {
    expect(findImportProblems("src/server/todo/store.ts", text)).toEqual([
      'src/server/todo/store.ts:1:20  "url_enc": only src/server/todo/crypto.ts and src/server/todo/fetch.ts may touch the sealed feed link (docs/V3.md §5.1)',
      'src/server/todo/store.ts:2:7  "openFeedLink": only src/server/todo/crypto.ts and src/server/todo/fetch.ts may touch the sealed feed link (docs/V3.md §5.1)',
    ]);
    expect(findImportProblems("src/jobs/todo-feeds.ts", text)).toHaveLength(2);
  });

  it("allows them in crypto.ts, fetch.ts, tests and comments", () => {
    expect(findImportProblems("src/server/todo/crypto.ts", text)).toEqual([]);
    expect(findImportProblems("src/server/todo/fetch.ts", text)).toEqual([]);
    expect(findImportProblems("src/server/todo/todo.test.ts", text)).toEqual(
      [],
    );
    expect(
      findImportProblems("src/server/todo/store.ts", "// never url_enc"),
    ).toEqual([]);
  });
});

describe("the sealed tables rule", () => {
  const text =
    'db.prepare("SELECT body FROM sync_docs");\ndb.prepare("SELECT wrapped_key FROM user_keys");\ndb.prepare("SELECT title FROM todo_tasks");';

  it("flags the sealed tables outside their files", () => {
    const problems = findImportProblems("src/server/chat/store.ts", text);
    expect(problems.map((p) => p.split("  ")[1]?.split(":")[0])).toEqual([
      '"sync_docs"',
      '"wrapped_key"',
      '"user_keys"',
      '"todo_tasks"',
    ]);
    expect(problems[0]).toContain(
      "read synced docs through src/server/sync/store.ts",
    );
  });

  it("allows each in its own files, tests and comments", () => {
    const only = (rel: string) =>
      findImportProblems(rel, text).map((p) => p.split("  ")[1]);
    expect(only("src/server/sync/store.ts")).toHaveLength(3);
    expect(only("src/server/security/user-keys.ts")).toHaveLength(2);
    expect(only("src/server/todo/store.ts")).toHaveLength(3);
    expect(findImportProblems("src/server/auth/purge.ts", text)).toEqual([]);
    expect(findImportProblems("src/server/sync/sync.test.ts", text)).toEqual(
      [],
    );
    expect(
      findImportProblems(
        "src/server/chat/store.ts",
        "/** A `sync_docs` row */\n// todo_tasks",
      ),
    ).toEqual([]);
  });
});

describe("findTrackedFileProblems", () => {
  it("allows ordinary files, fixtures and screenshots under the limit", () => {
    expect(
      findTrackedFileProblems([
        { rel: "src/core/time.ts", bytes: 4_000 },
        { rel: "src/ingest/__fixtures__/soc/CMSC.html", bytes: 900_000 },
        { rel: "docs/screenshots/brand/after.jpg", bytes: 480_000 },
      ]),
    ).toEqual([]);
  });

  it("flags test output, recordings and files over the limit", () => {
    expect(
      findTrackedFileProblems([
        { rel: "runs/2026-09-30T0812-ios-1/README.md", bytes: 2_000 },
        { rel: "mobile-lab-results/x/summary.json", bytes: 2_000 },
        { rel: "docs/demo.mp4", bytes: 1_000 },
        { rel: "public/big.png", bytes: MAX_BYTES + 1 },
      ]),
    ).toEqual([
      "runs/2026-09-30T0812-ios-1/README.md  (a test run's output)",
      "mobile-lab-results/x/summary.json  (a test run's output)",
      "docs/demo.mp4  (a recording)",
      "public/big.png  (2.0 MiB)",
    ]);
  });
});
