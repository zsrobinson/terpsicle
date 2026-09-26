import { describe, expect, it } from "vitest";
import { aSharePayload } from "~/fixtures";
import { SHARE_PARAM, shareUrl } from "../share";
import {
  MAX_PROPERTY_LENGTH,
  RECORDING_EVENT,
  type ScrubbableEvent,
  SHARE_LINK_PARAM,
  scrubEvent,
  scrubPath,
  scrubSearch,
  scrubUrl,
} from "./scrub";

const ORIGIN = "https://terpsicle.com";
const sharedLink = shareUrl(
  ORIGIN,
  aSharePayload({
    name: "Jane's spring",
    blocks: [{ label: "Therapy", days: ["Tu"], start: 900, end: 960 }],
  }),
);

function anEvent(
  properties: Record<string, unknown>,
  event = "$pageview",
): ScrubbableEvent {
  return { event, properties };
}

describe("scrubPath", () => {
  it("keeps chat paths as their route pattern", () => {
    expect(scrubPath("/chat")).toBe("/chat");
    expect(scrubPath("/chat/202608/CMSC131")).toBe("/chat/:term/:course");
    expect(scrubPath("/chat/202608/CMSC131/s-0101")).toBe(
      "/chat/:term/:course/:room",
    );
    expect(scrubPath("/chat/202608/CMSC131/s-0101/extra")).toBe(
      "/chat/:term/:course/:room/:param",
    );
  });

  it("leaves other paths alone", () => {
    expect(scrubPath("/schedule")).toBe("/schedule");
    expect(scrubPath("/reviews/instructors/abc")).toBe(
      "/reviews/instructors/abc",
    );
    expect(scrubPath("/chatter/x")).toBe("/chatter/x");
  });
});

describe("scrubSearch", () => {
  it("knows the share link's param", () => {
    expect(SHARE_LINK_PARAM).toBe(SHARE_PARAM);
  });

  it("keeps allowlisted params with short, plain values", () => {
    expect(scrubSearch("?tab=generate&term=202608&view=course")).toBe(
      "?tab=generate&term=202608&view=course",
    );
    expect(scrubSearch("?error=wrong-domain&return=%2Fchat")).toBe(
      "?error=wrong-domain",
    );
  });

  it("marks a share link without its plan", () => {
    expect(
      scrubSearch(
        "?plan=eJyrVkrNS0ktUrJSMjQwMFDSUcpMUbIyMjEyMKgFAF7xBaA&tab=search",
      ),
    ).toBe("?plan=shared&tab=search");
  });

  it("drops unknown params and free text in allowed ones", () => {
    expect(scrubSearch("?q=jane&m=abc123&course=CMSC131")).toBe("");
    expect(scrubSearch("?tab=my%20therapy%20notes")).toBe("");
    expect(scrubSearch(`?tab=${"a".repeat(33)}`)).toBe("");
    expect(scrubSearch("")).toBe("");
  });
});

describe("scrubUrl", () => {
  it("turns a real share link into plan=shared", () => {
    expect(sharedLink).toContain("?plan=");
    expect(scrubUrl(sharedLink)).toBe(`${ORIGIN}/schedule?plan=shared`);
  });

  it("scrubs chat rooms, drops hashes and credentials", () => {
    expect(scrubUrl(`${ORIGIN}/chat/202608/CMSC131/s-0101?m=xyz#end`)).toBe(
      `${ORIGIN}/chat/:term/:course/:room`,
    );
    expect(scrubUrl("https://user:pw@example.com/a?b=c#d")).toBe(
      "https://example.com/a",
    );
  });

  it("keeps relative URLs relative and leaves non-URLs alone", () => {
    expect(scrubUrl("/schedule?plan=abc&tab=courses")).toBe(
      "/schedule?plan=shared&tab=courses",
    );
    expect(scrubUrl("$direct")).toBe("$direct");
    expect(scrubUrl("")).toBe("");
  });
});

describe("scrubEvent", () => {
  it("scrubs every URL and path PostHog sends with a pageview", () => {
    const out = scrubEvent(
      anEvent({
        $current_url: sharedLink,
        $pathname: "/schedule",
        $referrer: `${ORIGIN}/chat/202608/CMSC131/s-0101`,
        $referring_domain: "terpsicle.com",
        $session_entry_url: sharedLink,
        $session_entry_referrer: "$direct",
        $prev_pageview_pathname: "/chat/202608/CMSC131",
        $web_vitals_LCP_event: { $current_url: sharedLink, value: 1200 },
        title: "Terpsicle",
      }),
    );
    expect(out?.properties).toEqual({
      $current_url: `${ORIGIN}/schedule?plan=shared`,
      $pathname: "/schedule",
      $referrer: `${ORIGIN}/chat/:term/:course/:room`,
      $referring_domain: "terpsicle.com",
      $session_entry_url: `${ORIGIN}/schedule?plan=shared`,
      $session_entry_referrer: "$direct",
      $prev_pageview_pathname: "/chat/:term/:course",
      $web_vitals_LCP_event: {
        $current_url: `${ORIGIN}/schedule?plan=shared`,
        value: 1200,
      },
      title: "Terpsicle",
    });
    expect(JSON.stringify(out)).not.toContain("Therapy");
  });

  it("scrubs $set and $set_once too", () => {
    const out = scrubEvent({
      ...anEvent({}),
      $set: { $current_url: sharedLink },
      $set_once: {
        $initial_current_url: sharedLink,
        $initial_pathname: "/chat/1/2",
      },
    });
    expect(out?.$set).toEqual({
      $current_url: `${ORIGIN}/schedule?plan=shared`,
    });
    expect(out?.$set_once).toEqual({
      $initial_current_url: `${ORIGIN}/schedule?plan=shared`,
      $initial_pathname: "/chat/:term/:course",
    });
  });

  it("drops a chat page's title, which names the course", () => {
    const out = scrubEvent(
      anEvent({
        $current_url: `${ORIGIN}/chat/202608/CMSC131`,
        title: "CMSC131 · Chat · Terpsicle",
      }),
    );
    expect(out?.properties).toEqual({
      $current_url: `${ORIGIN}/chat/:term/:course`,
    });
  });

  it("never lets session recording data out, from any page", () => {
    for (const path of ["/schedule", "/", "/reviews", "/settings", "/chat/1/2"])
      expect(
        scrubEvent(
          anEvent(
            { $current_url: `${ORIGIN}${path}`, $snapshot_data: [{ type: 4 }] },
            RECORDING_EVENT,
          ),
        ),
      ).toBeNull();
  });

  it("scrubs link hrefs in the clicked element's chain", () => {
    const out = scrubEvent(
      anEvent(
        {
          $elements_chain: `a.link:href="/schedule?plan=abc"attr__href="/chat/1/CMSC131/s-1"nth-child="1"text="Open"`,
        },
        "$autocapture",
      ),
    );
    expect(out?.properties.$elements_chain).toBe(
      `a.link:href="/schedule?plan=shared"attr__href="/chat/:term/:course/:room"nth-child="1"text="Open"`,
    );
  });

  describe("click events and data-private text", () => {
    const click = (properties: Record<string, unknown>) =>
      scrubEvent(anEvent(properties, "$autocapture"), {
        privateText: () => ["  Therapy ", "Jane  Doe", "x"],
      });

    it("removes text and attributes holding private text", () => {
      const out = click({
        $el_text: "Therapy Tu 3pm",
        $elements_chain: `button:attr__aria-label="Edit Therapy"nth-child="2"text="Therapy Tu 3pm";li.row:nth-child="1"`,
        $elements: [
          {
            tag_name: "button",
            $el_text: "Therapy",
            "attr__aria-label": "Edit therapy",
          },
        ],
      });
      expect(out?.properties).toEqual({
        $elements_chain: `button:nth-child="2";li.row:nth-child="1"`,
        $elements: [{ tag_name: "button" }],
      });
    });

    it("matches whole words, across spacing, ignoring case", () => {
      expect(click({ $el_text: "Signed in as jane doe" })?.properties).toEqual(
        {},
      );
      expect(
        click({ $el_text: "Therapy-adjacent" })?.properties.$el_text,
      ).toBeUndefined();
      expect(click({ $el_text: "Therapyish" })?.properties.$el_text).toBe(
        "Therapyish",
      );
      // One-character text ("x") is too short to mean anything.
      expect(click({ $el_text: "x marks" })?.properties.$el_text).toBe(
        "x marks",
      );
    });

    it("unescapes quotes in the chain before matching", () => {
      const out = scrubEvent(
        anEvent(
          { $elements_chain: `button:text="Edit \\"Gym\\""` },
          "$autocapture",
        ),
        { privateText: () => [`"Gym"`] },
      );
      expect(out?.properties.$elements_chain).toBe("button:");
    });

    it("never sends copied text", () => {
      const out = scrubEvent(
        anEvent({ $selected_content: "anything" }, "$copy_autocapture"),
      );
      expect(out?.properties).toEqual({});
    });

    it("leaves our own events' properties alone", () => {
      const out = scrubEvent(anEvent({ via: "Therapy" }, "block_created"), {
        privateText: () => ["Therapy"],
      });
      expect(out?.properties).toEqual({ via: "Therapy" });
    });
  });

  it("drops our own events that carry long text", () => {
    const long = "a".repeat(MAX_PROPERTY_LENGTH + 1);
    expect(scrubEvent(anEvent({ via: long }, "block_created"))).toBeNull();
    expect(scrubEvent(anEvent({ list: [long] }, "block_created"))).toBeNull();
    expect(
      scrubEvent(anEvent({ via: "a".repeat(MAX_PROPERTY_LENGTH) }, "x")),
    ).not.toBeNull();
    // PostHog's own properties are its business.
    expect(
      scrubEvent(anEvent({ $raw_user_agent: long, title: long }, "x")),
    ).not.toBeNull();
    expect(
      scrubEvent(anEvent({ $elements_chain: long }, "$autocapture")),
    ).not.toBeNull();
  });

  it("doesn't change the event it was given", () => {
    const event = anEvent({ $current_url: sharedLink });
    scrubEvent(event);
    expect(event.properties.$current_url).toBe(sharedLink);
  });
});
