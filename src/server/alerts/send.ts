// One path for every alert email: claim the dedupe key, send through the
// Email Service binding, record the outcome in `email_sends`.
import type { EmailKind } from "~/core/schema";
import { ALERTS_FROM, type RenderedEmail } from "./email";
import { claimSend, finishSend } from "./store";

export interface SendArgs {
  to: string;
  subscriptionId: string;
  kind: EmailKind;
  dedupeKey: string;
  email: RenderedEmail;
  now: Date;
}

/** True when the email was handed to Email Service; false for a duplicate or a failure. */
export async function sendAlertEmail(
  env: { DB: D1Database; EMAIL: SendEmail },
  args: SendArgs,
): Promise<boolean> {
  const id = await claimSend(env.DB, {
    email: args.to,
    subscriptionId: args.subscriptionId,
    kind: args.kind,
    dedupeKey: args.dedupeKey,
    sentAt: args.now.toISOString(),
  });
  if (id === null) return false;
  try {
    const result = await env.EMAIL.send({
      to: args.to,
      from: ALERTS_FROM,
      subject: args.email.subject,
      text: args.email.text,
      html: args.email.html,
      headers: args.email.headers,
    });
    await finishSend(env.DB, id, {
      status: "sent",
      providerId: result.messageId,
    });
    return true;
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    console.warn({
      email: "send failed",
      kind: args.kind,
      code: String(code ?? ""),
      error: String(error),
    });
    await finishSend(env.DB, id, { status: "failed" });
    return false;
  }
}
