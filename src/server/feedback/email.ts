// The one email feedback sends: a short note when the owner marks someone's
// report Fixed, only when they turned on "You can reply by email". From the
// same address as seat alerts.
import type { FeedbackKind, FeedbackProduct } from "~/core/schema/feedback";
import { layout, type RenderedEmail } from "../alerts/email";

const PRODUCT_NAMES: Readonly<Record<FeedbackProduct, string>> = {
  schedule: "Schedule",
  reviews: "Reviews",
  chat: "Chat",
  plan: "Plan",
  todo: "Todo",
  site: "Terpsicle",
  settings: "Settings",
  admin: "the admin panel",
};

/** Their own words, cut short, to remind them which report this was. */
function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 159)}…` : flat;
}

export function renderFixedEmail(
  origin: string,
  item: { kind: FeedbackKind; product: FeedbackProduct; text: string },
): RenderedEmail {
  const where = PRODUCT_NAMES[item.product];
  const idea = item.kind === "idea";
  const subject = idea
    ? "Your idea is in Terpsicle"
    : "We fixed what you reported";
  const intro = idea
    ? `Thanks for your suggestion for ${where}. It's in Terpsicle now.`
    : `Thanks for telling us about a problem in ${where}. It's fixed now.`;
  const quote = `You wrote: “${excerpt(item.text)}”`;
  const after = "Reload Terpsicle to get the latest version.";
  return {
    subject,
    text: `${[intro, "", quote, "", after, "", `Terpsicle · ${origin}`].join("\n")}\n`,
    html: layout(
      intro,
      [
        { kind: "p", text: intro },
        { kind: "muted", text: quote },
        { kind: "button", text: "Open Terpsicle", href: origin },
      ],
      [
        {
          kind: "muted",
          text: "You asked us to reply when you sent feedback. We won't email you about it again.",
        },
      ],
    ),
    headers: { "Auto-Submitted": "auto-generated" },
  };
}
