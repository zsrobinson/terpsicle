import type { SectionRef } from "~/core/catalog";
import { buildIcs, icsFileName } from "~/core/ics";
import type {
  AcademicCalendar,
  LocalId,
  Plan,
  SectionKey,
  TermId,
} from "~/core/schema";
import { copyText } from "~/features/share/clipboard";
import { track } from "~/lib/analytics";
import { nowIso } from "~/state/ids";
import { useWorkspace } from "~/state/workspace-store";
import { noteToast } from "~/ui/toast";

// Register (SPEC §3.10): what to register for, section codes to paste into
// Testudo, the Registered marks and the .ics file. Feedback is a toast;
// failures say what happened and what to do.

/** One "CMSC351 0101" per line, in plan order: how Testudo's registration takes them. */
export function sectionCodes(plan: Pick<Plan, "courses">): string[] {
  return plan.courses.flatMap((c) =>
    c.sectionCode === null ? [] : [`${c.courseCode} ${c.sectionCode}`],
  );
}

export async function copySectionCodes(plan: Pick<Plan, "courses">) {
  const codes = sectionCodes(plan);
  if (codes.length === 0) return;
  if (!(await copyText(codes.join("\n")))) return;
  noteToast(
    `Copied ${codes.length} section ${codes.length === 1 ? "code" : "codes"}`,
    {
      id: "register",
      description: "Paste them into Testudo when you register.",
    },
  );
  track("export_codes_copied", { count: codes.length });
}

/** One code from a checklist row ("CMSC351" or "0101"), for Testudo's fields. */
export async function copyCode(code: string) {
  if (!(await copyText(code))) return;
  noteToast(`Copied ${code}`, { id: "register" });
  track("registration_code_copied", {});
}

/**
 * Marks a placed section Registered, or not: part of the plan, so it syncs
 * and Problems stops calling it full. Undoable with ⌘Z, without a toast:
 * ticking down a checklist shouldn't raise one each time.
 */
export function setRegistered(
  planId: LocalId,
  sectionKey: SectionKey,
  registered: boolean,
): void {
  useWorkspace.getState().dispatch(
    {
      type: "section/registered",
      planId,
      sectionKey,
      registered,
      now: nowIso(),
    },
    `${registered ? "Marked" : "Unmarked"} ${sectionKey.replace("-", " ")} as registered`,
    { toast: false },
  );
  if (registered) track("registration_item_checked", {});
}

export type IcsOutcome =
  | { kind: "downloaded"; fileName: string; events: number }
  | { kind: "not-published" }
  | { kind: "nothing-to-add" };

/** Builds the term's .ics for the plan and hands it to the browser to save. */
export function downloadIcs({
  termId,
  termName,
  sections,
  calendar,
  now = new Date(),
}: {
  termId: TermId;
  termName: string;
  sections: readonly SectionRef[];
  calendar: AcademicCalendar | null;
  now?: Date;
}): IcsOutcome {
  const result = buildIcs({
    termId,
    termName,
    sections,
    calendar,
    now: now.toISOString(),
  });
  if (result.kind !== "ok") {
    noteToast(
      result.kind === "not-published"
        ? `${termName}'s dates aren't published yet, so there's nothing to add. Try again once the provost posts the academic calendar.`
        : "None of these sections meet at set times, so there's nothing to add.",
      { id: "register" },
    );
    return { kind: result.kind };
  }
  const fileName = icsFileName(termName);
  const url = URL.createObjectURL(
    new Blob([result.ics], { type: "text/calendar;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // After the click has handed the file off.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);

  const left = (reason: "no-set-times" | "no-meetings-in-term") =>
    result.skipped
      .filter((s) => s.reason === reason)
      .map((s) => s.sectionKey.replace("-", " "));
  const notes = [
    listNote(left("no-set-times"), "no set times"),
    listNote(left("no-meetings-in-term"), "no meetings in the term's dates"),
  ].filter(Boolean);
  noteToast(`Downloaded ${fileName}`, {
    id: "register",
    description: [
      ...notes,
      "Open it to add your classes to your calendar.",
    ].join(" "),
  });
  track("ics_downloaded", { events: result.eventCount });
  return { kind: "downloaded", fileName, events: result.eventCount };
}

/** "ENGL393 0312 isn't in it: no set times." */
function listNote(sections: readonly string[], why: string): string {
  if (sections.length === 0) return "";
  return `${sections.join(", ")} ${sections.length === 1 ? "isn't" : "aren't"} in it: ${why}.`;
}
