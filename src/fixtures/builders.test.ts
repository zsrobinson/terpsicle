import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  AcademicCalendarSchema,
  BlockSchema,
  BuildingSchema,
  BuildingsFileSchema,
  ChangesFileSchema,
  ChatAuthorSchema,
  ChatMessageSchema,
  ConnectionSchema,
  CourseIndexDeptSchema,
  CourseIndexEntrySchema,
  CourseIndexManifestSchema,
  CourseSchema,
  CourseSearchFileSchema,
  DAYS,
  DeptChunkSchema,
  FeedItemSchema,
  GenerateRequestSchema,
  GradeCountsSchema,
  GradeRecordSchema,
  InstructorSchema,
  ManifestSchema,
  MeetingSchema,
  PlanCourseSchema,
  PlanetTerpDeptSchema,
  PlanSchema,
  ProblemSchema,
  ReviewSummarySchema,
  RouteGeometrySchema,
  SeatsFileSchema,
  SeatTupleSchema,
  SectionSchema,
  SectionSnapshotSchema,
  SettingsDocSchema,
  SharePayloadSchema,
  SyncDocSchema,
  TermSchema,
  TermsFileSchema,
  TranscriptLineSchema,
} from "~/core/schema";
import {
  aBlock,
  aBuilding,
  aBuildingsFile,
  aChangesFile,
  aChatAuthor,
  aChatMessage,
  aConnection,
  aCourse,
  aCourseIndexDept,
  aCourseIndexEntry,
  aCourseIndexManifest,
  aCourseSearchFile,
  aDeptChunk,
  aFeedItem,
  aGenerateRequest,
  aGradeRecord,
  aManifest,
  anInstructor,
  anUnpublishedCalendar,
  anUntimedMeeting,
  aPlan,
  aPlanCourse,
  aPlanetTerpDept,
  aPlanSyncDoc,
  aProblem,
  aPublishedCalendar,
  aReviewSummary,
  aRouteGeometry,
  aSavedCourse,
  aSeatsFile,
  aSeatTuple,
  aSection,
  aSectionSnapshot,
  aSettingsDoc,
  aSettingsSyncDoc,
  aSharePayload,
  aTbaMeeting,
  aTerm,
  aTermsFile,
  aTimedMeeting,
  aTranscriptLine,
  seededRandom,
  someGrades,
} from "~/fixtures";

describe("builders return schema-valid objects by default", () => {
  const cases: [
    string,
    { safeParse: (v: unknown) => { success: boolean } },
    unknown,
  ][] = [
    ["aTerm", TermSchema, aTerm()],
    ["aTermsFile", TermsFileSchema, aTermsFile()],
    ["aTimedMeeting", MeetingSchema, aTimedMeeting()],
    ["anUntimedMeeting", MeetingSchema, anUntimedMeeting()],
    ["aTbaMeeting", MeetingSchema, aTbaMeeting()],
    ["aSection", SectionSchema, aSection()],
    ["aCourse", CourseSchema, aCourse()],
    ["aDeptChunk", DeptChunkSchema, aDeptChunk()],
    ["aSeatTuple", SeatTupleSchema, aSeatTuple()],
    ["aSeatsFile", SeatsFileSchema, aSeatsFile()],
    ["aSectionSnapshot", SectionSnapshotSchema, aSectionSnapshot()],
    ["aChangesFile", ChangesFileSchema, aChangesFile()],
    ["aManifest", ManifestSchema, aManifest()],
    ["aCourseIndexEntry", CourseIndexEntrySchema, aCourseIndexEntry()],
    ["aCourseIndexDept", CourseIndexDeptSchema, aCourseIndexDept()],
    ["aCourseSearchFile", CourseSearchFileSchema, aCourseSearchFile()],
    ["aCourseIndexManifest", CourseIndexManifestSchema, aCourseIndexManifest()],
    ["aPlanCourse", PlanCourseSchema, aPlanCourse()],
    ["aSavedCourse", PlanCourseSchema, aSavedCourse()],
    ["aPlan", PlanSchema, aPlan()],
    ["aBlock", BlockSchema, aBlock()],
    ["aSettingsDoc", SettingsDocSchema, aSettingsDoc()],
    ["aPlanSyncDoc", SyncDocSchema, aPlanSyncDoc()],
    [
      "aPlanSyncDoc (tombstone)",
      SyncDocSchema,
      aPlanSyncDoc({ id: "plan_gone_1", body: null }),
    ],
    ["aSettingsSyncDoc", SyncDocSchema, aSettingsSyncDoc()],
    ["aSharePayload", SharePayloadSchema, aSharePayload()],
    ["anInstructor", InstructorSchema, anInstructor()],
    ["someGrades", GradeCountsSchema, someGrades()],
    ["aGradeRecord", GradeRecordSchema, aGradeRecord()],
    ["aPlanetTerpDept", PlanetTerpDeptSchema, aPlanetTerpDept()],
    ["aReviewSummary", ReviewSummarySchema, aReviewSummary()],
    ["aBuilding", BuildingSchema, aBuilding()],
    ["aBuildingsFile", BuildingsFileSchema, aBuildingsFile()],
    ["aRouteGeometry", RouteGeometrySchema, aRouteGeometry()],
    ["aConnection", ConnectionSchema, aConnection()],
    ["aPublishedCalendar", AcademicCalendarSchema, aPublishedCalendar()],
    ["anUnpublishedCalendar", AcademicCalendarSchema, anUnpublishedCalendar()],
    ["aFeedItem", FeedItemSchema, aFeedItem()],
    ["aGenerateRequest", GenerateRequestSchema, aGenerateRequest()],
    ["aProblem", ProblemSchema, aProblem()],
    ["aChatAuthor", ChatAuthorSchema, aChatAuthor()],
    ["aChatMessage", ChatMessageSchema, aChatMessage()],
    ["aTranscriptLine", TranscriptLineSchema, aTranscriptLine()],
  ];
  it.each(cases)("%s", (_, schema, value) => {
    expect(schema.safeParse(value).success).toBe(true);
  });

  it("returns fresh, equal objects on every call (deterministic defaults)", () => {
    expect(aCourse()).toEqual(aCourse());
    expect(aCourse()).not.toBe(aCourse());
    expect(aPlan()).toEqual(aPlan());
  });

  it("keeps a problem's severity in step with its kind", () => {
    expect(ProblemSchema.safeParse(aProblem({ kind: "overlap" })).success).toBe(
      true,
    );
    expect(
      ProblemSchema.safeParse(aProblem({ kind: "no-set-times", fix: null }))
        .success,
    ).toBe(true);
  });

  it("makes a saved course when the section is null", () => {
    expect(aPlanCourse({ sectionCode: null })).toEqual({
      courseCode: "CMSC351",
      sectionCode: null,
      snapshot: null,
    });
  });
});

// Arbitraries for values the schemas accept.
const sectionCode = fc.stringMatching(/^[0-9A-Z]{4}$/);
const days = fc
  .subarray([...DAYS], { minLength: 1 })
  .map((picked) => DAYS.filter((d) => picked.includes(d)));
const timeRange = fc
  .tuple(fc.integer({ min: 0, max: 1439 }), fc.integer({ min: 1, max: 600 }))
  .map(([start, length]) => ({ start, end: Math.min(1440, start + length) }));
const name = fc.constantFrom(
  "Ada Brandt",
  "Kofi Varga",
  "Mira Delacroix",
  "Sam Ibarra",
);

describe("builders stay valid under random overrides", () => {
  it("aTimedMeeting", () => {
    fc.assert(
      fc.property(days, timeRange, (d, t) => {
        expect(
          MeetingSchema.safeParse(aTimedMeeting({ days: d, ...t })).success,
        ).toBe(true);
      }),
    );
  });

  it("aSection", () => {
    fc.assert(
      fc.property(
        sectionCode,
        fc.array(name, { maxLength: 3 }),
        fc.constantFrom(
          "f2f",
          "blended",
          "online-sync",
          "online-async" as const,
        ),
        days,
        timeRange,
        (code, instructors, delivery, d, t) => {
          const section = aSection({
            code,
            instructors,
            delivery,
            meetings: [aTimedMeeting({ days: d, ...t }), anUntimedMeeting()],
          });
          expect(SectionSchema.safeParse(section).success).toBe(true);
        },
      ),
    );
  });

  it("aCourse", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }),
        fc.integer({ min: 0, max: 6 }),
        fc.uniqueArray(sectionCode, { maxLength: 6 }),
        (min, extra, codes) => {
          const course = aCourse({
            credits: { min, max: min + extra },
            sections: [...codes].sort().map((code) => aSection({ code })),
          });
          expect(CourseSchema.safeParse(course).success).toBe(true);
        },
      ),
    );
  });

  it("aBlock and aPlan", () => {
    fc.assert(
      fc.property(
        days,
        timeRange,
        fc.string({ minLength: 1, maxLength: 40 }),
        (d, t, label) => {
          const trimmed = label.trim() || "Work";
          expect(
            BlockSchema.safeParse(aBlock({ days: d, ...t, label: trimmed }))
              .success,
          ).toBe(true);
          expect(
            PlanSchema.safeParse(aPlan({ name: trimmed.slice(0, 60) })).success,
          ).toBe(true);
        },
      ),
    );
  });

  it("aSeatTuple and someGrades", () => {
    const count = fc.integer({ min: 0, max: 500 });
    fc.assert(
      fc.property(
        count,
        count,
        fc.option(count),
        fc.option(count),
        (open, total, w, h) => {
          const tuple = aSeatTuple({ open, total, waitlist: w, holdfile: h });
          expect(SeatTupleSchema.safeParse(tuple).success).toBe(true);
          expect(
            GradeCountsSchema.safeParse(someGrades({ W: open, Other: total }))
              .success,
          ).toBe(true);
        },
      ),
    );
  });
});

describe("seededRandom", () => {
  it("repeats for the same seed and differs across seeds", () => {
    const a = seededRandom("CMSC351-0101");
    const b = seededRandom("CMSC351-0101");
    const c = seededRandom("CMSC351-0201");
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    for (const x of first) expect(x >= 0 && x < 1).toBe(true);
  });
});
