import {
  clampSidebarWidth,
  DEFAULT_UI_PREFS,
  SettingsRowSchema,
  type UiPrefs,
} from "~/core/schema";
import type { TerpsicleDb } from "./db";

// The sidebar's width is one preference for every workbench (CONTEXT.md):
// the scheduler keeps it in `UiPrefs` with the rest of its shell state
// (persist.ts). Plan's workbench reads and writes that one field here,
// without loading the scheduler's stores. A write changes only the width,
// in a transaction over the row as it is then, so it never undoes the
// scheduler's other prefs; a scheduler open in another tab may later save
// the width it had, which is the worst a race can do.

async function uiPrefs(db: TerpsicleDb): Promise<UiPrefs | null> {
  const row = SettingsRowSchema.safeParse(await db.settings.get("ui"));
  return row.success && row.data.key === "ui" ? row.data.value : null;
}

/** The saved width, or the default when nothing's saved. */
export async function readSidebarWidth(db: TerpsicleDb): Promise<number> {
  return (await uiPrefs(db))?.sidebarWidth ?? DEFAULT_UI_PREFS.sidebarWidth;
}

/** Saves a new width into the scheduler's prefs, leaving the rest as they are. */
export async function writeSidebarWidth(
  db: TerpsicleDb,
  px: number,
): Promise<void> {
  await db.transaction("rw", db.settings, async () => {
    const prefs = (await uiPrefs(db)) ?? DEFAULT_UI_PREFS;
    await db.settings.put({
      key: "ui",
      value: { ...prefs, sidebarWidth: clampSidebarWidth(px) },
    });
  });
}
