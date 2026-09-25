import { toast } from "sonner";
import { track } from "~/app/analytics";
import type { SectionRef } from "~/core/catalog";
import { buildIcs, icsFileName } from "~/core/ics";
import type {
  AcademicCalendar,
  Block,
  CourseCode,
  CourseColor,
  Plan,
  TermId,
} from "~/core/schema";
import { sharePayloadFromPlan, shareUrl } from "~/core/share";

// Export (SPEC §3.10): section codes, the share link and the .ics file.
// Feedback is a toast; failures say what happened and what to do.

/** One "CMSC351 0101" per line, in plan order: how Testudo's registration takes them. */
export function sectionCodes(plan: Pick<Plan, "courses">): string[] {
  return plan.courses.flatMap((c) =>
    c.sectionCode === null ? [] : [`${c.courseCode} ${c.sectionCode}`],
  );
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    toast.error(
      "Couldn't copy: this browser blocked the clipboard. Allow it for this site and try again.",
      { id: "clipboard" },
    );
    return false;
  }
}

export async function copySectionCodes(plan: Pick<Plan, "courses">) {
  const codes = sectionCodes(plan);
  if (codes.length === 0) return;
  if (!(await writeClipboard(codes.join("\n")))) return;
  toast(
    `Copied ${codes.length} section ${codes.length === 1 ? "code" : "codes"}`,
    { id: "export", description: "Paste them into Testudo when you register." },
  );
  track("export_codes_copied", { count: codes.length });
}

export async function copyShareLink(
  plan: Plan,
  blocks: readonly Block[],
  colors: Readonly<Partial<Record<CourseCode, CourseColor>>>,
  origin: string = window.location.origin,
) {
  const planColors: Record<CourseCode, CourseColor> = {};
  for (const [code, color] of Object.entries(colors))
    if (color) planColors[code] = color;
  const url = shareUrl(origin, sharePayloadFromPlan(plan, blocks, planColors));
  if (!(await writeClipboard(url))) return;
  toast("Copied the share link", {
    id: "export",
    description: "Anyone with it sees this plan, read-only.",
  });
  track("share_link_copied", {});
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
    toast(
      result.kind === "not-published"
        ? `${termName}'s dates aren't published yet, so there's nothing to add. Try again once the provost posts the academic calendar.`
        : "None of these sections meet at set times, so there's nothing to add.",
      { id: "export" },
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
  toast(`Downloaded ${fileName}`, {
    id: "export",
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
