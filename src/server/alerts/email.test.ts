import { describe, expect, it } from "vitest";
import {
  renderAlreadyWatchingEmail,
  renderConfirmEmail,
  renderSeatOpenEmail,
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
const token = "t".repeat(43);

describe("alert emails", () => {
  it("confirmation: a plain-text link, an escaped HTML button, no unsubscribe header", () => {
    const email = renderConfirmEmail(origin, ref, token);
    expect(email.subject).toBe("Confirm your seat alert for CMSC351 0101");
    expect(email.text).toContain(`${origin}/alerts/confirm?token=${token}`);
    expect(email.html).toContain(
      `href="${origin}/alerts/confirm?token=${token}"`,
    );
    expect(email.html).toContain("Algorithms &lt;&amp; friends&gt;");
    expect(email.html).not.toContain("<& friends>");
    expect(email.headers).not.toHaveProperty("List-Unsubscribe");
  });

  it("seat open: counts, an as-of time in Eastern, links, and List-Unsubscribe without one-click", () => {
    const email = renderSeatOpenEmail(
      origin,
      ref,
      { open: 1, total: 120, waitlist: 4, asOf: "2026-09-25T02:30:00.000Z" },
      token,
    );
    expect(email.subject).toBe("A seat opened in CMSC351 0101");
    expect(email.text).toContain("Seats: 1 of 120 open");
    expect(email.text).toContain("Waitlist: 4");
    expect(email.text).toContain("As of: Sep 24, 10:30 PM ET");
    expect(email.text).toContain(
      `${origin}/schedule?term=202701&course=CMSC351`,
    );
    expect(email.text).toContain(
      "https://app.testudo.umd.edu/soc/202701/CMSC/CMSC351",
    );
    expect(email.headers["List-Unsubscribe"]).toBe(
      `<${origin}/alerts/unsubscribe?token=${token}>`,
    );
    expect(email.headers).not.toHaveProperty("List-Unsubscribe-Post");
    expect(email.headers["Auto-Submitted"]).toBe("auto-generated");
  });

  it("already watching: says so and offers the way out", () => {
    const email = renderAlreadyWatchingEmail(origin, ref, token);
    expect(email.subject).toBe("You're already watching CMSC351 0101");
    expect(email.text).toContain(`${origin}/alerts/unsubscribe?token=${token}`);
  });
});
