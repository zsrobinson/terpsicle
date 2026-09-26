import { describe, expect, it } from "vitest";
import { anUntimedMeeting, aTbaMeeting, aTimedMeeting } from "~/fixtures";
import { REACTIONS } from "../schema";
import {
  compactTimeRange,
  countWords,
  instructorShortName,
  instructorsWords,
  placeWords,
  REACTION_WORDS,
  rangeWords,
  sectionCodesWords,
  startWords,
} from "./words";

describe("instructor words", () => {
  it("uses last names, and counts past two", () => {
    expect(instructorShortName("Pedram Sadeghian")).toBe("Sadeghian");
    expect(instructorShortName("Aaron Kyei-Asare")).toBe("Kyei-Asare");
    expect(instructorsWords([])).toBe("");
    expect(instructorsWords(["Michael Rendall"])).toBe("Rendall");
    expect(instructorsWords(["Ada Brandt", "Lee Moss"])).toBe(
      "Brandt and Moss",
    );
    expect(instructorsWords(["Ada Brandt", "Lee Moss", "Kim Oh"])).toBe(
      "Brandt and 2 others",
    );
  });
});

describe("meeting words", () => {
  const discussion = aTimedMeeting({
    days: ["Tu", "Th"],
    start: 660,
    end: 710,
    kind: "discussion",
    building: "CSI",
    room: "1121",
  });

  it("says when meetings start, with discussion and lab kinds", () => {
    expect(startWords([aTimedMeeting()])).toBe("MWF 10am");
    expect(startWords([discussion])).toBe("TuTh 11am discussion");
    expect(startWords([discussion], { kinds: false })).toBe("TuTh 11am");
    expect(
      startWords([
        aTimedMeeting({ days: ["Tu"], start: 540, end: 590, kind: "lab" }),
        aTimedMeeting({ days: ["Tu"], start: 540, end: 590, kind: "lab" }),
      ]),
    ).toBe("Tu 9am lab");
  });

  it("says so when nothing is timed", () => {
    expect(startWords([])).toBe("");
    expect(startWords([anUntimedMeeting()])).toBe("online, no set time");
    expect(startWords([aTbaMeeting()])).toBe("time TBA");
  });

  it("gives ranges and places for the one-section room", () => {
    expect(compactTimeRange(840, 915)).toBe("2–3:15pm");
    expect(compactTimeRange(690, 770)).toBe("11:30am–12:50pm");
    expect(rangeWords([aTimedMeeting(), discussion])).toBe(
      "MWF 10–10:50am, TuTh 11–11:50am",
    );
    expect(placeWords([aTimedMeeting(), discussion])).toBe(
      "IRB 0324, CSI 1121",
    );
    expect(
      placeWords([aTimedMeeting({ online: true, building: null, room: null })]),
    ).toBe("Online");
    // "online, no set time" already says it.
    expect(placeWords([anUntimedMeeting()])).toBe("");
    expect(placeWords([])).toBe("");
  });
});

describe("sectionCodesWords", () => {
  const order = ["0101", "0102", "0103", "0104", "0201"];

  it("spans consecutive sections, and lists the rest", () => {
    expect(sectionCodesWords([], order)).toBe("");
    expect(sectionCodesWords(["0101"], order)).toBe("0101");
    expect(sectionCodesWords(["0101", "0104"], order)).toBe("0101 and 0104");
    expect(sectionCodesWords(["0101", "0102", "0103"], order)).toBe(
      "0101–0103",
    );
    expect(sectionCodesWords(["0101", "0103", "0201"], order)).toBe(
      "0101, 0103 and 0201",
    );
  });
});

it("counts in plain words", () => {
  expect(countWords(1, "section")).toBe("1 section");
  expect(countWords(4, "lecture")).toBe("4 lectures");
});

it("names every reaction", () => {
  expect(Object.keys(REACTION_WORDS)).toEqual([...REACTIONS]);
});
