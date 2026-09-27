// The daily chat digest email (V2.md §6.6): plain text plus the same simple
// HTML as seat alerts. Pure, so a test renders exactly what the job sends.
import { chatDigestSubject } from "~/core/chat";
import { type EmailBlock, layout, type RenderedEmail } from "../alerts/email";

/** Lines per digest, at most. */
export const DIGEST_LINES_MAX = 20;

export interface DigestLine {
  /** "Hannah Lee replied in CMSC131 · 0303: see you there". */
  text: string;
  /** Where it opens: `/chat?…`, on our origin. */
  path: string;
}

/**
 * `offUrl` is the signed one-click link (RFC 8058) that turns the digest
 * off; null leaves the one-click headers out.
 */
export function renderChatDigestEmail(
  origin: string,
  lines: readonly DigestLine[],
  offUrl: string | null,
): RenderedEmail {
  const shown = lines.slice(0, DIGEST_LINES_MAX);
  const more = lines.length - shown.length;
  const subject = chatDigestSubject(lines.length);
  const intro =
    lines.length === 1
      ? "A classmate mentioned you or replied to you in the last day, and you haven't read it yet."
      : "Classmates mentioned you or replied to you in the last day, and you haven't read these yet.";
  const settings = `${origin}/settings/notifications`;
  const headers: Record<string, string> = {
    "Auto-Submitted": "auto-generated",
  };
  if (offUrl) {
    headers["List-Unsubscribe"] = `<${offUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  const moreWords = more > 0 ? `And ${more} more in Terpsicle Chat.` : null;
  const blocks: EmailBlock[] = [
    { kind: "p", text: intro },
    ...shown.map(
      (line): EmailBlock => ({
        kind: "link",
        text: line.text,
        href: `${origin}${line.path}`,
      }),
    ),
    ...(moreWords ? [{ kind: "muted" as const, text: moreWords }] : []),
    { kind: "button", text: "Open Chat", href: `${origin}/chat` },
  ];
  return {
    subject,
    text: `${[
      intro,
      "",
      ...shown.flatMap((line) => [line.text, `${origin}${line.path}`, ""]),
      ...(moreWords ? [moreWords, ""] : []),
      `This is your daily chat digest. Turn it off in your notification settings: ${settings}`,
      "Terpsicle · https://terpsicle.com",
    ].join("\n")}\n`,
    html: layout(intro, blocks, [
      { kind: "muted", text: "This is your daily chat digest on Terpsicle." },
      { kind: "link", text: "Turn it off in your settings", href: settings },
    ]),
    headers,
  };
}
