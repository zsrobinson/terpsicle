// The seat-watch e2e's server (e2e/seat-watches.spec.ts): the real /api
// router and notifySeatChanges over local D1 (real migrations) and R2 (the
// mock catalog), with the flag on, test-mode sign-in, and an EMAIL binding
// that keeps what it's given. Test-only hooks live here and nowhere in the
// deployed Worker.
import { buildMockDataFiles, mockSeats } from "~/fixtures";
import { notifySeatChanges } from "~/server/alerts/notify";
import { type ApiEnv, handleApi } from "~/server/api/router";

interface HarnessEnv {
  DB: D1Database;
  DATA: R2Bucket;
  /** Account keys: sync needs them (docs/DATA.md §7.7). */
  USER_KEYS: R2Bucket;
  /** This checkout's id (scripts/e2e-checkout.ts), set by the launcher. */
  CHECKOUT_ID?: string;
}

type Sent = {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
};

// One isolate serves the whole run (wrangler dev), so this outlives requests.
const sent: Sent[] = [];

const email = {
  send: async (message: Sent) => {
    sent.push(message);
    return { messageId: `e2e-${sent.length}@terpsicle.com` };
  },
} as unknown as SendEmail;

function apiEnv(env: HarnessEnv): ApiEnv {
  return {
    DB: env.DB,
    DATA: env.DATA,
    USER_KEYS: env.USER_KEYS,
    EMAIL: email,
    SEAT_ALERTS_ENABLED: "true",
    // Sign in as a test person (loopback hosts only, docs/AUTH.md).
    AUTH_TEST_MODE: "true",
    // Moderation isn't part of this harness.
    AI: { run: async () => ({}) } as unknown as Ai,
  };
}

export default {
  async fetch(request: Request, env: HarnessEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);
    // Playwright reuses a running harness only if it's this checkout's.
    if (url.pathname.startsWith("/__checkout/"))
      return new Response(null, {
        status:
          env.CHECKOUT_ID && url.pathname === `/__checkout/${env.CHECKOUT_ID}`
            ? 200
            : 404,
      });
    if (url.pathname === "/__test/seed") {
      for (const [key, bytes] of await buildMockDataFiles())
        if (key.startsWith("catalog/")) await env.DATA.put(key, bytes);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/__test/reset") {
      // A fresh start for a rerun against a reused harness.
      sent.length = 0;
      await env.DB.batch(
        ["seat_watches", "seat_alert_sends", "counters"].map((t) =>
          env.DB.prepare(`DELETE FROM ${t}`),
        ),
      );
      return Response.json({ ok: true });
    }
    if (url.pathname === "/__test/emails") {
      const to = url.searchParams.get("to");
      return Response.json(to ? sent.filter((m) => m.to === to) : sent);
    }
    if (url.pathname === "/__test/reopen") {
      // A seats run where this section goes from full to `open` seats.
      const { sectionKey, open } = (await request.json()) as {
        sectionKey: string;
        open: number;
      };
      const before = mockSeats;
      const total = before.seats[sectionKey]?.[1] ?? open;
      const after = {
        ...before,
        asOf: new Date().toISOString(),
        seats: { ...before.seats, [sectionKey]: [open, total, 0, null] },
      } satisfies typeof mockSeats;
      const result = await notifySeatChanges(apiEnv(env), before, after, {
        now: new Date(),
      });
      return Response.json(result);
    }
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, apiEnv(env), ctx);
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<HarnessEnv>;
