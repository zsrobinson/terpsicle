import { describe, expect, it } from "vitest";
import { DIGEST_LINES_MAX, renderChatDigestEmail } from "./digest-email";

const ORIGIN = "https://terpsicle.com";
const line = (n: number) => ({
  text: `Hannah Lee mentioned you in CMSC131: message ${n}`,
  path: `/chat?term=202701&course=CMSC131&room=202701%3ACMSC131&n=${n}`,
});

describe("renderChatDigestEmail", () => {
  it("lists each unread one with its link, and turns off in one click", () => {
    const email = renderChatDigestEmail(
      ORIGIN,
      [line(1)],
      `${ORIGIN}/api/notifications/email-off?u=hlee&t=chat-digest&k=ab`,
    );
    expect(email.subject).toBe("1 unread in your class chats");
    expect(email.text).toContain(
      "A classmate mentioned you or replied to you in the last day",
    );
    expect(email.text).toContain(`${line(1).text}\n${ORIGIN}${line(1).path}`);
    expect(email.text).toContain(`${ORIGIN}/settings/notifications`);
    expect(email.html).toContain("message 1");
    expect(email.html).toContain(`href="${ORIGIN}/chat"`);
    expect(email.headers).toEqual({
      "Auto-Submitted": "auto-generated",
      "List-Unsubscribe": `<${ORIGIN}/api/notifications/email-off?u=hlee&t=chat-digest&k=ab>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("stops at 20 lines and says how many more", () => {
    const lines = Array.from({ length: 23 }, (_, i) => line(i + 1));
    const email = renderChatDigestEmail(ORIGIN, lines, null);
    expect(email.subject).toBe("23 unread in your class chats");
    expect(email.text).toContain(`message ${DIGEST_LINES_MAX}\n`);
    expect(email.text).not.toContain(`message ${DIGEST_LINES_MAX + 1}\n`);
    expect(email.text).toContain("And 3 more in Terpsicle Chat.");
    expect(email.html).toContain("And 3 more in Terpsicle Chat.");
    expect(email.headers).toEqual({ "Auto-Submitted": "auto-generated" });
  });

  it("escapes what classmates wrote in the HTML", () => {
    const email = renderChatDigestEmail(
      ORIGIN,
      [{ text: "Omar Ali replied in CMSC131: <b>hi</b> & bye", path: "/chat" }],
      null,
    );
    expect(email.html).toContain("&lt;b&gt;hi&lt;/b&gt; &amp; bye");
    expect(email.html).not.toContain("<b>hi</b>");
  });
});
