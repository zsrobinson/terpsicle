import { describe, expect, it } from "vitest";
import { aConnection } from "~/fixtures";
import { blockLabel, classLabel, ghostLabel, pillLabel } from "./labels";
import type { BlockEntry, ClassEntry, GhostEntry } from "./layout";

const lecture: ClassEntry = {
  kind: "class",
  key: "CMSC351-0301:0:M",
  day: "M",
  start: 660,
  end: 710,
  sectionKey: "CMSC351-0301",
  courseCode: "CMSC351",
  sectionCode: "0301",
  meetingKind: "lecture",
  building: "CSI",
  room: "1115",
  online: false,
  color: "violet",
  dates: null,
};

const ghost: GhostEntry = {
  kind: "ghost",
  key: "g",
  day: "W",
  start: 840,
  end: 890,
  sectionKey: "CMSC351-0201",
  sectionCodes: ["0201"],
  label: "0201",
  sameTimes: true,
  instructors: "Jada Abernathy",
  meetingKind: "lecture",
  full: false,
  overlaps: true,
  previewed: false,
  color: "violet",
};

describe("calendar labels", () => {
  it("names a class with its day, time in words and room", () => {
    expect(classLabel(lecture)).toBe(
      "CMSC351 0301, Monday 11am to 11:50am, CSI 1115",
    );
    expect(
      classLabel({ ...lecture, meetingKind: "discussion", online: true }),
    ).toBe("CMSC351 0301 discussion, Monday 11am to 11:50am, online");
    // Summer sessions say which part of the term they meet in.
    expect(
      classLabel({
        ...lecture,
        dates: { start: "2026-06-01", end: "2026-07-10" },
      }),
    ).toBe(
      "CMSC351 0301, Monday 11am to 11:50am, CSI 1115, meets Jun 1 to Jul 10",
    );
  });

  it("names a block with its day and time", () => {
    const block: BlockEntry = {
      kind: "block",
      key: "b:Tu",
      day: "Tu",
      start: 780,
      end: 960,
      blockId: "b",
      label: "Work",
    };
    expect(blockLabel(block)).toBe("Work, Tuesday 1pm to 4pm");
  });

  it("names a ghost as another section to switch to", () => {
    expect(ghostLabel(ghost, "CMSC351")).toBe(
      "Switch to 0201, another section of CMSC351: Wednesday 2pm to 2:50pm, Jada Abernathy, overlaps another class",
    );
    expect(
      ghostLabel(
        { ...ghost, sectionCodes: ["0201", "0202"], label: "0201–0202" },
        "CMSC351",
      ),
    ).toBe(
      "2 sections of CMSC351 to choose from, Wednesday 2pm to 2:50pm: pick one",
    );
  });

  it("names a travel pill by its walk and verdict", () => {
    expect(pillLabel(aConnection())).toBe(
      "8 minute walk, tight. ESJ to CSI, 10 minutes between classes.",
    );
    expect(
      pillLabel(aConnection({ walkMinutes: null, verdict: "unknown" })),
    ).toBe("No route data yet. ESJ to CSI.");
  });
});
