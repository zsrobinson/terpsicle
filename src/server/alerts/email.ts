// Seat-alert emails: plain text plus simple HTML that reads well in every
// client (tables, inline styles, no images). Pure, so the test-send script
// renders exactly what the Worker sends.

import { SCHEDULE_PATH } from "~/core/site";

export const ALERTS_FROM = {
  email: "alerts@terpsicle.com",
  name: "Terpsicle",
} as const;

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}

export interface SectionRef {
  termId: string;
  termName: string;
  courseCode: string;
  sectionCode: string;
  title: string;
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** The scheduler URL that opens this course in this term (it reads `term` and `course`). */
export function courseUrl(origin: string, ref: SectionRef): string {
  const params = new URLSearchParams({
    term: ref.termId,
    course: ref.courseCode,
  });
  return `${origin}${SCHEDULE_PATH}?${params}`;
}

export const confirmUrl = (origin: string, token: string) =>
  `${origin}/alerts/confirm?token=${encodeURIComponent(token)}`;

export const unsubscribeUrl = (origin: string, token: string) =>
  `${origin}/alerts/unsubscribe?token=${encodeURIComponent(token)}`;

const testudoUrl = (ref: SectionRef) =>
  `https://app.testudo.umd.edu/soc/${ref.termId}/${ref.courseCode.slice(0, 4)}/${ref.courseCode}`;

const label = (ref: SectionRef) => `${ref.courseCode} ${ref.sectionCode}`;

type Block =
  | { kind: "p"; text: string }
  | { kind: "muted"; text: string }
  | { kind: "button"; text: string; href: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "facts"; rows: [string, string][] };

function layout(preheader: string, blocks: Block[], footer: Block[]): string {
  const font =
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const render = (b: Block): string => {
    switch (b.kind) {
      case "p":
        return `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#18181b">${escapeHtml(b.text)}</p>`;
      case "muted":
        return `<p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#6b6b76">${escapeHtml(b.text)}</p>`;
      case "button":
        return `<p style="margin:4px 0 18px"><a href="${escapeHtml(b.href)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 16px;border-radius:6px">${escapeHtml(b.text)}</a></p>`;
      case "link":
        return `<p style="margin:0 0 10px;font-size:13px;line-height:1.5"><a href="${escapeHtml(b.href)}" style="color:#6b6b76">${escapeHtml(b.text)}</a></p>`;
      case "facts":
        return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e6e6ea;border-radius:6px;width:100%">${b.rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding:8px 12px;font-size:13px;color:#6b6b76;width:110px">${escapeHtml(k)}</td><td style="padding:8px 12px;font-size:14px;color:#18181b;font-family:ui-monospace,Menlo,monospace">${escapeHtml(v)}</td></tr>`,
          )
          .join("")}</table>`;
    }
  };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Terpsicle</title></head>
<body style="margin:0;padding:0;background:#f7f7f9;font-family:${font}">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e6e6ea;border-radius:8px">
<tr><td style="padding:20px 24px 4px"><span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:#e21833;vertical-align:-2px"></span> <span style="font-size:14px;font-weight:600;color:#18181b;letter-spacing:-0.01em">terpsicle</span></td></tr>
<tr><td style="padding:16px 24px 8px">${blocks.map(render).join("")}</td></tr>
<tr><td style="padding:12px 24px 20px;border-top:1px solid #e6e6ea">${footer.map(render).join("")}</td></tr>
</table></td></tr></table></body></html>`;
}

function text(lines: (string | null)[]): string {
  return `${lines.filter((l) => l !== null).join("\n")}\n`;
}

export function renderConfirmEmail(
  origin: string,
  ref: SectionRef,
  token: string,
): RenderedEmail {
  const url = confirmUrl(origin, token);
  const subject = `Confirm your seat alert for ${label(ref)}`;
  const intro = `Confirm, and we'll email you when a seat opens in ${label(ref)} (${ref.title}), ${ref.termName}.`;
  return {
    subject,
    text: text([
      intro,
      "",
      `Confirm: ${url}`,
      "",
      "The link works for 48 hours. If you didn't ask for this, ignore this email; nothing happens unless you confirm.",
      "",
      "Terpsicle · https://terpsicle.com",
    ]),
    html: layout(
      intro,
      [
        { kind: "p", text: intro },
        { kind: "button", text: "Confirm seat alert", href: url },
        { kind: "muted", text: "The link works for 48 hours." },
      ],
      [
        {
          kind: "muted",
          text: "If you didn't ask for this, ignore this email; nothing happens unless you confirm.",
        },
      ],
    ),
    headers: { "Auto-Submitted": "auto-generated" },
  };
}

export function renderAlreadyWatchingEmail(
  origin: string,
  ref: SectionRef,
  manageToken: string,
): RenderedEmail {
  const stop = unsubscribeUrl(origin, manageToken);
  const intro = `You're already watching ${label(ref)} (${ref.title}), ${ref.termName}. We'll email you when a seat opens.`;
  return {
    subject: `You're already watching ${label(ref)}`,
    text: text([
      intro,
      "",
      `Open in Terpsicle: ${courseUrl(origin, ref)}`,
      `Stop these emails: ${stop}`,
      "",
      "Terpsicle · https://terpsicle.com",
    ]),
    html: layout(
      intro,
      [
        { kind: "p", text: intro },
        {
          kind: "button",
          text: `Open ${ref.courseCode} in Terpsicle`,
          href: courseUrl(origin, ref),
        },
      ],
      [{ kind: "link", text: "Stop emails for this section", href: stop }],
    ),
    headers: {
      "Auto-Submitted": "auto-generated",
      "List-Unsubscribe": `<${stop}>`,
    },
  };
}

export interface SeatCountsForEmail {
  open: number;
  total: number;
  waitlist: number | null;
  /** Testudo's "as of" time, if known. */
  asOf: string | null;
}

const EASTERN = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function renderSeatOpenEmail(
  origin: string,
  ref: SectionRef,
  seats: SeatCountsForEmail,
  manageToken: string,
): RenderedEmail {
  const stop = unsubscribeUrl(origin, manageToken);
  const open = `${seats.open} of ${seats.total} open`;
  const seatWord = seats.open === 1 ? "A seat" : `${seats.open} seats`;
  const intro = `${seatWord} opened in ${label(ref)} (${ref.title}), ${ref.termName}. Register on Testudo soon; seats go fast.`;
  const facts: [string, string][] = [
    ["Section", label(ref)],
    ["Seats", open],
  ];
  if (seats.waitlist) facts.push(["Waitlist", String(seats.waitlist)]);
  if (seats.asOf)
    facts.push(["As of", `${EASTERN.format(new Date(seats.asOf))} ET`]);
  return {
    subject: `${seatWord} opened in ${label(ref)}`,
    text: text([
      intro,
      "",
      ...facts.map(([k, v]) => `${k}: ${v}`),
      "",
      `Open in Terpsicle: ${courseUrl(origin, ref)}`,
      `Testudo: ${testudoUrl(ref)}`,
      "",
      `Stop alerts for ${label(ref)}: ${stop}`,
      "Terpsicle · https://terpsicle.com",
    ]),
    html: layout(
      intro,
      [
        { kind: "p", text: intro },
        { kind: "facts", rows: facts },
        {
          kind: "button",
          text: `Open ${ref.courseCode} in Terpsicle`,
          href: courseUrl(origin, ref),
        },
        { kind: "link", text: "See it on Testudo", href: testudoUrl(ref) },
      ],
      [
        {
          kind: "muted",
          text: "You asked Terpsicle to email you when a seat opens in this section.",
        },
        { kind: "link", text: `Stop alerts for ${label(ref)}`, href: stop },
      ],
    ),
    headers: {
      "Auto-Submitted": "auto-generated",
      "List-Unsubscribe": `<${stop}>`,
    },
  };
}
