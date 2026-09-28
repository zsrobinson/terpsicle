// The owner's alerts (docs/V2.md §6.7, §9.4): when moderation puts an item
// in front of the owner as urgent (chat's spam guard, a serious safety
// category, a reported threat), each admin gets an inbox row for it, a
// push and an email. At most one alert an hour: items held in between wait
// and arrive grouped, "Held for you: spam in 3 courses". The every-5-minutes
// cron runs this, so an alert lands within 5 minutes of the hold. An item
// the owner has already decided never alerts. Alerts carry the reason and
// the course, never the text or who wrote it.
import { z } from "zod";
import {
  ADMIN_URGENT_TAG,
  adminAlertDue,
  type HeldItem,
  heldLabel,
  heldReason,
  heldWords,
} from "~/core/notifications";
import {
  CourseCodeSchema,
  ModerationKindSchema,
  ModerationReasonSchema,
} from "~/core/schema";
import { layout, type RenderedEmail } from "../alerts/email";
import { adminIds } from "../auth/admin";
import {
  type NotifyEnv,
  type NotifyOptions,
  type NotifyResult,
  notify,
} from "../notifications/notify";

/** The queue, where an alert opens. */
export const ADMIN_QUEUE_PATH = "/admin";

/** Links in alert emails: crons have no request, so always production. */
const ALERTS_ORIGIN = "https://terpsicle.com";

/** Open urgent items one run looks at; the queue is never near this. */
const OPEN_URGENT_MAX = 200;

const OpenItemSchema = z.object({
  id: z.string(),
  surface: ModerationKindSchema,
  labels: z.string(),
  course: z.string().nullable(),
});

/** The open urgent items, oldest first, as their alert names them. */
async function openUrgentItems(
  db: D1Database,
): Promise<{ id: string; item: HeldItem }[]> {
  const { results } = await db
    .prepare(
      `SELECT id, surface, labels, json_extract(snapshot, '$.course') AS course
       FROM moderation_queue WHERE status = 'open' AND urgent = 1
       ORDER BY created_at ASC LIMIT ?1`,
    )
    .bind(OPEN_URGENT_MAX)
    .all();
  return results.flatMap((r) => {
    const row = OpenItemSchema.safeParse(r);
    if (!row.success) return [];
    let reasons: z.infer<typeof ModerationReasonSchema>[] = [];
    try {
      const parsed = z
        .array(ModerationReasonSchema)
        .safeParse(JSON.parse(row.data.labels));
      if (parsed.success) reasons = parsed.data;
    } catch {
      // Unreadable labels: still urgent, "something urgent".
    }
    const course = CourseCodeSchema.safeParse(row.data.course);
    return [
      {
        id: row.data.id,
        item: {
          reason: heldReason(reasons),
          surface: row.data.surface,
          course: course.success ? course.data : null,
        },
      },
    ];
  });
}

/** The alert email: what's held and where, and the queue. No text, no author. */
export function renderHeldEmail(
  origin: string,
  items: readonly HeldItem[],
): RenderedEmail {
  const words = heldWords(items);
  const queue = `${origin}${ADMIN_QUEUE_PATH}`;
  const intro =
    items.length === 1
      ? "Moderation held an urgent item for you."
      : `Moderation held ${items.length} urgent items for you.`;
  return {
    subject: words.title,
    text: `${[
      intro,
      words.body,
      "",
      `Open the queue: ${queue}`,
      "",
      "You get this as an admin of Terpsicle, at most once an hour.",
    ].join("\n")}\n`,
    html: layout(
      words.title,
      [
        { kind: "p", text: intro },
        { kind: "p", text: words.body },
        { kind: "button", text: "Open the queue", href: queue },
      ],
      [
        {
          kind: "muted",
          text: "You get this as an admin of Terpsicle, at most once an hour.",
        },
      ],
    ),
    headers: { "Auto-Submitted": "auto-generated" },
  };
}

const AdminRowSchema = z.object({ id: z.string(), email: z.string() });

export interface AdminAlertReport {
  /** Admins alerted this run. */
  alerted: number;
  /** Items those alerts stood for. */
  items: number;
}

/**
 * Alerts each admin to the open urgent items they haven't been told about,
 * if their last alert was an hour ago or more.
 */
export async function alertAdmins(
  env: NotifyEnv,
  options: NotifyOptions & { origin?: string },
): Promise<AdminAlertReport> {
  const report: AdminAlertReport = { alerted: 0, items: 0 };
  const open = await openUrgentItems(env.DB);
  if (open.length === 0) return report;
  const ids = adminIds({ authTestMode: env.AUTH_TEST_MODE === "true" });
  const { results } = await env.DB.prepare(
    `SELECT id, email FROM users
       WHERE id IN (SELECT value FROM json_each(?1)) AND status = 'active'`,
  )
    .bind(JSON.stringify(ids))
    .all();
  const admins = results.flatMap((r) => {
    const row = AdminRowSchema.safeParse(r);
    return row.success ? [row.data] : [];
  });
  for (const admin of admins) {
    const result = await alertOne(env, admin, open, options);
    if (result) {
      report.alerted += 1;
      report.items += result.items;
    }
  }
  return report;
}

async function alertOne(
  env: NotifyEnv,
  admin: { id: string; email: string },
  open: readonly { id: string; item: HeldItem }[],
  options: NotifyOptions & { origin?: string },
): Promise<{ items: number; result: NotifyResult } | null> {
  const last = await env.DB.prepare(
    `SELECT MAX(created_at) AS at FROM notifications
       WHERE user_id = ?1 AND type = 'admin-urgent'`,
  )
    .bind(admin.id)
    .first<{ at: string | null }>();
  if (!adminAlertDue(last?.at ?? null, options.now)) return null;
  const rowId = (itemId: string) => `admin-urgent:${admin.id}:${itemId}`;
  const { results } = await env.DB.prepare(
    `SELECT id FROM notifications
       WHERE user_id = ?1 AND id IN (SELECT value FROM json_each(?2))`,
  )
    .bind(admin.id, JSON.stringify(open.map((o) => rowId(o.id))))
    .all<{ id: string }>();
  const told = new Set(results.map((r) => r.id));
  const fresh = open.filter((o) => !told.has(rowId(o.id)));
  if (fresh.length === 0) return null;
  const items = fresh.map((o) => o.item);
  const words = heldWords(items);
  const result = await notify(
    env,
    admin.id,
    {
      type: "admin-urgent",
      key: `admin-urgent:${admin.id}:${options.now.toISOString()}`,
      inbox: fresh.map((o) => ({
        id: rowId(o.id),
        groupKey: ADMIN_URGENT_TAG,
        ...heldWords([o.item]),
        label: heldLabel(o.item),
        url: ADMIN_QUEUE_PATH,
      })),
      push: {
        event: { type: "admin-urgent", ...words },
        url: ADMIN_QUEUE_PATH,
      },
      email: {
        to: admin.email,
        ...renderHeldEmail(options.origin ?? ALERTS_ORIGIN, items),
      },
    },
    options,
  );
  return result.inbox === "new" ? { items: fresh.length, result } : null;
}
