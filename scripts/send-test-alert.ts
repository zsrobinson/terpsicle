// Sends the real seat-alert templates to one address through Cloudflare
// Email Service's REST API (same sender, same content as the Worker), to
// check deliverability before SEAT_ALERTS_ENABLED turns on. Links carry
// throwaway tokens, so they open the "link doesn't work" pages.
// Needs CLOUDFLARE_API_TOKEN (Email Sending permission) and CLOUDFLARE_ACCOUNT_ID.
//
//   pnpm tsx scripts/send-test-alert.ts me@example.com
import { randomBytes } from "node:crypto";
import {
  ALERTS_FROM,
  type RenderedEmail,
  renderConfirmEmail,
  renderSeatOpenEmail,
  type SectionRef,
} from "../src/server/alerts/email";
import { isMain } from "./lib/source-files";

const ORIGIN = "https://terpsicle.com";
const token = () => randomBytes(32).toString("base64url");

async function send(to: string, email: RenderedEmail) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/email/sending/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        // REST names the field `address`; the Workers binding calls it `email`.
        from: { address: ALERTS_FROM.email, name: ALERTS_FROM.name },
        subject: `[Test] ${email.subject}`,
        text: email.text,
        html: email.html,
        headers: email.headers,
      }),
    },
  );
  console.log(`${email.subject} → HTTP ${response.status}`);
  console.log(JSON.stringify(await response.json(), null, 2));
}

if (isMain(import.meta.url)) {
  const to = process.argv[2];
  if (!to) throw new Error("Usage: send-test-alert.ts <address>");
  const ref: SectionRef = {
    termId: process.env.TERM_ID ?? "",
    termName: "Spring 2027",
    courseCode: "CMSC351",
    sectionCode: "0101",
    title: "Algorithms",
  };
  if (!ref.termId) throw new Error("Set TERM_ID to the term the sample names.");
  await send(to, renderConfirmEmail(ORIGIN, ref, token()));
  await send(
    to,
    renderSeatOpenEmail(
      ORIGIN,
      ref,
      { open: 3, total: 120, waitlist: 11, asOf: new Date().toISOString() },
      token(),
    ),
  );
}
