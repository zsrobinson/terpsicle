import { describe, expect, it } from "vitest";
import aliases from "./aliases.json";
import {
  createNameMatcher,
  givenNameRelation,
  nameTokens,
  type PlanetTerpPerson,
} from "./names";

// Cases are real Testudo/PlanetTerp pairs from 2026-09-25 unless noted.

const person = (
  name: string,
  slug: string,
  courses: string[] = [],
  extra: Partial<PlanetTerpPerson> = {},
): PlanetTerpPerson => ({
  name,
  slug,
  type: "professor",
  courses: new Set(courses),
  reviewCount: 0,
  ...extra,
});

/** People who taught `course`, so it isn't rare on PlanetTerp. */
const teachersOf = (course: string, n = 5) =>
  Array.from({ length: n }, (_, i) =>
    person(`Filler Person${i}`, `filler_${course}_${i}`, [course]),
  );

const set = (...courses: string[]) => new Set(courses);

describe("nameTokens", () => {
  it("folds accents, apostrophes, hyphens and periods", () => {
    expect(nameTokens("José Núñez-García")).toEqual([
      "jose",
      "nunez",
      "garcia",
    ]);
    expect(nameTokens("Terrence O’Brien")).toEqual(["terrence", "obrien"]);
    expect(nameTokens("Terrence O'Brien")).toEqual(["terrence", "obrien"]);
    expect(nameTokens("S. G. Ortiz")).toEqual(["s", "g", "ortiz"]);
  });

  it("drops parentheticals and generational suffixes", () => {
    expect(nameTokens("Amber Johnson (ENME)")).toEqual(["amber", "johnson"]);
    expect(nameTokens("Martin Luther King Jr.")).toEqual([
      "martin",
      "luther",
      "king",
    ]);
    // Two parts only: "Iv" may be a surname, so it stays.
    expect(nameTokens("Ivan Iv")).toEqual(["ivan", "iv"]);
  });
});

describe("givenNameRelation", () => {
  it("ranks same, nickname, prefix and initial", () => {
    expect(givenNameRelation("liz", "elizabeth")).toBe("nickname");
    expect(givenNameRelation("bill", "william")).toBe("nickname");
    expect(givenNameRelation("kris", "kristina")).toBe("prefix");
    expect(givenNameRelation("n", "naomi")).toBe("initial");
    expect(givenNameRelation("anne", "anne")).toBe("same");
  });

  it("rejects unrelated names, short prefixes and wrong initials", () => {
    expect(givenNameRelation("al", "alice")).toBeNull();
    expect(givenNameRelation("l", "naomi")).toBeNull();
    expect(givenNameRelation("genna", "gennifer")).toBeNull();
    expect(givenNameRelation("bill", "robert")).toBeNull();
  });
});

describe("createNameMatcher", () => {
  it("keeps exact matches, and picks the same-name slug who taught the course", () => {
    const m = createNameMatcher([
      person("Douglas Hamilton", "hamilton", ["BSCI330"]),
      person("Douglas Hamilton", "hamilton_douglas", ["ENME331"]),
    ]);
    expect(m.match("Douglas Hamilton", set("ENME331"))).toEqual({
      slug: "hamilton_douglas",
      rule: "exact",
    });
    expect(m.exact("Douglas Hamilton", set("BSCI330"))).toBe("hamilton");
  });

  it("prefers a professor over a TA with the same name", () => {
    const m = createNameMatcher([
      person("Tiffany Lu", "lu_ta", [], { type: "ta", reviewCount: 9 }),
      person("Tiffany Lu", "lu", []),
    ]);
    expect(m.match("Tiffany Lu", set("CMSC131"))?.slug).toBe("lu");
  });

  describe("alias", () => {
    it("uses the checked-in map, and ignores slugs PlanetTerp no longer has", () => {
      const m = createNameMatcher([person("Cornelia Van der Weele", "weele")], {
        aliases: new Map([
          ["corine van der weele", "weele"],
          ["kelly colburn", "colburn"],
        ]),
      });
      expect(m.match("Corine Van der Weele", set())).toEqual({
        slug: "weele",
        rule: "alias",
      });
      expect(m.match("Kelly Colburn", set())).toBeNull();
    });

    it("has a reason for every entry and no duplicate names", () => {
      const names = aliases.map((a) => a.testudo.toLowerCase());
      expect(new Set(names).size).toBe(names.length);
      for (const a of aliases) expect(a.why.length).toBeGreaterThan(20);
    });
  });

  describe("normalized", () => {
    const m = createNameMatcher([
      person("Terrence O’Brien", "o’brien"),
      person("Amber Johnson (ENME)", "johnson_amber"),
      person("Vanessa Frias-Martinez", "frias-martinez"),
      person("Nicole DeLoatch", "deloatch_nicole"),
      person("Hamed Salehizadeh", "salehizadeh"),
    ]);

    it.each([
      ["Terrence O'Brien", "o’brien"],
      ["Amber Johnson", "johnson_amber"],
      ["Vanessa Frias Martinez", "frias-martinez"],
      ["Nicole De Loatch", "deloatch_nicole"],
      ["Hamed Salehi Zadeh", "salehizadeh"],
    ])("matches %s without course evidence", (name, slug) => {
      expect(m.match(name, set())).toEqual({ slug, rule: "normalized" });
    });

    it("doesn't match a different surname that differs only after folding", () => {
      expect(m.match("Nicole Loatch", set())).toBeNull();
    });
  });

  describe("nickname", () => {
    it("matches with a shared course", () => {
      const m = createNameMatcher([
        person("Elizabeth Feldman", "feldman_elizabeth", ["JOUR360"]),
      ]);
      expect(m.match("Liz Feldman", set("JOUR360"))).toEqual({
        slug: "feldman_elizabeth",
        rule: "nickname",
      });
    });

    it("needs course evidence", () => {
      const m = createNameMatcher([
        person("Elizabeth Feldman", "feldman_elizabeth", ["JOUR360"]),
      ]);
      expect(m.match("Liz Feldman", set("BMGT110"))).toBeNull();
    });

    it("accepts a department match only for a surname nobody else has", () => {
      const unique = createNameMatcher([
        person("Steven Anlage", "anlage", ["PHYS401", "PHYS410"]),
      ]);
      expect(unique.match("Steve Anlage", set("PHYS313"))?.slug).toBe("anlage");

      const common = createNameMatcher([
        person("Steven Smith", "smith_steven", ["PHYS401", "PHYS410"]),
        person("Karen Smith", "smith_karen", ["ENGL101"]),
      ]);
      expect(common.match("Steve Smith", set("PHYS313"))).toBeNull();
    });
  });

  describe("extra-names", () => {
    it.each([
      ["Brittany L Williams", "Brittany Williams", ["ARCH405", "ARCH600"]],
      ["Evelyn Covington-Moore", "Evelyn Covington", ["CMNS100", "EDUC388U"]],
      ["Muhammad Aftab", "Muhammad Junaid Aftab", ["MATH141", "MATH140"]],
    ])("matches %s to %s", (testudo, planetTerp, courses) => {
      const m = createNameMatcher([person(planetTerp, "slug", courses)]);
      expect(m.match(testudo, new Set(courses))).toEqual({
        slug: "slug",
        rule: "extra-names",
      });
    });

    it("rejects one common shared course on a slug that mostly teaches elsewhere", () => {
      // PlanetTerp's Taylor Lewis is mostly a survey-methods professor; one
      // WEID seminar isn't enough to call them Taylor Togafau-Lewis.
      const m = createNameMatcher([
        person("Taylor Lewis", "lewis_taylor", [
          "SURV615",
          "SURV616",
          "SPHL601",
          "SPHL602",
          "WEID139T",
        ]),
        ...teachersOf("WEID139T"),
      ]);
      expect(
        m.match(
          "Taylor Togafau-Lewis",
          set("EDUC388T", "TLPL188A", "WEID139T"),
        ),
      ).toBeNull();
    });

    it("accepts one shared course that few people have taught", () => {
      const m = createNameMatcher([
        person("Jeffrey McKinney", "mckinney_jeffrey", [
          "BMGT463",
          "BUMO767",
          "COMM107",
          "ENTS669B",
        ]),
      ]);
      expect(m.match("Jeff McKinney", set("ENTS669B"))?.slug).toBe(
        "mckinney_jeffrey",
      );
    });

    it("never drops the given name to find a match", () => {
      const m = createNameMatcher([
        person("Cathy Chen", "chen_cathy", ["BMGT350", "BMGT457"]),
        person("Yi Chen", "chen_yi", ["BMGT350", "BMGT457"]),
      ]);
      expect(m.match("Cathy Yi Chen", set("BMGT350", "BMGT457"))?.slug).toBe(
        "chen_cathy",
      );
    });
  });

  describe("short-name", () => {
    it("matches with two shared courses", () => {
      const m = createNameMatcher([
        person("Kris Mayo", "mayo", ["ANSC101", "ANSC103", "ANSC210"]),
      ]);
      expect(m.match("Kristina Mayo", set("ANSC101", "ANSC103"))).toEqual({
        slug: "mayo",
        rule: "short-name",
      });
    });

    it("keeps apart different people whose given names share a start", () => {
      // Both teach at UMD today under their own exact names.
      const m = createNameMatcher([
        person("Mingyue Li", "li_mingyue", ["MUSC102", "MEES661"]),
        person("Xinzhi Zhao", "zhao_xinzhi", ["PHIL445", "BMGT220"]),
      ]);
      expect(m.match("Ming Li", set("MEES661"))).toBeNull();
      expect(m.match("Xin Zhao", set("BMGT220", "BMGT326"))).toBeNull();
    });
  });

  describe("initial", () => {
    it("matches an initial with a shared course", () => {
      const m = createNameMatcher([
        person("Naomi Parker", "parker_naomi", ["ENMA180", "ENMA671"]),
      ]);
      expect(m.match("N Parker", set("ENMA180"))).toEqual({
        slug: "parker_naomi",
        rule: "initial",
      });
    });

    it("doesn't match an initial without one", () => {
      const m = createNameMatcher([
        person("Lawrence Gordon", "gordon_lawrence", ["BUAC758Q", "HACS208A"]),
      ]);
      expect(m.match("L Gordon", set("COMM107"))).toBeNull();
    });
  });

  it("never gives someone the slug of another instructor teaching under that exact name", () => {
    const people = [
      person("Angel Dunbar", "dunbar_angel", ["AAAS202", "AAAS210", "AAAS397"]),
    ];
    const courses = set("AAAS202", "AAAS210");
    expect(
      createNameMatcher(people).match("Angelica Dunbar", courses)?.slug,
    ).toBe("dunbar_angel");
    expect(
      createNameMatcher(people, {
        testudoNames: ["Angelica Dunbar", "Angel Dunbar"],
      }).match("Angelica Dunbar", courses),
    ).toBeNull();
  });

  it("prefers the closer name among one person's duplicate slugs", () => {
    const m = createNameMatcher([
      person("Jung-Jung Lee-Heitz", "lee-heitz_jung-jung", [
        "CHIN301",
        "CHIN302",
        "CHIN401",
      ]),
      person("Jungjung Lee-Heitz", "lee-heitz", ["CHIN301", "CHIN302"]),
    ]);
    expect(
      m.match("Jungjung Lee", set("CHIN301", "CHIN302", "CHIN401"))?.slug,
    ).toBe("lee-heitz");
  });

  it("matches nobody when two different people fit equally well", () => {
    const m = createNameMatcher([
      person("Robert Gross", "gross_robert", ["MUSC151", "MUSC152"]),
      person("Rob Gross", "gross_rob", ["MUSC151", "MUSC152"]),
    ]);
    expect(m.match("Bob Gross", set("MUSC151", "MUSC152"))).toBeNull();
  });
});
