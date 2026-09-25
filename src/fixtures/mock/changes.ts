// Catalog changes for the demo: one section moved and one cancelled since
// plan B placed them, so the "changed" and "cancelled" problems can be shown.
import type { ChangesFile, SectionSnapshot } from "~/core/schema";
import { aTimedMeeting, fixtureTermId, snapshotOf } from "../builders";
import {
  CANCELLED_SECTION_KEY,
  MOVED_SECTION_KEY,
  mockSection,
  removedSections,
} from "./catalog";

/** AAAS100 0501 as it was: TuTh 9:30–10:45am. The catalog now has 11:00am–12:15pm. */
export const movedSectionBefore: SectionSnapshot = {
  ...snapshotOf(mockSection(MOVED_SECTION_KEY)),
  meetings: [
    aTimedMeeting({
      days: ["Tu", "Th"],
      start: 570,
      end: 645,
      building: "SQH",
      room: "2120",
    }),
  ],
};

function removedSection(key: string) {
  const section = removedSections[key];
  if (!section) throw new Error(`${key} wasn't removed from the mock catalog`);
  return section;
}

/** CMSC320 0301 as it was before Testudo stopped listing it (the real section). */
export const cancelledSectionBefore: SectionSnapshot = snapshotOf(
  removedSection(CANCELLED_SECTION_KEY),
);

export const mockChanges: ChangesFile = {
  schemaVersion: 1,
  termId: fixtureTermId,
  since: "2026-08-26T07:35:00.000Z",
  changes: [
    {
      kind: "cancelled",
      sectionKey: CANCELLED_SECTION_KEY,
      at: "2026-09-24T14:05:00.000Z",
      before: cancelledSectionBefore,
    },
    {
      kind: "changed",
      sectionKey: MOVED_SECTION_KEY,
      at: "2026-09-22T18:40:00.000Z",
      before: movedSectionBefore,
      after: snapshotOf(mockSection(MOVED_SECTION_KEY)),
    },
  ],
};
