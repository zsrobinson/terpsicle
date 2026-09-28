import { describe, expect, it } from "vitest";
import {
  renderSeatOpenEmail,
  renderSeatsOpenEmail,
  type SectionRef,
} from "./email";

const ref: SectionRef = {
  termId: "202701",
  termName: "Spring 2027",
  courseCode: "CMSC351",
  sectionCode: "0101",
  title: "Algorithms <& friends>",
};
const origin = "https://terpsicle.com";
const stop = `${origin}/api/alerts/one-click?u=tstudent&t=202701&s=CMSC351-0101&k=abc`;

describe("the seat-open email", () => {
  it("has counts, an as-of time in Eastern, links, and one-click unsubscribe", () => {
    const email = renderSeatOpenEmail(
      origin,
      ref,
      { open: 1, total: 120, waitlist: 4, asOf: "2026-09-25T02:30:00.000Z" },
      stop,
    );
    expect(email.subject).toBe("A seat opened in CMSC351 0101");
    expect(email.text).toContain("Seats: 1 of 120 open");
    expect(email.text).toContain("Waitlist: 4");
    expect(email.text).toContain("As of: Sep 24, 10:30 PM ET");
    expect(email.text).toContain(
      `${origin}/schedule/course/CMSC351?term=202701`,
    );
    expect(email.text).toContain(
      "https://app.testudo.umd.edu/soc/202701/CMSC/CMSC351",
    );
    expect(email.text).toContain(`${origin}/settings#watching`);
    expect(email.headers["List-Unsubscribe"]).toBe(`<${stop}>`);
    expect(email.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(email.headers["Auto-Submitted"]).toBe("auto-generated");
  });

  it("escapes the course title in HTML", () => {
    const email = renderSeatOpenEmail(
      origin,
      ref,
      { open: 3, total: 120, waitlist: null, asOf: null },
      stop,
    );
    expect(email.subject).toBe("3 seats opened in CMSC351 0101");
    expect(email.html).toContain("Algorithms &lt;&amp; friends&gt;");
    expect(email.html).not.toContain("<& friends>");
    expect(email.html).toContain(`href="${origin}/settings#watching"`);
    expect(email.text).not.toContain("Waitlist");
  });

  it("leaves the one-click headers out without a signed link", () => {
    const email = renderSeatOpenEmail(
      origin,
      ref,
      { open: 1, total: 120, waitlist: null, asOf: null },
      null,
    );
    expect(email.headers).not.toHaveProperty("List-Unsubscribe");
    expect(email.headers).not.toHaveProperty("List-Unsubscribe-Post");
  });
});

describe("the seats-run email (V2.md §6.7)", () => {
  const other: SectionRef = {
    ...ref,
    courseCode: "MATH240",
    sectionCode: "0203",
    title: "Linear Algebra",
  };
  const off = `${origin}/api/notifications/email-off?u=tstudent&t=seat-open&k=abc`;

  it("lists every section with its counts and links, in one email", () => {
    const email = renderSeatsOpenEmail(
      origin,
      [
        { ref, seats: { open: 2, total: 120, waitlist: null, asOf: null } },
        { ref: other, seats: { open: 1, total: 40, waitlist: 3, asOf: null } },
      ],
      off,
    );
    expect(email.subject).toBe("Seats opened in 2 sections you're watching");
    expect(email.text).toContain("CMSC351 0101: 2 of 120 open");
    expect(email.text).toContain("MATH240 0203: 1 of 40 open");
    expect(email.text).toContain(
      `${origin}/schedule/course/MATH240?term=202701`,
    );
    expect(email.text).toContain(
      "https://app.testudo.umd.edu/soc/202701/MATH/MATH240",
    );
    expect(email.html).toContain(
      `href="${origin}/schedule/course/CMSC351?term=202701"`,
    );
    expect(email.html).not.toContain("<& friends>");
    expect(email.headers["List-Unsubscribe"]).toBe(`<${off}>`);
    expect(renderSeatsOpenEmail(origin, [], null).headers).not.toHaveProperty(
      "List-Unsubscribe",
    );
  });
});
