import { describe, expect, it } from "vitest";
import { messageToText } from "~/app/message-text";
import type { Problem } from "~/core/schema";
import { aProblem } from "~/fixtures";
import { problemWords } from "./problem-words";

const words = (problem: Problem, courseCode: string) => {
  const message = problemWords(problem, courseCode);
  return message ? messageToText(message) : null;
};

describe("problemWords", () => {
  // Core's shape for a connection: the connection, then to, then from.
  const connection = (kind: "tight-connection" | "not-enough-time") =>
    aProblem({
      kind,
      subjects: [
        { kind: "connection", connectionId: "M:STAT400-0101>CMSC351-0301" },
        { kind: "section", sectionKey: "CMSC351-0301" },
        { kind: "section", sectionKey: "STAT400-0101" },
      ],
    });

  it("names the other end of a connection, from each course's side", () => {
    const tight = connection("tight-connection");
    expect(words(tight, "STAT400")).toBe("Tight connection to CMSC351");
    expect(words(tight, "CMSC351")).toBe("Tight connection from STAT400");
    const short = connection("not-enough-time");
    expect(words(short, "STAT400")).toBe("Not enough time to get to CMSC351");
    expect(words(short, "CMSC351")).toBe("Not enough time after STAT400");
  });

  it("names what a course overlaps, a class or a block", () => {
    const classes = aProblem({
      kind: "overlap",
      subjects: [
        { kind: "section", sectionKey: "CMSC330-0103" },
        { kind: "section", sectionKey: "ENGL393-0101" },
      ],
    });
    expect(words(classes, "CMSC330")).toBe("Overlaps ENGL393");
    expect(words(classes, "ENGL393")).toBe("Overlaps CMSC330");
    const block = aProblem({
      kind: "overlap",
      subjects: [
        { kind: "section", sectionKey: "AAAS100-0301" },
        { kind: "block", blockId: "block_1" },
      ],
      title: [
        { kind: "course", courseCode: "AAAS100" },
        { kind: "text", text: " overlaps " },
        { kind: "block", blockId: "block_1", label: "Lunch" },
      ],
    });
    expect(words(block, "AAAS100")).toBe("Overlaps Lunch");
  });

  it("says restricted, cancelled or changed plainly", () => {
    expect(words(aProblem({ kind: "restricted" }), "CMSC351")).toBe(
      "Restricted",
    );
    expect(words(aProblem({ kind: "cancelled" }), "CMSC351")).toBe("Cancelled");
    expect(words(aProblem({ kind: "changed" }), "CMSC351")).toBe(
      "Times changed",
    );
  });

  it("leaves seats to the row's seat words, and notes to Problems", () => {
    for (const kind of [
      "full",
      "few-seats",
      "no-set-times",
      "instructor-tba",
    ] as const)
      expect(problemWords(aProblem({ kind }), "CMSC351")).toBeNull();
  });
});
