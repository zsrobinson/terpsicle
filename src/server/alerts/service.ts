// Seat-alert endpoints: subscribe, confirm, lookup, unsubscribe, status
// (SPEC §3.12, DATA.md §7.1). The flag and per-IP limits are checked by the
// router; these functions assume both passed.
import {
  type ConfirmInput,
  type ConfirmResult,
  type LookupResult,
  type ManageInput,
  ManifestSchema,
  manifestKey,
  SeatsFileSchema,
  type StatusInput,
  type StatusResult,
  type SubscribeInput,
  type SubscribeResult,
  seatsKey,
  type UnsubscribeResult,
} from "~/core/schema";
import { captureServerEvent } from "../analytics";
import { randomToken, sha256Hex } from "../crypto";
import { catalogReader, type WatchedSection } from "./catalog";
import {
  renderAlreadyWatchingEmail,
  renderConfirmEmail,
  type SectionRef,
} from "./email";
import { sendAlertEmail } from "./send";
import {
  activate,
  countSends,
  deactivate,
  findSubscription,
  findToken,
  getSubscription,
  insertSubscription,
  insertToken,
  lastSendAt,
  setPending,
  spendToken,
} from "./store";

export interface AlertsEnv {
  DB: D1Database;
  DATA: R2Bucket;
  /** Absent on previews: they must never email anyone. */
  EMAIL?: SendEmail;
  SEAT_ALERTS_ENABLED?: string;
  POSTHOG_TOKEN?: string;
}

export interface AlertsContext {
  now: Date;
  /** Where links in emails point: the app that made the request. */
  origin: string;
  waitUntil?: (promise: Promise<unknown>) => void;
}

/** Limits (DATA.md §7.1). */
export const ALERT_LIMITS = {
  confirmTtlMs: 48 * 3_600_000,
  /** Confirmation and "already watching" emails per address per day. */
  signupEmailsPerAddressPerDay: 5,
  /** Minimum gap between signup emails for one subscription. */
  signupEmailGapMs: 10 * 60_000,
  /** Seat-open emails per address per day. */
  alertsPerAddressPerDay: 20,
  /** Minimum gap between seat-open emails for one subscription. */
  alertCooldownMs: 30 * 60_000,
} as const;

export function alertsEnabled(
  env: AlertsEnv,
): env is AlertsEnv & { EMAIL: SendEmail } {
  return env.SEAT_ALERTS_ENABLED === "true" && env.EMAIL !== undefined;
}

export function sectionRef(found: WatchedSection): SectionRef {
  return {
    termId: found.term.id,
    termName: found.term.name,
    courseCode: found.course.code,
    sectionCode: found.section.code,
    title: found.course.title,
  };
}

/** Mints a token, stores only its hash, returns the token. */
export async function issueToken(
  db: D1Database,
  subscriptionId: string,
  purpose: "confirm" | "manage",
  now: Date,
): Promise<{ token: string; hash: string }> {
  const token = randomToken(32);
  const hash = await sha256Hex(token);
  await insertToken(db, {
    token_hash: hash,
    subscription_id: subscriptionId,
    purpose,
    created_at: now.toISOString(),
    expires_at:
      purpose === "confirm"
        ? new Date(now.getTime() + ALERT_LIMITS.confirmTtlMs).toISOString()
        : null,
    used_at: null,
  });
  return { token, hash };
}

/** Open seats for a section right now, from the published seats file. */
export async function currentOpenSeats(
  bucket: R2Bucket,
  termId: string,
  sectionKey: string,
): Promise<number | null> {
  const manifestObject = await bucket.get(manifestKey(termId));
  const manifest = manifestObject
    ? ManifestSchema.safeParse(await manifestObject.json())
    : null;
  if (!manifest?.success || !manifest.data.seats) return null;
  const seatsObject = await bucket.get(
    seatsKey(termId, manifest.data.seats.hash),
  );
  const seats = seatsObject
    ? SeatsFileSchema.safeParse(await seatsObject.json())
    : null;
  return seats?.success ? (seats.data.seats[sectionKey]?.[0] ?? null) : null;
}

export async function subscribe(
  env: AlertsEnv,
  input: SubscribeInput,
  ctx: AlertsContext,
): Promise<SubscribeResult> {
  if (!alertsEnabled(env)) return { status: "unavailable" };
  const found = await catalogReader(env.DATA)(input.termId, input.sectionKey);
  if (found?.term.status !== "active") return { status: "unknown-section" };

  const email = input.email.trim().toLowerCase();
  const nowIso = ctx.now.toISOString();
  let subscription = await findSubscription(
    env.DB,
    email,
    input.termId,
    input.sectionKey,
  );
  if (!subscription) {
    await insertSubscription(env.DB, {
      id: randomToken(16),
      email,
      term_id: input.termId,
      section_key: input.sectionKey,
      created_at: nowIso,
    }).catch(() => undefined); // A concurrent request inserted it first.
    subscription = await findSubscription(
      env.DB,
      email,
      input.termId,
      input.sectionKey,
    );
    if (!subscription) throw new Error("subscription insert failed");
  } else if (subscription.status === "unsubscribed") {
    await setPending(env.DB, subscription.id);
  }
  const watching = subscription.status === "active";
  const kind = watching ? "already-watching" : "confirm";

  // Per-address limits skip the email but never change the answer, so the
  // API can't be used to learn about someone's address.
  const since = new Date(ctx.now.getTime() - 86_400_000).toISOString();
  const sentToday = await countSends(
    env.DB,
    email,
    ["confirm", "already-watching"],
    since,
  );
  const last = await lastSendAt(env.DB, subscription.id, [kind]);
  const tooSoon =
    last !== null &&
    ctx.now.getTime() - Date.parse(last) < ALERT_LIMITS.signupEmailGapMs;
  let outcome: "confirm-sent" | "already-watching" | "not-sent" = "not-sent";
  if (sentToday < ALERT_LIMITS.signupEmailsPerAddressPerDay && !tooSoon) {
    const ref = sectionRef(found);
    const issued = await issueToken(
      env.DB,
      subscription.id,
      watching ? "manage" : "confirm",
      ctx.now,
    );
    const rendered = watching
      ? renderAlreadyWatchingEmail(ctx.origin, ref, issued.token)
      : renderConfirmEmail(ctx.origin, ref, issued.token);
    const sent = await sendAlertEmail(env, {
      to: email,
      subscriptionId: subscription.id,
      kind,
      dedupeKey: `${kind}:${subscription.id}:${issued.hash.slice(0, 16)}`,
      email: rendered,
      now: ctx.now,
    });
    if (sent) outcome = watching ? "already-watching" : "confirm-sent";
  }
  ctx.waitUntil?.(captureServerEvent(env, "alert_subscribed", { outcome }));
  return { status: "check-email" };
}

export async function confirm(
  env: AlertsEnv,
  input: ConfirmInput,
  ctx: AlertsContext,
): Promise<ConfirmResult> {
  const hash = await sha256Hex(input.token);
  const token = await findToken(env.DB, hash, "confirm");
  const subscription = token
    ? await getSubscription(env.DB, token.subscription_id)
    : null;
  if (!token || !subscription) return { status: "invalid-token" };
  const place = {
    termId: subscription.term_id,
    sectionKey: subscription.section_key,
  };
  if (token.used_at !== null) {
    return subscription.status === "active"
      ? { status: "already-confirmed", ...place }
      : { status: "invalid-token" };
  }
  if (token.expires_at !== null && token.expires_at < ctx.now.toISOString()) {
    return { status: "invalid-token" };
  }
  if (!(await spendToken(env.DB, hash, ctx.now.toISOString()))) {
    return { status: "already-confirmed", ...place };
  }
  // Start from today's count, so only a reopening after now sends an email.
  const open = await currentOpenSeats(
    env.DATA,
    subscription.term_id,
    subscription.section_key,
  );
  await activate(env.DB, subscription.id, ctx.now.toISOString(), open);
  const manage = await issueToken(env.DB, subscription.id, "manage", ctx.now);
  ctx.waitUntil?.(
    captureServerEvent(env, "alert_confirmed", {
      termId: subscription.term_id,
    }),
  );
  return {
    status: "confirmed",
    ...place,
    subscriptionId: subscription.id,
    manageToken: manage.token,
  };
}

async function subscriptionForManageToken(env: AlertsEnv, token: string) {
  const row = await findToken(env.DB, await sha256Hex(token), "manage");
  return row ? getSubscription(env.DB, row.subscription_id) : null;
}

export async function lookup(
  env: AlertsEnv,
  input: ManageInput,
): Promise<LookupResult> {
  const subscription = await subscriptionForManageToken(env, input.token);
  if (!subscription) return { status: "invalid-token" };
  return {
    status: "found",
    termId: subscription.term_id,
    sectionKey: subscription.section_key,
    subscriptionStatus: subscription.status,
  };
}

export async function unsubscribe(
  env: AlertsEnv,
  input: ManageInput,
  ctx: AlertsContext,
): Promise<UnsubscribeResult> {
  const subscription = await subscriptionForManageToken(env, input.token);
  if (!subscription) return { status: "invalid-token" };
  if (subscription.status !== "unsubscribed") {
    await deactivate(env.DB, subscription.id, ctx.now.toISOString());
    ctx.waitUntil?.(
      captureServerEvent(env, "alert_unsubscribed", {
        termId: subscription.term_id,
      }),
    );
  }
  return {
    status: "unsubscribed",
    termId: subscription.term_id,
    sectionKey: subscription.section_key,
  };
}

export async function status(
  env: AlertsEnv,
  input: StatusInput,
): Promise<StatusResult> {
  if (!alertsEnabled(env)) return { status: "unavailable" };
  const items = await Promise.all(
    input.items.map(async (item) => {
      const token = await findToken(
        env.DB,
        await sha256Hex(item.manageToken),
        "manage",
      );
      const subscription =
        token && token.subscription_id === item.subscriptionId
          ? await getSubscription(env.DB, token.subscription_id)
          : null;
      return {
        subscriptionId: item.subscriptionId,
        status: subscription ? subscription.status : ("unknown" as const),
      };
    }),
  );
  return { status: "ok", items };
}
