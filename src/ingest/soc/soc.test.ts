import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDeptChunk } from "./chunk";
import { courseIdBatches, parseBuildingPopup } from "./client";
import {
  genEdGroups,
  normalizeMeeting,
  normalizeSections,
  parseDays,
  restrictionOf,
} from "./normalize";
import {
  createDepartmentParser,
  parseDepartmentPage,
} from "./parse-department";
import { parseDepartmentList, parseTermDropdown } from "./parse-index";
import { createSectionsParser, parseSectionsPage } from "./parse-sections";
import { mergeTerms } from "./terms";

// Golden tests on the saved Testudo pages in src/ingest/__fixtures__/soc
// (captured 2026-09-25; see its README for what each page covers).

const FIXTURES = new URL("../__fixtures__/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, FIXTURES), "utf8");

function chunkFor(term: string, dept: string, sectionsFile = dept) {
  const page = parseDepartmentPage(read(`soc/${term}/dept/${dept}.html`));
  const sections = parseSectionsPage(
    read(`soc/${term}/sections/${sectionsFile}.html`),
  );
  return buildDeptChunk(term, dept, page, sections);
}

function sectionsOf(file: string, course: string) {
  const raw = parseSectionsPage(read(file)).find((c) => c.course === course);
  if (!raw) throw new Error(`${course} not in ${file}`);
  return normalizeSections(raw);
}

describe("term dropdown", () => {
  it("lists Testudo's terms with the selected one", () => {
    expect(parseTermDropdown(read("soc/index.html"))).toEqual([
      { id: "202605", name: "Summer 2026", selected: false },
      { id: "202608", name: "Fall 2026", selected: false },
      { id: "202612", name: "Winter 2027", selected: false },
      { id: "202701", name: "Spring 2027", selected: true },
    ]);
  });

  it("merges into terms.json: new terms active, dropped ones archived, firstSeen kept", () => {
    const first = mergeTerms(
      null,
      parseTermDropdown(read("soc/index.html")),
      new Date("2026-09-25T08:00:00Z"),
    );
    expect(
      first.terms.map((t) => `${t.id} ${t.status} ${t.season} ${t.year}`),
    ).toEqual([
      "202701 active spring 2027",
      "202612 active winter 2027",
      "202608 active fall 2026",
      "202605 active summer 2026",
    ]);

    const later = mergeTerms(
      first,
      [
        { id: "202608", name: "Fall 2026", selected: false },
        { id: "202701", name: "Spring 2027", selected: false },
        { id: "202705", name: "Summer 2027", selected: true },
      ],
      new Date("2026-10-01T00:00:00Z"),
    );
    const byId = Object.fromEntries(later.terms.map((t) => [t.id, t]));
    expect(byId["202705"]?.status).toBe("active");
    expect(byId["202705"]?.firstSeen).toBe("2026-10-01T00:00:00.000Z");
    expect(byId["202605"]?.status).toBe("archived");
    expect(byId["202605"]?.lastSeen).toBe("2026-09-25T08:00:00.000Z");
    expect(byId["202701"]?.firstSeen).toBe("2026-09-25T08:00:00.000Z");
    expect(later.terms[0]?.id).toBe("202705");
  });
});

describe("department list", () => {
  it("reads every prefix with its name", () => {
    const depts = parseDepartmentList(read("soc/202701/departments.html"));
    expect(depts).toHaveLength(199);
    expect(depts[0]).toEqual({
      code: "AAAS",
      name: "African American and Africana Studies",
    });
    expect(depts.find((d) => d.code === "CMSC")?.name).toBe("Computer Science");
  });

  it("is empty for a term Testudo dropped", () => {
    expect(parseDepartmentList(read("soc/202408/departments.html"))).toEqual(
      [],
    );
  });
});

describe("department page", () => {
  it("reads the seats stamp only where Testudo shows it", () => {
    expect(
      parseDepartmentPage(read("soc/202608/dept/HESI.html")).seatsAsOf,
    ).toBe("09/24/2026 at 10:30 PM");
    expect(
      parseDepartmentPage(read("soc/202701/dept/CMSC.html")).seatsAsOf,
    ).toBeNull();
  });

  it("parses an unknown department as empty", () => {
    const page = parseDepartmentPage(read("soc/202701/dept/XXXX-unknown.html"));
    expect(page.courses).toEqual([]);
  });

  it("gives the same result however the page is chunked", () => {
    const html = read("soc/202701/dept/GEOL.html");
    const parser = createDepartmentParser();
    for (let i = 0; i < html.length; i += 997)
      parser.write(html.slice(i, i + 997));
    expect(parser.end()).toEqual(parseDepartmentPage(html));
  });
});

describe("course normalization", () => {
  const cmsc = chunkFor("202701", "CMSC").chunk;
  const course = (code: string) => {
    const found = cmsc.courses.find((c) => c.code === code);
    if (!found) throw new Error(`${code} missing`);
    return found;
  };

  it("keeps every course and section, sorted", () => {
    expect(cmsc.courses).toHaveLength(75);
    expect(course("CMSC131").sections).toHaveLength(9);
    expect(course("CMSC132").sections).toHaveLength(18);
    const codes = cmsc.courses.map((c) => c.code);
    expect(codes).toEqual([...codes].sort());
  });

  it("splits labeled course text into fields and notes", () => {
    const c = course("CMSC131");
    expect(c.title).toBe("Object-Oriented Programming I");
    expect(c.credits).toEqual({ min: 4, max: 4 });
    expect(c.corequisite).toBe("MATH140.");
    expect(c.otherNotes).toContainEqual({
      label: "Credit only granted for",
      text: "CMSC131, CMSC133 or CMSC141.",
    });
    expect(c.description).toMatch(
      /^Introduction to programming and computer science/,
    );
    expect(c.gradingMethods).toEqual(["Reg"]);
  });

  it("reads cross-listings and variable credits", () => {
    const aaas = chunkFor("202701", "AAAS").chunk;
    const c234 = aaas.courses.find((c) => c.code === "AAAS234");
    expect(c234?.crossListings).toEqual(["ENGL234"]);
    const c386 = aaas.courses.find((c) => c.code === "AAAS386");
    expect(c386?.credits).toEqual({ min: 3, max: 6 });
    expect(c386?.permission).toBe("Perm Req");
  });

  it("groups gen-eds: 'or' shares a group, ',' starts one", () => {
    const geol = chunkFor("202701", "GEOL").chunk;
    const c100 = geol.courses.find((c) => c.code === "GEOL100");
    expect(c100?.genEds).toEqual([
      [{ code: "DSNL", condition: "if taken with GEOL110" }, { code: "DSNS" }],
    ]);
    expect(
      genEdGroups([
        { code: "DSHS", condition: null, separator: "" },
        { code: "DSSP", condition: null, separator: "or" },
        { code: "DVUP", condition: null, separator: "," },
      ]),
    ).toEqual([[{ code: "DSHS" }, { code: "DSSP" }], [{ code: "DVUP" }]]);
  });

  it("matches the golden chunks", async () => {
    for (const dept of ["AGNR", "IDEA", "ARMY", "BUSI"]) {
      const { chunk } = chunkFor("202701", dept);
      await expect(`${JSON.stringify(chunk, null, 1)}\n`).toMatchFileSnapshot(
        `../__fixtures__/golden/202701-${dept}.json`,
      );
    }
  });

  it("keeps departments whose sections page has malformed markup", () => {
    // A section note ending in `</A</div>` once swallowed the next course.
    const html = `<div>
      <div id="EDSP600" class="course-sections"><div class="section delivery-online">
        <span class="section-id">WB21</span>
        <div class="section-texts-container"><div class="section-text"><A HREF="x">here</A</div></div>
      </div></div>
      <div id="EDSP604" class="course-sections"><div class="section delivery-online">
        <span class="section-id">PUR3</span></div></div></div>`;
    expect(
      parseSectionsPage(html).map((c) => [
        c.course,
        c.sections.map((s) => s.code),
      ]),
    ).toEqual([
      ["EDSP600", ["WB21"]],
      ["EDSP604", ["PUR3"]],
    ]);
  });
});

describe("section normalization", () => {
  it("reads a many-section course with discussions", () => {
    const { sections, seats } = sectionsOf(
      "soc/202701/sections/CMSC.html",
      "CMSC131",
    );
    expect(sections[0]).toMatchObject({
      code: "0101",
      instructors: ["Nora Burkhauser"],
      delivery: "f2f",
      notes: null,
      restriction: null,
    });
    expect(sections[0]?.meetings).toEqual([
      {
        timed: true,
        days: ["M", "W", "F"],
        start: 780,
        end: 830,
        kind: "lecture",
        building: "IRB",
        room: "0324",
        online: false,
      },
      {
        timed: true,
        days: ["Tu", "Th"],
        start: 570,
        end: 620,
        kind: "discussion",
        building: "CSI",
        room: "2118",
        online: false,
      },
    ]);
    // Registration isn't open: no waitlist or holdfile counts yet.
    expect(seats.get("0101")).toEqual([30, 30, null, null]);
  });

  it("handles over 12 sections", () => {
    expect(
      sectionsOf("soc/202701/sections/ENGL101.html", "ENGL101").sections,
    ).toHaveLength(92);
  });

  it("infers blended and async online delivery", () => {
    const blended = sectionsOf("soc/202701/sections/AAAS.html", "AAAS202")
      .sections[1];
    expect(blended?.delivery).toBe("blended");
    expect(
      blended?.meetings.map((m) => [m.timed, m.building, m.online]),
    ).toEqual([
      [true, "TYD", false],
      [false, null, true],
    ]);

    const async = sectionsOf("soc/202701/sections/ANTH.html", "ANTH745")
      .sections[0];
    expect(async).toMatchObject({
      code: "PLA1",
      delivery: "online-async",
      dates: { start: "2027-03-01", end: "2027-05-20" },
    });
    expect(async?.restriction).toBe(
      "Must be in Cultural & Heritage Resource Management program. Golden ID students are not eligible for this section.",
    );
    expect(async?.notes).toMatch(
      /^Must be in Cultural & Heritage Resource Management program/,
    );
  });

  it("reads online sync meetings (room ONLINE, no building)", () => {
    const meeting = normalizeMeeting({
      days: "Tu",
      start: "11:00am",
      end: "12:15pm",
      building: null,
      room: "ONLINE",
      type: null,
      elms: false,
      message: null,
    });
    expect(meeting).toEqual({
      timed: true,
      days: ["Tu"],
      start: 660,
      end: 735,
      kind: "lecture",
      building: null,
      room: null,
      online: true,
    });
  });

  it("reads weekend meetings and off-campus codes", () => {
    const busi = sectionsOf(
      "soc/202701/sections/BUSI.html",
      "BUSI758A",
    ).sections;
    const sat = busi.find((s) => s.code === "DC06")?.meetings[0];
    expect(sat).toMatchObject({
      timed: true,
      days: ["Sa"],
      start: 540,
      end: 1020,
      building: "DC",
      room: "C3",
    });

    const buso = sectionsOf("soc/202701/sections/edge-cases.html", "BUSO700")
      .sections[0];
    expect(buso?.meetings[0]).toMatchObject({
      days: ["Sa", "Su"],
      start: 480,
      end: 1200,
      building: null,
    });
  });

  it("reads waitlist and holdfile by label", () => {
    const holdfileOnly = sectionsOf(
      "soc/202701/sections/edge-cases.html",
      "ARCH271",
    );
    expect([...holdfileOnly.seats.values()][0]?.slice(2)).toEqual([null, 0]);
    const both = sectionsOf("soc/202701/sections/edge-cases.html", "BMGT220");
    expect(both.seats.get("0101")?.slice(2)).toEqual([0, 0]);

    const raw = parseSectionsPage(read("soc/202701/sections/edge-cases.html"));
    const arch = raw.find((c) => c.course === "ARCH271")?.sections[0];
    expect([arch?.waitlist, arch?.holdfile]).toEqual([null, 0]);
    const bmgt = raw.find((c) => c.course === "BMGT220")?.sections[0];
    expect([bmgt?.waitlist, bmgt?.holdfile]).toEqual([0, 0]);
  });

  it("drops the TBA instructor and keeps sections with no meeting data", () => {
    const agnr = sectionsOf("soc/202701/sections/AGNR.html", "AGNR388")
      .sections[0];
    expect(agnr?.instructors).toEqual([]);
    expect(agnr?.meetings).toEqual([]);
  });

  it("marks individual-instruction courses", () => {
    const idea = chunkFor("202701", "IDEA").chunk.courses;
    expect(idea.filter((c) => c.contactDepartment).map((c) => c.code)).toEqual([
      "IDEA498",
      "IDEA698",
    ]);
  });

  it("sorts co-instructors, since Testudo's order varies between requests", () => {
    const aaas = sectionsOf("soc/202701/sections/AAAS.html", "AAAS211")
      .sections[0];
    expect(aaas?.instructors).toEqual(["Jason Nichols", "Shane Walsh"]);
  });

  it("keeps rooms for meetings with TBA days", () => {
    const idea = sectionsOf("soc/202701/sections/IDEA.html", "IDEA201")
      .sections[0];
    expect(idea?.meetings.some((m) => !m.timed && m.building === "ESJ")).toBe(
      true,
    );
  });

  it("appends the course footnote to marked sections", () => {
    const aaas = sectionsOf("soc/202701/sections/AAAS.html", "AAAS100")
      .sections[0];
    expect(aaas?.restriction).toBe(
      "These sections are currently restricted to incoming freshmen and transfer students.",
    );
  });

  it("gives every summer section its own dates", () => {
    const raw = parseSectionsPage(read("soc/202605/sections/CMSC.html"));
    const all = raw.flatMap((c) => normalizeSections(c).sections);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((s) => s.dates)).toBe(true);
  });

  it("gives the same result however the page is chunked", () => {
    const html = read("soc/202701/sections/CMSC.html");
    const chunked: unknown[] = [];
    const parser = createSectionsParser((c) => chunked.push(c));
    for (let i = 0; i < html.length; i += 1013)
      parser.write(html.slice(i, i + 1013));
    parser.end();
    expect(chunked).toEqual(parseSectionsPage(html));
  });
});

describe("helpers", () => {
  it("parses day tokens into week order", () => {
    expect(parseDays("TuTh")).toEqual(["Tu", "Th"]);
    expect(parseDays("SaSu")).toEqual(["Sa", "Su"]);
    expect(parseDays("MWF")).toEqual(["M", "W", "F"]);
    expect(parseDays("TBA")).toBeNull();
  });

  it("pulls restriction sentences out of notes, without a Restriction: label", () => {
    expect(
      restrictionOf(
        "Restriction: Must be in the College Park Scholars Program.",
      ),
    ).toBe("Must be in the College Park Scholars Program.");
    expect(restrictionOf("This section is reserved for Honors students.")).toBe(
      "This section is reserved for Honors students.",
    );
    expect(
      restrictionOf(
        "Registration is restricted to Biological Sciences-Shady Grove majors. Click here for more.",
      ),
    ).toBe(
      "Registration is restricted to Biological Sciences-Shady Grove majors.",
    );
    expect(restrictionOf("Click here for program information.")).toBeNull();
  });

  it("batches course ids under the URL limit", () => {
    const ids = Array.from(
      { length: 1000 },
      (_, i) => `CMSC${String(i).padStart(3, "0")}`,
    );
    const batches = courseIdBatches(ids);
    expect(batches.flat()).toEqual(ids);
    expect(
      Math.max(...batches.map((b) => b.join(",").length)),
    ).toBeLessThanOrEqual(4000);
  });

  it("reads the building popup", () => {
    expect(parseBuildingPopup(read("soc/buildings/IRB-0318.html"))).toEqual({
      number: "432",
      name: "Brendan Iribe Center",
    });
    expect(
      parseBuildingPopup(read("soc/buildings/SHM-2102.html"))?.number,
    ).toBe("037");
    expect(parseBuildingPopup("<html>nope</html>")).toBeNull();
  });
});
