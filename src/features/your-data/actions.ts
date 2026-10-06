import { termLabel } from "~/core/catalog";
import {
  buildDataExport,
  DATA_FILE_WORDS,
  dataFileName,
  type ImportPlan,
  importSummary,
  planImport,
  readDataFile,
  undoImport,
} from "~/core/data-export";
import {
  DATA_EXPORT_MAX_BYTES,
  type DataExport,
} from "~/core/schema/data-export";
import type { DocKey, SyncedTables } from "~/core/sync";
import { newYorkDateOf } from "~/core/todo";
import { prefsDb } from "~/features/prefs/save";
import { openChannel, type SyncMessage } from "~/features/sync/options";
import { runningEngine } from "~/features/sync/running";
import { dexieSyncStorage, markEdited } from "~/features/sync/storage";
import { dataExportApi } from "~/server/fns/data-export";
import { todoApi } from "~/server/fns/todo";
import { newLocalId, nowIso } from "~/state/ids";

// Your data on Settings (docs/DATA.md §5.6): downloading the data file, and
// adding one back. Loaded on the first click, so Settings' first load
// carries none of it. What's in the file and how adding it merges is
// ~/core/data-export; this reads and writes IndexedDB the way plan sync
// does (one transaction, docs marked for sync in it) and calls the account.

/** Who's adding or downloading: signed in (and whether Todo is on), or not. */
export interface DataWho {
  signedIn: boolean;
  todo: boolean;
}

function storage() {
  return dexieSyncStorage(prefsDb());
}

/** Hands the file to the browser as a download. */
function save(file: DataExport, name: string): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // After the click has handed the file off.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * Downloads the data file. Signed in, sync runs first, so the file has
 * everything on the account and anything this browser hadn't saved yet.
 * Returns the file's name.
 */
export async function downloadData(who: DataWho): Promise<string> {
  if (who.signedIn) await runningEngine()?.sync();
  const [{ tables }, account] = await Promise.all([
    storage().read(),
    who.signedIn ? dataExportApi.account() : null,
  ]);
  const file = buildDataExport({
    from: who.signedIn ? "account" : "browser",
    tables,
    account,
    now: nowIso(),
  });
  const name = dataFileName(newYorkDateOf(Date.now()));
  save(file, name);
  return name;
}

/** A file read and checked, and what adding it would do now; or why it can't be added. */
export type PreparedImport =
  | { status: "error"; message: string }
  | {
      status: "ok";
      file: DataExport;
      plan: ImportPlan;
      /** `importSummary`'s sentence. */
      summary: string;
      /** What it adds, one line each: "Plan C · Spring 2027". */
      names: string[];
    };

/** The own tasks the account has, by uid, or null when none can be added. */
async function taskUids(who: DataWho): Promise<Set<string> | null> {
  if (!who.signedIn || !who.todo) return null;
  const account = await dataExportApi.account();
  return account.todo ? new Set(account.todo.tasks.map((t) => t.uid)) : null;
}

/** Reads the file and works out what adding it would do, changing nothing. */
export async function prepareImport(
  file: File,
  who: DataWho,
): Promise<PreparedImport> {
  // The size first, so a huge file is never read.
  const read = readDataFile(
    file.size > DATA_EXPORT_MAX_BYTES ? "" : await file.text(),
    file.size,
  );
  if (read.status !== "ok")
    return { status: "error", message: DATA_FILE_WORDS[read.status] };
  const [{ tables }, uids] = await Promise.all([
    storage().read(),
    taskUids(who),
  ]);
  const plan = planImport({
    current: tables,
    file: read.file,
    taskUids: uids,
    newId: newLocalId,
    now: nowIso(),
  });
  return {
    status: "ok",
    file: read.file,
    plan,
    summary: importSummary(plan),
    names: [
      ...plan.added.plans.map((p) => `${p.name} · ${termLabel(p.termId)}`),
      ...plan.added.fourYear.map((d) => `${d.name} · four-year plan`),
      ...plan.tasks.map((t) => `${t.title} · task`),
    ],
  };
}

/** Writes new tables in one step with plan sync's flags, and tells sync and the other tabs. */
async function writeTables(
  change: (tables: SyncedTables) => { tables: SyncedTables; keys: DocKey[] },
): Promise<DocKey[]> {
  let keys: DocKey[] = [];
  await storage().update((s) => {
    const next = change(s.tables);
    keys = next.keys;
    if (keys.length === 0) return s;
    const written = { ...s, tables: next.tables };
    return s.userId === null ? written : markEdited(written, keys);
  });
  if (keys.length > 0) {
    // Pushed a second from now, if plan sync is running on this page.
    runningEngine()?.noteEditedDocs(keys);
    const channel = openChannel();
    channel?.postMessage({
      type: "changed",
      keys: [...keys],
    } satisfies SyncMessage);
    channel?.close();
  }
  return keys;
}

/** What adding a file did, for Undo. */
export interface AppliedImport {
  plan: ImportPlan;
  /** Own tasks it added (and so Undo deletes). */
  taskUids: string[];
  /** Tasks it couldn't add: the account's limit, a date Todo doesn't keep, or a lost connection. */
  tasksLeftOut: number;
  /** Adding tasks stopped partway (no connection, or the hour's limit). */
  tasksStopped: boolean;
}

/**
 * Adds the file, worked out again against what's here now (a tab may have
 * changed something since the preview). Plans, four-year plans and
 * settings land in IndexedDB at once; own tasks go to the account one by
 * one.
 */
export async function applyImport(
  file: DataExport,
  who: DataWho,
): Promise<AppliedImport> {
  const uids = await taskUids(who);
  let plan: ImportPlan | null = null;
  await writeTables((tables) => {
    plan = planImport({
      current: tables,
      file,
      taskUids: uids,
      newId: newLocalId,
      now: nowIso(),
    });
    return { tables: plan.tables, keys: plan.keys };
  });
  // The update's step always runs, so the plan is set.
  const applied = plan as ImportPlan | null;
  if (!applied) throw new Error("adding the file didn't run");
  const added: string[] = [];
  let stopped = false;
  for (const task of applied.tasks) {
    try {
      const result = await todoApi.saveTask({
        uid: task.uid,
        title: task.title,
        courseCode: task.courseCode,
        dueDate: task.dueDate,
        dueTime: task.dueTime,
      });
      if (result.status !== "saved") continue;
      added.push(task.uid);
      if (task.done) await todoApi.done({ uid: task.uid, done: true });
    } catch {
      // Offline or over the hour's limit: the plans are in already, so
      // stop here and still offer Undo for what was added. Adding the file
      // again skips what's here and brings the rest.
      stopped = true;
      break;
    }
  }
  return {
    plan: applied,
    taskUids: added,
    tasksLeftOut: applied.tasks.length - added.length,
    tasksStopped: stopped,
  };
}

/** Undo: takes out what the file added, and your settings come back. */
export async function undoApplied(applied: AppliedImport): Promise<void> {
  await writeTables((tables) => undoImport(tables, applied.plan));
  for (const uid of applied.taskUids) await todoApi.deleteTask({ uid });
}
