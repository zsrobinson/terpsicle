import {
  type IsoDate,
  type IsoDateTime,
  SYNC_MAX_BODY_BYTES,
  syncBodyBytes,
} from "../schema";
import {
  type AccountData,
  DATA_EXPORT_FORMAT,
  DATA_EXPORT_MAX_BYTES,
  DATA_EXPORT_VERSION,
  type DataExport,
  DataExportSchema,
} from "../schema/data-export";
import { type SyncedTables, settingsDocOf } from "../sync";

// The data file (docs/DATA.md §5.6): made from what the device syncs and,
// signed in, what only the account holds; read back before it's added.

/** `terpsicle-data-2026-10-05.json`. */
export function dataFileName(today: IsoDate): string {
  return `terpsicle-data-${today}.json`;
}

export function buildDataExport(input: {
  from: DataExport["from"];
  tables: SyncedTables;
  account: AccountData | null;
  now: IsoDateTime;
}): DataExport {
  return {
    format: DATA_EXPORT_FORMAT,
    version: DATA_EXPORT_VERSION,
    exportedAt: input.now,
    from: input.from,
    plans: [...input.tables.plans],
    settings: settingsDocOf(input.tables),
    fourYear: [...input.tables.fourYear],
    account: input.account,
  };
}

export type ReadDataFile =
  | { status: "ok"; file: DataExport }
  /** Not JSON, or JSON that isn't a Terpsicle data file. */
  | { status: "not-terpsicle" }
  /** From a newer build: this one doesn't know its version. */
  | { status: "newer" }
  /** A Terpsicle data file, but something in it doesn't read. */
  | { status: "invalid" }
  | { status: "too-big" };

/** The file's text, checked against the format. `size` in bytes, so a huge file is never parsed. */
export function readDataFile(text: string, size: number): ReadDataFile {
  if (size > DATA_EXPORT_MAX_BYTES) return { status: "too-big" };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: "not-terpsicle" };
  }
  if (
    typeof json !== "object" ||
    json === null ||
    !("format" in json) ||
    json.format !== DATA_EXPORT_FORMAT
  )
    return { status: "not-terpsicle" };
  if (
    "version" in json &&
    typeof json.version === "number" &&
    json.version > DATA_EXPORT_VERSION
  )
    return { status: "newer" };
  const parsed = DataExportSchema.safeParse(json);
  if (!parsed.success) return { status: "invalid" };
  // A doc the account can't hold would never sync, and a settings doc that
  // big would stop every later settings change from syncing too (the
  // prefs carry any key, so a file can make them as big as it likes).
  const docs = [
    ...parsed.data.plans,
    ...parsed.data.fourYear,
    parsed.data.settings,
  ];
  if (docs.some((body) => syncBodyBytes(body) > SYNC_MAX_BODY_BYTES))
    return { status: "invalid" };
  return { status: "ok", file: parsed.data };
}

/** What a reader's message says for each way a file can't be added. */
export const DATA_FILE_WORDS: Record<
  Exclude<ReadDataFile["status"], "ok">,
  string
> = {
  "not-terpsicle":
    "That isn't a Terpsicle data file. Choose the .json file you downloaded from Settings.",
  newer:
    "That file is from a newer version of Terpsicle. Reload the page and try again.",
  invalid:
    "Part of that file doesn't read, so nothing was added. Download it again and try that one.",
  "too-big": "That file is over 10 MB, so it can't be a Terpsicle data file.",
};
