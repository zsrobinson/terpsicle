import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TranscriptParseSchema } from "../../schema";
import { PASTES } from "./__fixtures__/pastes";
import { parseTranscript } from "./parse";

// What a paste goes through before it reaches us: the browser's copy, the
// OS's line ends, the page around the transcript. None of it may change what
// we read. The Safari and Chrome shapes are our best understanding of how
// each copies Testudo's page (Safari keeps `&nbsp;` as a non-breaking space;
// Chrome turns a table's cells into tabs and drops the indent); a real paste
// from each browser should replace them when the owner shares one.

const NBSP = String.fromCharCode(0xa0);
const BOM = String.fromCharCode(0xfeff);
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PASTE_LIST = Object.entries(PASTES);

/** Rewrites every run of spaces in each line: the indent, one-space word gaps and wide column gaps. */
function respace(
  text: string,
  gap: (wide: boolean, indent: boolean) => string,
): string {
  return text
    .split("\n")
    .map((line) =>
      line.replace(/ +/g, (run: string, offset: number) =>
        gap(run.length >= 2, offset === 0),
      ),
    )
    .join("\n");
}

const expectSameRead = (changed: string, original: string) =>
  expect(parseTranscript(changed)).toEqual(parseTranscript(original));

/** A stream's next value; fast-check's infinite streams never end. */
function next<T>(it: Iterator<T>): T {
  const { value } = it.next();
  return value as T;
}

describe("robustness", () => {
  it("never throws, and always answers in the schema", () => {
    const fragment = fc.constantFrom(
      "Fall 2025",
      "Transfer Credit",
      "x@example.edu",
      "CMSC131",
      "CMSC 131",
      "0101",
      "A-",
      "W",
      "NC",
      "D",
      "P",
      "4.00",
      "999.999",
      "DSHS or DSNS",
      "DSNL (if taken with GEOL110",
      ")",
      ",",
      "or",
      "CHEM 1XX",
      "Credit not granted",
    );
    const line = fc.array(
      fc.oneof(fragment, fc.string({ maxLength: 12, unit: "binary" })),
      { maxLength: 10 },
    );
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(line, fc.constantFrom(" ", "  ", "\t", NBSP, "   ")),
          { maxLength: 30 },
        ),
        fc.constantFrom("\n", "\r\n", "\r"),
        (lines, eol) => {
          const text = lines.map(([parts, sep]) => parts.join(sep)).join(eol);
          const parse = parseTranscript(text);
          expect(TranscriptParseSchema.safeParse(parse).success).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it.each(PASTE_LIST)("%s: reads the same with any spacing", (_, text) => {
    const run = (chars: string[], min: number, max: number) =>
      fc
        .array(fc.constantFrom(...chars), { minLength: min, maxLength: max })
        .map((c) => c.join(""));
    fc.assert(
      fc.property(
        fc.infiniteStream(run([" ", "\t", NBSP], 2, 9)),
        fc.infiniteStream(fc.constantFrom(" ", NBSP)),
        fc.infiniteStream(run([" ", "\t", NBSP], 0, 12)),
        fc.infiniteStream(run(["\n", " \n", "\t\n"], 1, 3)),
        (wideGaps, wordGaps, indents, lineEnds) => {
          const wide = wideGaps[Symbol.iterator]();
          const word = wordGaps[Symbol.iterator]();
          const indent = indents[Symbol.iterator]();
          const end = lineEnds[Symbol.iterator]();
          const spaced = respace(text, (isWide, isIndent) =>
            next(isIndent ? indent : isWide ? wide : word),
          );
          // Blank and whitespace-only lines anywhere, trailing space anywhere.
          const relined = spaced
            .split("\n")
            .map((l) => `${l}${next(end)}`)
            .join("");
          expectSameRead(relined, text);
        },
      ),
      { numRuns: 40 },
    );
  });

  it.each(PASTE_LIST)("%s: reads the same with any line ends", (_, text) => {
    fc.assert(
      fc.property(
        fc.infiniteStream(fc.constantFrom("\n", "\r\n", "\r", LINE_SEPARATOR)),
        (lineEnds) => {
          const end = lineEnds[Symbol.iterator]();
          const changed = text
            .split("\n")
            .map((l) => `${l}${next(end)}`)
            .join("");
          expectSameRead(changed, text);
        },
      ),
      { numRuns: 40 },
    );
  });

  it.each(PASTE_LIST)("%s: ignores the page around it", (_, text) => {
    // A page's chrome: navigation above, a footer and trailing junk below.
    // No `@` above, since that would be the header's email line.
    const junkLine = fc.stringMatching(/^[a-z0-9 .,:;!?()&|/'-]{0,80}$/);
    fc.assert(
      fc.property(
        fc.array(junkLine, { maxLength: 8 }),
        fc.array(junkLine, { maxLength: 8 }),
        (above, below) => {
          expectSameRead([...above, text, ...below].join("\n"), text);
        },
      ),
      { numRuns: 60 },
    );
  });

  describe.each(PASTE_LIST)("%s: browsers", (_, text) => {
    it("reads a Safari-style paste (non-breaking spaces in the columns)", () => {
      const safari = respace(text, (wide, indent) =>
        wide || indent ? `${NBSP} ${NBSP} ` : " ",
      );
      expect(safari).toContain(NBSP);
      expectSameRead(safari, text);
    });

    it("reads a Chrome-style paste (tab-separated cells, no indent, CRLF)", () => {
      const chrome = respace(text, (wide, indent) =>
        indent ? "" : wide ? "\t" : " ",
      ).replace(/\n/g, "\r\n");
      expect(chrome).toContain("\t");
      expectSameRead(chrome, text);
    });

    it("reads a paste with a byte-order mark and zero-width spaces", () => {
      const marked = `${BOM}${text.replace(/ {2}/g, ` ${ZERO_WIDTH_SPACE} `)}`;
      expectSameRead(marked, text);
    });
  });
});
