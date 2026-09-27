import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  aCourse,
  aGradeRecord,
  anInstructor,
  aPlanetTerpDept,
  aSection,
  someCourseGrades,
  someGrades,
} from "~/fixtures";
import { quietTooltips, TooltipProvider } from "~/ui/tooltip";
import { Grades } from "./grades";

// Three instructors in PlanetTerp's history; only Ada Brandt teaches this term.
const course = aCourse({
  sections: [aSection({ instructors: ["Ada Brandt"] })],
});
const planetTerp = aPlanetTerpDept({
  instructors: {
    brandt: anInstructor(),
    cole: anInstructor({ slug: "cole", name: "Ben Cole" }),
    ames: anInstructor({ slug: "ames", name: "Cy Ames" }),
  },
  names: { "ada brandt": "brandt" },
  courses: {
    CMSC351: someCourseGrades({
      byInstructor: {
        brandt: aGradeRecord(),
        cole: aGradeRecord({ counts: someGrades({ A: 200 }) }),
        ames: aGradeRecord(),
      },
    }),
  },
});

function renderGrades() {
  return render(
    <TooltipProvider>
      <Grades course={course} planetTerp={planetTerp} loading={false} />
    </TooltipProvider>,
  );
}

describe("Grades", () => {
  it("puts this term's instructors first, and the rest under Past instructors", async () => {
    const user = userEvent.setup();
    renderGrades();
    const chips = screen.getByRole("radiogroup", { name: "Whose grades" });
    expect(
      within(chips)
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toEqual(["All instructors", "Ada Brandt"]);
    const sentence = () => screen.getByText(/got an A or B/).textContent;
    const everyone = sentence();

    await user.click(
      within(chips).getByRole("button", { name: /Past instructors/ }),
    );
    expect(
      screen.getAllByRole("menuitemradio").map((i) => i.textContent),
    ).toEqual(["Ben Cole", "Cy Ames"]);
    await user.click(screen.getByRole("menuitemradio", { name: "Ben Cole" }));
    expect(
      within(chips).getByRole("button", { name: /Ben Cole/ }),
    ).toBeInTheDocument();
    expect(sentence()).not.toBe(everyone);
  });

  it("draws the bars under the sentence", () => {
    renderGrades();
    expect(screen.getByTestId("grade-bars")).toBeInTheDocument();
    expect(screen.getByText(/students over 6 semesters/)).toBeInTheDocument();
  });

  it("names the shades, and says a segment's share is of all grades", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Grades course={course} planetTerp={planetTerp} loading={false} />
      </TooltipProvider>,
    );
    const legend = screen.getByRole("list", { name: "Shades" });
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((i) => i.textContent),
    ).toEqual(["A+, B+…", "A, B…", "A−, B−…"]);
    const plainA = document.querySelector('[data-grade="A"]');
    if (!plainA) throw new Error("no plain A segment");
    // The first test's menu hushed tooltips as it closed; this is a new page.
    quietTooltips(0);
    await user.hover(plainA);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      /^A: [\d,]+ students · \d+% of all grades$/,
    );
  });

  it("says when PlanetTerp has nothing", () => {
    render(
      <TooltipProvider>
        <Grades
          course={aCourse({ code: "CMSC999" })}
          planetTerp={planetTerp}
          loading={false}
        />
      </TooltipProvider>,
    );
    expect(
      screen.getByText("PlanetTerp has no grades for CMSC999 yet."),
    ).toBeInTheDocument();
  });

  it("says the file didn't load, rather than that there are no grades", () => {
    render(
      <TooltipProvider>
        <Grades course={course} planetTerp={null} loading={false} failed />
      </TooltipProvider>,
    );
    expect(
      screen.getByText(/Couldn't load grades from PlanetTerp/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/has no grades/)).toBeNull();
  });
});
