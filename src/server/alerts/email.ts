// The seat-alert email: plain text plus simple HTML that reads well in every
// client (tables, inline styles, no images). Pure, so the test-send script
// renders exactly what the Worker sends.

import { SCHEDULE_PATH } from "~/core/routing";

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

/** The scheduler URL that opens this course's details in this term. */
export function courseUrl(origin: string, ref: SectionRef): string {
  const params = new URLSearchParams({ term: ref.termId });
  return `${origin}${SCHEDULE_PATH}/course/${encodeURIComponent(ref.courseCode)}?${params}`;
}

/** Where people see and stop their watches. */
export const watchesUrl = (origin: string) => `${origin}/settings#watching`;

const testudoUrl = (ref: SectionRef) =>
  `https://app.testudo.umd.edu/soc/${ref.termId}/${ref.courseCode.slice(0, 4)}/${ref.courseCode}`;

const label = (ref: SectionRef) => `${ref.courseCode} ${ref.sectionCode}`;

export type EmailBlock = Block;
type Block =
  | { kind: "p"; text: string }
  | { kind: "muted"; text: string }
  | { kind: "button"; text: string; href: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "facts"; rows: [string, string][] };

export function layout(
  preheader: string,
  blocks: Block[],
  footer: Block[],
): string {
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

/**
 * `stopUrl` is the signed one-click link (RFC 8058) that stops this watch;
 * null leaves the one-click headers out (no key to sign with).
 */
export function renderSeatOpenEmail(
  origin: string,
  ref: SectionRef,
  seats: SeatCountsForEmail,
  stopUrl: string | null,
): RenderedEmail {
  const manage = watchesUrl(origin);
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
  const headers: Record<string, string> = {
    "Auto-Submitted": "auto-generated",
  };
  if (stopUrl) {
    headers["List-Unsubscribe"] = `<${stopUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
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
      `You're watching ${label(ref)} for a seat. See or stop your watches: ${manage}`,
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
          text: `You're watching ${label(ref)} for a seat on Terpsicle.`,
        },
        { kind: "link", text: "See or stop your watches", href: manage },
      ],
    ),
    headers,
  };
}

/** One section in a seats run's email. */
export interface OpenedSection {
  ref: SectionRef;
  seats: SeatCountsForEmail;
}

/**
 * One email for every watched section that opened in one seats run (V2.md
 * §6.7): "Seats opened in 3 sections you're watching", each with its
 * counts and links. A single section keeps `renderSeatOpenEmail`. One
 * header can't stop several watches, so `offUrl` is the signed
 * `notifications/email-off` link that turns seat emails off (pushes, the
 * inbox and the watches stay); null leaves the one-click headers out.
 */
export function renderSeatsOpenEmail(
  origin: string,
  sections: readonly OpenedSection[],
  offUrl: string | null,
): RenderedEmail {
  const manage = watchesUrl(origin);
  const labels = sections.map((s) => label(s.ref));
  const subject = `Seats opened in ${sections.length} sections you're watching`;
  const intro = `${subject}: ${labels.join(", ")}. Register on Testudo soon; seats go fast.`;
  const facts: [string, string][] = sections.map((s) => [
    label(s.ref),
    `${s.seats.open} of ${s.seats.total} open`,
  ]);
  const headers: Record<string, string> = {
    "Auto-Submitted": "auto-generated",
  };
  if (offUrl) {
    headers["List-Unsubscribe"] = `<${offUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return {
    subject,
    text: text([
      intro,
      "",
      ...facts.map(([k, v]) => `${k}: ${v}`),
      "",
      ...sections.flatMap((s) => [
        `${label(s.ref)} (${s.ref.title}) in Terpsicle: ${courseUrl(origin, s.ref)}`,
        `On Testudo: ${testudoUrl(s.ref)}`,
      ]),
      "",
      `You're watching these sections for a seat. See or stop your watches: ${manage}`,
      "Terpsicle · https://terpsicle.com",
    ]),
    html: layout(
      intro,
      [
        { kind: "p", text: intro },
        { kind: "facts", rows: facts },
        ...sections.flatMap((s): Block[] => [
          {
            kind: "link",
            text: `Open ${label(s.ref)} in Terpsicle`,
            href: courseUrl(origin, s.ref),
          },
          {
            kind: "link",
            text: `See ${label(s.ref)} on Testudo`,
            href: testudoUrl(s.ref),
          },
        ]),
      ],
      [
        {
          kind: "muted",
          text: "You're watching these sections for a seat on Terpsicle.",
        },
        { kind: "link", text: "See or stop your watches", href: manage },
      ],
    ),
    headers,
  };
}
