import { describe, expect, it } from "vitest";
import {
  type ChangesFile,
  ChangesFileSchema,
  type Course,
  CourseSchema,
  type DeptChunk,
  DeptChunkSchema,
  type Manifest,
  ManifestSchema,
  MeetingSchema,
  type SeatsFile,
  SeatsFileSchema,
  seatCountsFromTuple,
  seatTupleFromCounts,
  type TermsFile,
  TermsFileSchema,
} from "./catalog";

const TERM = "202701";
const NOW = "2026-09-25T14:00:00.000Z";
const HASH = "0123456789abcdef";

const cmsc351: Course = {
  code: "CMSC351",
  title: "Algorithms",
  credits: { min: 3, max: 3 },
  genEds: [],
  gradingMethods: ["Reg", "P-F", "Aud"],
  permission: null,
  description:
    "A systematic study of the complexity of some elementary algorithms.",
  prerequisite: "Minimum grade of C- in CMSC250 and CMSC216.",
  corequisite: null,
  restriction: null,
  otherNotes: [
    { label: "Credit only granted for", text: "CMSC351 or CMSC651." },
  ],
  crossListings: [],
  sections: [
    {
      code: "0101",
      instructors: ["Clyde Kruskal"],
      delivery: "f2f",
      meetings: [
        {
          timed: true,
          days: ["Tu", "Th"],
          start: 570,
          end: 645,
          building: "IRB",
          room: "0318",
          kind: "lecture",
          online: false,
        },
        {
          timed: true,
          days: ["M"],
          start: 540,
          end: 590,
          building: "CSI",
          room: "2117",
          kind: "discussion",
          online: false,
        },
      ],
      notes: null,
      restriction: null,
    },
    {
      code: "0201",
      instructors: [],
      delivery: "blended",
      meetings: [
        {
          timed: true,
          days: ["Tu"],
          start: 660,
          end: 735,
          building: "IRB",
          room: "0318",
          kind: "lecture",
          online: false,
        },
        {
          timed: false,
          building: null,
          room: null,
          kind: "lecture",
          online: true,
        },
      ],
      notes: "Restricted to CMSC majors. Blended learning section.",
      restriction: "Restricted to CMSC majors.",
    },
  ],
};

const engl393: Course = {
  code: "ENGL393",
  title: "Technical Writing",
  credits: { min: 3, max: 3 },
  genEds: [["FSPW"]],
  gradingMethods: ["Reg"],
  permission: null,
  description: null,
  prerequisite: "ENGL101; junior standing.",
  corequisite: null,
  restriction: null,
  otherNotes: [],
  crossListings: [],
  sections: [
    {
      code: "0312",
      instructors: ["Jane Doe", "John Roe"],
      delivery: "online-async",
      meetings: [
        {
          timed: false,
          building: null,
          room: null,
          kind: "lecture",
          online: true,
        },
      ],
      notes: "Class time/details on ELMS.",
      restriction: null,
    },
    {
      code: "FC01",
      instructors: ["Jane Doe"],
      delivery: "online-sync",
      meetings: [
        {
          timed: true,
          days: ["Sa"],
          start: 600,
          end: 750,
          building: null,
          room: null,
          kind: "lecture",
          online: true,
        },
      ],
      notes: null,
      restriction: null,
      cancelled: true,
    },
  ],
};

describe("catalog wire schemas", () => {
  it("accepts a realistic department chunk", () => {
    const chunk: DeptChunk = {
      schemaVersion: 1,
      termId: TERM,
      dept: "CMSC",
      courses: [cmsc351],
    };
    expect(DeptChunkSchema.parse(chunk)).toEqual(chunk);
    expect(CourseSchema.parse(engl393)).toEqual(engl393);
  });

  it("models gen-ed alternatives as groups", () => {
    const course = {
      ...engl393,
      code: "PHIL140",
      genEds: [["DSHS", "DSSP"], ["DVUP"]],
    };
    expect(CourseSchema.safeParse(course).success).toBe(true);
    expect(CourseSchema.safeParse({ ...course, genEds: [[]] }).success).toBe(
      false,
    );
  });

  it("strips unknown keys so newer data doesn't break older clients", () => {
    const parsed = CourseSchema.parse({ ...cmsc351, syllabusCount: 4 });
    expect(parsed).not.toHaveProperty("syllabusCount");
  });

  it("rejects bad meetings", () => {
    const timed = {
      timed: true,
      days: ["M"],
      start: 600,
      end: 650,
      building: "IRB",
      room: "0318",
      kind: "lecture",
      online: false,
    };
    expect(MeetingSchema.safeParse(timed).success).toBe(true);
    expect(MeetingSchema.safeParse({ ...timed, end: 600 }).success).toBe(false);
    expect(MeetingSchema.safeParse({ ...timed, days: [] }).success).toBe(false);
    expect(MeetingSchema.safeParse({ ...timed, kind: "Lec" }).success).toBe(
      false,
    );
  });

  it("requires sections unique and in section-number order", () => {
    const [a, b] = cmsc351.sections;
    expect(
      CourseSchema.safeParse({ ...cmsc351, sections: [b, a] }).success,
    ).toBe(false);
    expect(
      CourseSchema.safeParse({ ...cmsc351, sections: [a, a] }).success,
    ).toBe(false);
  });

  it("rejects credits with max below min", () => {
    expect(
      CourseSchema.safeParse({ ...cmsc351, credits: { min: 3, max: 1 } })
        .success,
    ).toBe(false);
    expect(
      CourseSchema.safeParse({ ...cmsc351, credits: { min: 1, max: 3 } })
        .success,
    ).toBe(true);
  });

  it("accepts terms, manifest, seats and changes files", () => {
    const terms: TermsFile = {
      schemaVersion: 1,
      generatedAt: NOW,
      terms: [
        {
          id: TERM,
          name: "Spring 2027",
          season: "spring",
          year: 2027,
          status: "active",
          firstSeen: NOW,
          lastSeen: NOW,
        },
        {
          id: "202501",
          name: "Spring 2025",
          season: "spring",
          year: 2025,
          status: "archived",
          firstSeen: NOW,
          lastSeen: NOW,
        },
      ],
    };
    expect(TermsFileSchema.parse(terms)).toEqual(terms);

    const manifest: Manifest = {
      schemaVersion: 1,
      termId: TERM,
      generatedAt: NOW,
      catalogCrawledAt: NOW,
      departments: [
        {
          code: "CMSC",
          name: "Computer Science",
          hash: HASH,
          courseCount: 95,
          sectionCount: 410,
        },
      ],
      seats: { hash: HASH, asOf: "2026-09-25T02:30:00.000Z", fetchedAt: NOW },
      changes: { hash: HASH, count: 1, latestAt: NOW },
    };
    expect(ManifestSchema.parse(manifest)).toEqual(manifest);
    expect(
      ManifestSchema.safeParse({ ...manifest, seats: null, changes: null })
        .success,
    ).toBe(true);
    expect(
      ManifestSchema.safeParse({ ...manifest, schemaVersion: 2 }).success,
    ).toBe(false);

    const seats: SeatsFile = {
      schemaVersion: 1,
      termId: TERM,
      asOf: null,
      seats: { "CMSC351-0101": [0, 120, 14, 0], "ENGL393-FC01": [7, 19, 0, 2] },
    };
    expect(SeatsFileSchema.parse(seats)).toEqual(seats);
    expect(
      SeatsFileSchema.safeParse({
        ...seats,
        seats: { "CMSC351-0101": [1, 2, 3] },
      }).success,
    ).toBe(false);
    expect(
      SeatsFileSchema.safeParse({ ...seats, seats: { CMSC351: [1, 2, 3, 0] } })
        .success,
    ).toBe(false);

    const [before] = cmsc351.sections;
    if (!before) throw new Error("fixture has sections");
    const snapshot = {
      instructors: before.instructors,
      delivery: before.delivery,
      meetings: before.meetings,
    };
    const changes: ChangesFile = {
      schemaVersion: 1,
      termId: TERM,
      since: NOW,
      changes: [
        {
          kind: "changed",
          sectionKey: "CMSC351-0101",
          at: NOW,
          before: snapshot,
          after: { ...snapshot, instructors: [] },
        },
        {
          kind: "cancelled",
          sectionKey: "CMSC351-0201",
          at: NOW,
          before: snapshot,
        },
        { kind: "added", sectionKey: "CMSC351-0301", at: NOW, after: snapshot },
      ],
    };
    expect(ChangesFileSchema.parse(changes)).toEqual(changes);
    expect(
      ChangesFileSchema.safeParse({
        ...changes,
        changes: [
          {
            kind: "changed",
            sectionKey: "CMSC351-0101",
            at: NOW,
            after: snapshot,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("converts seat tuples both ways", () => {
    const counts = seatCountsFromTuple([3, 90, 0, 1]);
    expect(counts).toEqual({ open: 3, total: 90, waitlist: 0, holdfile: 1 });
    expect(seatTupleFromCounts(counts)).toEqual([3, 90, 0, 1]);
  });
});
