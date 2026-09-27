import { describe, expect, it } from "vitest";
import {
  CHAT_MENTIONS_MAX,
  findMentions,
  insertMention,
  mentionDraft,
  mentionMatches,
} from "./mentions";

const hannah = { directoryId: "hlee", name: "Hannah Lee" };
const hannahK = { directoryId: "hkim", name: "Hannah Kim" };
const omar = { directoryId: "oali", name: "Omar Ali" };
const jose = { directoryId: "jnunez", name: "José Núñez" };
const members = [hannah, hannahK, omar, jose];

describe("findMentions", () => {
  it("finds full names, in order, each once", () => {
    expect(
      findMentions("@Omar Ali and @Hannah Lee, @omar ali again", members, "me"),
    ).toEqual(["oali", "hlee"]);
  });

  it("takes a first name only when one member has it", () => {
    expect(findMentions("@Omar can you check?", members, "me")).toEqual([
      "oali",
    ]);
    expect(findMentions("@Hannah can you check?", members, "me")).toEqual([]);
    expect(findMentions("@josé hi", members, "me")).toEqual(["jnunez"]);
    expect(findMentions("see @Omar's notes", members, "me")).toEqual(["oali"]);
    expect(findMentions("see @Omar Ali's notes", members, "me")).toEqual([
      "oali",
    ]);
  });

  it("prefers the longest name that fits", () => {
    const both = [
      { directoryId: "a", name: "Ada" },
      { directoryId: "ab", name: "Ada Brandt" },
    ];
    expect(findMentions("@Ada Brandt hi", both, "me")).toEqual(["ab"]);
    expect(findMentions("@Ada hi", both, "me")).toEqual(["a"]);
  });

  it("needs the name to end at a word's end", () => {
    const both = [
      { directoryId: "a", name: "Ada" },
      { directoryId: "ab", name: "Ada Brandt" },
    ];
    expect(findMentions("@Ada Brandtson", both, "me")).toEqual(["a"]);
    expect(findMentions("@Omarr", members, "me")).toEqual([]);
  });

  it("ignores email addresses, names not in the room, and the author", () => {
    expect(findMentions("mail oali@umd.edu", members, "me")).toEqual([]);
    expect(findMentions("@Someone Else", members, "me")).toEqual([]);
    expect(findMentions("@Omar Ali", members, "oali")).toEqual([]);
  });

  it("stops at five", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      directoryId: `u${i}`,
      name: `Person${i} Test`,
    }));
    const text = many.map((m) => `@${m.name}`).join(" ");
    expect(findMentions(text, many, "me")).toHaveLength(CHAT_MENTIONS_MAX);
  });
});

describe("the composer's autocomplete", () => {
  it("finds the mention being typed", () => {
    expect(mentionDraft("hi @Han", 7)).toEqual({ start: 3, query: "Han" });
    expect(mentionDraft("hi @Hannah L", 12)).toEqual({
      start: 3,
      query: "Hannah L",
    });
    expect(mentionDraft("@", 1)).toEqual({ start: 0, query: "" });
  });

  it("ignores an email, a space after the @, and a finished line", () => {
    expect(mentionDraft("oali@um", 7)).toBeNull();
    expect(mentionDraft("hi @ there", 10)).toBeNull();
    expect(mentionDraft("@Han\nx", 6)).toBeNull();
    expect(mentionDraft("no mention", 10)).toBeNull();
  });

  it("matches a name or any word of it", () => {
    expect(mentionMatches(members, "han").map((m) => m.directoryId)).toEqual([
      "hlee",
      "hkim",
    ]);
    expect(mentionMatches(members, "kim").map((m) => m.directoryId)).toEqual([
      "hkim",
    ]);
    expect(mentionMatches(members, "")).toHaveLength(4);
    expect(mentionMatches(members, "", 2)).toHaveLength(2);
  });

  it("puts the full name in with a space after", () => {
    const text = "hi @Han what's up";
    const draft = mentionDraft(text, 7);
    if (!draft) throw new Error("no draft");
    expect(insertMention(text, draft, 7, "Hannah Lee")).toEqual({
      text: "hi @Hannah Lee what's up",
      caret: 15,
    });
    expect(
      insertMention("@o", { start: 0, query: "o" }, 2, "Omar Ali"),
    ).toEqual({ text: "@Omar Ali ", caret: 10 });
  });

  it("round-trips: what it inserts, findMentions finds", () => {
    const { text } = insertMention(
      "@hk",
      { start: 0, query: "hk" },
      3,
      hannahK.name,
    );
    expect(findMentions(`${text}see above`, members, "me")).toEqual(["hkim"]);
  });
});
