import { describe, expect, it } from "vitest";
import { displayTitle } from "./display-title";

// Transcripts shout (docs/V3.md §2.10): Plan shows their titles the way the
// catalog writes its own, and keeps what the transcript said.

describe("displayTitle", () => {
  it("title-cases a transcript's capitals", () => {
    expect(displayTitle("COLLEGE ALGEBRA")).toBe("College Algebra");
    expect(displayTitle("FUNDAMENTALS OF SOILS")).toBe("Fundamentals of Soils");
    expect(
      displayTitle("INTRODUCTION TO ENVIRONMENTAL SCIENCE AND POLICY"),
    ).toBe("Introduction to Environmental Science and Policy");
  });

  it("keeps a small word capitalized when it starts the title or a part", () => {
    expect(displayTitle("THE AMERICAN NOVEL")).toBe("The American Novel");
    expect(displayTitle("WRITING: A PRACTICUM")).toBe("Writing: A Practicum");
    expect(displayTitle("IN THE WORLD")).toBe("In the World");
  });

  it("keeps exams, numerals and letter codes in capitals", () => {
    expect(displayTitle("AP CALCULUS AB")).toBe("AP Calculus AB");
    expect(displayTitle("IB PSYCHOLOGY HL")).toBe("IB Psychology HL");
    expect(displayTitle("CLEP SPANISH LANGUAGE")).toBe("CLEP Spanish Language");
    expect(displayTitle("ANATOMY AND PHYSIOLOGY II")).toBe(
      "Anatomy and Physiology II",
    );
    expect(displayTitle("INTERPRETING AMER HIST I")).toBe(
      "Interpreting Amer Hist I",
    );
    expect(displayTitle("IB ENGLISH A LIT HL")).toBe("IB English A Lit HL");
  });

  it("cases each part of a hyphenated, slashed or possessive word", () => {
    expect(displayTitle("INTRO TO SOCIOLOGY/SOCY 101")).toBe(
      "Intro to Sociology/Socy 101",
    );
    expect(displayTitle("NON-WESTERN ART")).toBe("Non-Western Art");
    expect(displayTitle("WOMEN'S HISTORY")).toBe("Women's History");
    expect(displayTitle("ART & DESIGN (LAB)")).toBe("Art & Design (Lab)");
  });

  it("leaves a title that already has lowercase letters alone", () => {
    expect(displayTitle("Organic Chemistry I")).toBe("Organic Chemistry I");
    expect(displayTitle("iOS Development")).toBe("iOS Development");
  });

  it("leaves codes and numbers as they are", () => {
    expect(displayTitle("CMSC131 EQUIVALENT")).toBe("CMSC131 Equivalent");
    expect(displayTitle("3D MODELING")).toBe("3D Modeling");
    expect(displayTitle("")).toBe("");
  });
});
