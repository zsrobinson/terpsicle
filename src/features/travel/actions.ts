import { switchSection } from "~/app/actions";
import { track } from "~/app/analytics";
import type { Connection, ExtraMinutes, Pace, SectionKey } from "~/core/schema";
import { parseSectionKey } from "~/core/schema";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";

// The Travel tab's changes and navigation (SPEC §3.7). Settings save without
// undo history: they're preferences, not plan edits, and every pill updates
// the moment they change.

export function setPace(pace: Pace): void {
  if (useWorkspace.getState().travel.pace === pace) return;
  useWorkspace.getState().setTravel({ pace });
  track("travel_settings_changed", { setting: "pace", value: pace });
}

export function setAccessible(accessible: boolean): void {
  if (useWorkspace.getState().travel.accessible === accessible) return;
  useWorkspace.getState().setTravel({ accessible });
  track("travel_settings_changed", {
    setting: "accessible",
    value: accessible,
  });
}

export function setExtraMinutes(extraMinutes: ExtraMinutes): void {
  if (useWorkspace.getState().travel.extraMinutes === extraMinutes) return;
  useWorkspace.getState().setTravel({ extraMinutes });
  track("travel_settings_changed", {
    setting: "extraMinutes",
    value: extraMinutes,
  });
}

/** Opens connection details over whatever tab is open. */
export function openConnection(connection: Connection): void {
  useUi.getState().drill({ kind: "connection", connectionId: connection.id });
}

/**
 * Previews a section on the calendar: its course's sections show as ghosts
 * (as when hovering a search result) with this one drawn solid.
 */
export function previewFix(key: SectionKey | null): void {
  const ui = useUi.getState();
  const courseCode = key ? (parseSectionKey(key)?.courseCode ?? null) : null;
  // The course first: the calendar drops a preview that isn't one of the
  // ghost course's sections.
  ui.setHoverCourse(courseCode);
  ui.setPreviewSection(key);
}

/** Switches to a fixing section, undoably, and leaves the details it made stale. */
export function applyConnectionFix(key: SectionKey): boolean {
  const parsed = parseSectionKey(key);
  if (!parsed) return false;
  previewFix(null);
  const switched = switchSection(parsed.courseCode, parsed.sectionCode, "list");
  // The connection's id names the old section, so these details no longer
  // describe anything in the plan; the Undo toast brings it back.
  if (switched) useUi.getState().back();
  return switched;
}
