// The mock term list and academic calendars.
import type { AcademicCalendar, TermsFile } from "~/core/schema";
import {
  anUnpublishedCalendar,
  aPublishedCalendar,
  archivedFixtureTermId,
  aTerm,
  FIXTURE_NOW,
} from "../builders";

/**
 * Spring 2027 is active and the default (the newest fall or spring term).
 * Summer 2026 is archived: in the mock it has dropped off Testudo, so plans
 * for it still open but its seats are frozen.
 */
export const mockTermsFile: TermsFile = {
  schemaVersion: 1,
  generatedAt: FIXTURE_NOW,
  terms: [
    aTerm({ firstSeen: "2026-09-18T12:00:00.000Z" }),
    aTerm({
      id: archivedFixtureTermId,
      name: "Summer 2026",
      season: "summer",
      year: 2026,
      status: "archived",
      firstSeen: "2026-02-10T12:00:00.000Z",
      lastSeen: "2026-09-20T06:00:00.000Z",
    }),
  ],
};

/**
 * Spring 2027 dates from provost.umd.edu/calendar.md (captured 2026-09-25):
 * classes start on a Wednesday, which .ics must respect.
 */
export const mockCalendars: readonly AcademicCalendar[] = [
  aPublishedCalendar(),
  // Summer 2026 is only on the provost's archived HTML page, so it's "not published" for us.
  anUnpublishedCalendar(),
];
