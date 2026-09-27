// One path for every seat-alert email: claim each section's dedupe key,
// send one email through the Email Service binding, record the outcome in
// `seat_alert_sends` (a row per section, so the daily cap counts sections
// whether they came alone or in one seats run's email).
import { ALERTS_FROM, type RenderedEmail } from "./email";
import { claimSend, finishSend } from "./store";

export interface SendArgs {
  to: string;
  userId: string;
  /** The sections the email is about, each with its own dedupe key. */
  sections: readonly {
    termId: string;
    sectionKey: string;
    dedupeKey: string;
  }[];
  email: RenderedEmail;
  now: Date;
}

/** True when the email was handed to Email Service; false for a duplicate or a failure. */
export async function sendAlertEmail(
  env: { DB: D1Database; EMAIL: SendEmail; EMAIL_SUBJECT_PREFIX?: string },
  args: SendArgs,
): Promise<boolean> {
  const claimed: number[] = [];
  for (const section of args.sections) {
    const id = await claimSend(env.DB, {
      userId: args.userId,
      termId: section.termId,
      sectionKey: section.sectionKey,
      dedupeKey: section.dedupeKey,
      sentAt: args.now.toISOString(),
    });
    if (id !== null) claimed.push(id);
  }
  if (claimed.length === 0) return false;
  const finish = (outcome: Parameters<typeof finishSend>[2]) =>
    Promise.all(claimed.map((id) => finishSend(env.DB, id, outcome)));
  try {
    const result = await env.EMAIL.send({
      to: args.to,
      from: ALERTS_FROM,
      subject: `${env.EMAIL_SUBJECT_PREFIX ?? ""}${args.email.subject}`,
      text: args.email.text,
      html: args.email.html,
      headers: args.email.headers,
    });
    await finish({ status: "sent", providerId: result.messageId });
    return true;
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    console.warn({
      email: "send failed",
      kind: "seat-open",
      code: String(code ?? ""),
      error: String(error),
    });
    await finish({ status: "failed" });
    return false;
  }
}
