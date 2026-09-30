import { describe, expect, it } from "vitest";
import { aChatAuthor } from "~/fixtures";
import { joinGroups, joinWords } from "./joins";

const alex = aChatAuthor({ directoryId: "alexk", name: "Alex Kim" });
const sam = aChatAuthor({ directoryId: "samlee", name: "Sam Lee" });
const kim = aChatAuthor({ directoryId: "kimo", name: "Kim Oh" });
const lee = aChatAuthor({ directoryId: "leem", name: "Lee Moss" });
const ada = aChatAuthor({ directoryId: "adab", name: "Ada Brandt" });

const at = (hour: number, day = 28) =>
  `2026-09-${day}T${String(hour).padStart(2, "0")}:00:00.000Z`;

describe("joinGroups", () => {
  const messages = [
    { id: "m1", createdAt: at(14) },
    { id: "m2", createdAt: at(18) },
  ];

  it("puts everyone who joined between two messages on one line", () => {
    const joins = [
      { author: alex, at: at(15) },
      { author: sam, at: at(16) },
      { author: kim, at: at(19) },
    ];
    expect(joinGroups(joins, messages, { complete: true })).toEqual([
      { before: "m2", people: [alex, sam], at: at(16) },
      { before: null, people: [kim], at: at(19) },
    ]);
  });

  it("starts a new line on a new day, and names each person once", () => {
    const joins = [
      { author: alex, at: at(19) },
      { author: alex, at: at(20) },
      { author: sam, at: at(15, 29) },
    ];
    expect(joinGroups(joins, messages, { complete: true })).toEqual([
      { before: null, people: [alex], at: at(20) },
      { before: null, people: [sam], at: at(15, 29) },
    ]);
  });

  it("leaves joins older than the first message to the page that has them", () => {
    const joins = [{ author: alex, at: at(10) }];
    expect(joinGroups(joins, messages, { complete: false })).toEqual([]);
    expect(joinGroups(joins, messages, { complete: true })).toEqual([
      { before: "m1", people: [alex], at: at(10) },
    ]);
    expect(joinGroups(joins, [], { complete: true })).toEqual([
      { before: null, people: [alex], at: at(10) },
    ]);
  });
});

describe("joinWords", () => {
  it("says who joined, briefly", () => {
    expect(joinWords([alex])).toBe("Alex joined");
    expect(joinWords([alex, sam])).toBe("Alex and Sam joined");
    expect(joinWords([alex, sam, kim])).toBe("Alex, Sam and Kim joined");
    expect(joinWords([alex, sam, kim, lee, ada])).toBe(
      "Alex, Sam and 3 others joined",
    );
    expect(joinWords([alex, sam], "samlee")).toBe("You and Alex joined");
  });
});
