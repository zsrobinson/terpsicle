// Feedback's JSON routes (docs/FEEDBACK.md), registered in
// src/server/api/router.ts:
//
//   feedback/send          anyone (reads the session if there is one)
//   feedback/undo          the sender, with the token send returned, 10 min
//   feedback/pin           admin: a pinned note on an element
//   feedback/pins          admin: the pinned notes on a route
//   admin/feedback/list    admin: the inbox
//   admin/feedback/update  admin: status, note, group; Fixed emails a reply
//   admin/feedback/delete  admin: soft for 10 seconds, for Undo
//
// Who sent an item is stored only when they asked for a reply (and for the
// owner's own notes), and never leaves the Worker: the inbox gets `reply`.
import {
  checkImage,
  decodeBase64,
  feedbackImageKey,
  feedbackPath,
  pathnameOf,
} from "~/core/feedback";
import {
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_IMAGE_MAX_SIDE,
  FEEDBACK_UNDO_MS,
  type FeedbackDeleteInput,
  type FeedbackDeleteResult,
  type FeedbackImage,
  type FeedbackListInput,
  type FeedbackListResult,
  type FeedbackPinInput,
  type FeedbackPinResult,
  type FeedbackPinsInput,
  type FeedbackPinsResult,
  type FeedbackSendInput,
  type FeedbackSendResult,
  type FeedbackUndoInput,
  type FeedbackUndoResult,
  type FeedbackUpdateInput,
  type FeedbackUpdateResult,
} from "~/core/schema/feedback";
import { ALERTS_FROM } from "../alerts/email";
import { captureServerEvent } from "../analytics";
import { apiError } from "../api/http";
import type { IdentityRouteContext } from "../auth/api";
import { randomToken, sha256Hex } from "../crypto";
import { renderFixedEmail } from "./email";
import {
  deleteFeedbackRow,
  type FeedbackRow,
  getFeedback,
  imageKeys,
  insertFeedback,
  listFeedback,
  markReplied,
  pinsOn,
  purgeDeleted,
  replyAddress,
  setDeleted,
  toItem,
  updateFeedback,
} from "./store";

export interface FeedbackEnv {
  DB: D1Database;
  /** Screenshots; without it (the seat-alert harness) they're dropped. */
  USER_CONTENT?: R2Bucket;
  /** Absent on previews: they never email anyone. */
  EMAIL?: SendEmail;
  EMAIL_SUBJECT_PREFIX?: string;
  POSTHOG_TOKEN?: string;
}

export type FeedbackContext = Pick<
  IdentityRouteContext,
  "now" | "request" | "session" | "waitUntil"
> & {
  /** Where links in emails point (`linkOrigin`). */
  origin: string;
};

/** A checked image's bytes, or null: wrong type, too big, not an image. */
function imageBytes(image: FeedbackImage): Uint8Array | null {
  const bytes = decodeBase64(image.data);
  if (!bytes || bytes.byteLength > FEEDBACK_IMAGE_MAX_BYTES) return null;
  return checkImage(bytes, image.type, FEEDBACK_IMAGE_MAX_SIDE) ? bytes : null;
}

interface Shot {
  key: string;
  bytes: Uint8Array;
  type: FeedbackImage["type"];
}

/** Checks both images first, so a bad one stores nothing at all. */
function checkShots(
  id: string,
  now: Date,
  images: { screenshot?: FeedbackImage; element?: FeedbackImage },
): { screenshot: Shot | null; element: Shot | null } | null {
  const shot = (
    image: FeedbackImage | undefined,
    which: "screenshot" | "element",
  ) => {
    if (!image) return null;
    const bytes = imageBytes(image);
    return bytes
      ? {
          key: feedbackImageKey(id, now, image.type, which),
          bytes,
          type: image.type,
        }
      : undefined;
  };
  const screenshot = shot(images.screenshot, "screenshot");
  const element = shot(images.element, "element");
  if (screenshot === undefined || element === undefined) return null;
  return { screenshot, element };
}

async function putShots(
  bucket: R2Bucket | undefined,
  shots: (Shot | null)[],
): Promise<void> {
  if (!bucket) return;
  for (const shot of shots)
    if (shot)
      await bucket.put(shot.key, shot.bytes, {
        httpMetadata: { contentType: shot.type },
      });
}

/** The deployment an item came from: terpsicle.com or a PR preview. */
const hostOf = (request: Request) => new URL(request.url).hostname;

export async function sendFeedback(
  env: FeedbackEnv,
  input: FeedbackSendInput,
  ctx: FeedbackContext,
): Promise<FeedbackSendResult | Response> {
  const id = randomToken(16);
  const shots = checkShots(id, ctx.now, { screenshot: input.screenshot });
  if (!shots) return apiError("invalid-input");
  const bucket = env.USER_CONTENT;
  const undoToken = randomToken(32);
  // Who sent it, only when they asked for a reply and are signed in.
  const userId = input.reply ? (ctx.session?.user.id ?? null) : null;
  await putShots(bucket, [shots.screenshot]);
  await insertFeedback(env.DB, {
    id,
    kind: input.kind,
    product: input.product,
    path: feedbackPath(input.path, input.kind),
    text: input.text,
    expected: input.expected ?? null,
    screenshot_key: bucket ? (shots.screenshot?.key ?? null) : null,
    element_shot_key: null,
    context: input.context ? JSON.stringify(input.context) : null,
    element: null,
    host: hostOf(ctx.request),
    user_id: userId,
    undo_hash: await sha256Hex(undoToken),
    created_at: ctx.now.toISOString(),
  });
  ctx.waitUntil?.(
    captureServerEvent(
      env,
      "feedback_received",
      {
        kind: input.kind,
        product: input.product,
        hasScreenshot: shots.screenshot !== null,
        withContext: input.context !== undefined,
        reply: userId !== null,
      },
      { now: ctx.now },
    ),
  );
  return { id, undoToken };
}

async function removeItem(env: FeedbackEnv, row: FeedbackRow): Promise<void> {
  const keys = imageKeys(row);
  if (env.USER_CONTENT && keys.length > 0) await env.USER_CONTENT.delete(keys);
  await deleteFeedbackRow(env.DB, row.id);
}

/**
 * "Undo" in the toast after sending: removes the item and its screenshot,
 * with the token only the sender's page holds, within 10 minutes.
 */
export async function undoFeedback(
  env: FeedbackEnv,
  input: FeedbackUndoInput,
  ctx: FeedbackContext,
): Promise<FeedbackUndoResult> {
  const row = await getFeedback(env.DB, input.id);
  const hash = await sha256Hex(input.undoToken);
  const fresh =
    row !== null &&
    row.undo_hash === hash &&
    ctx.now.getTime() - Date.parse(row.created_at) <= FEEDBACK_UNDO_MS;
  if (!row || !fresh) return { status: "expired" };
  await removeItem(env, row);
  return { status: "undone" };
}

/** The owner's pinned note on an element (the sheet's "Pin a note"). */
export async function pinFeedback(
  env: FeedbackEnv,
  input: FeedbackPinInput,
  ctx: FeedbackContext,
): Promise<FeedbackPinResult | Response> {
  const id = randomToken(16);
  const shots = checkShots(id, ctx.now, {
    screenshot: input.screenshot,
    element: input.elementShot,
  });
  if (!shots) return apiError("invalid-input");
  const bucket = env.USER_CONTENT;
  const undoToken = randomToken(32);
  await putShots(bucket, [shots.screenshot, shots.element]);
  await insertFeedback(env.DB, {
    id,
    kind: "review",
    product: input.product,
    path: feedbackPath(input.path, "review"),
    text: input.text,
    expected: null,
    screenshot_key: bucket ? (shots.screenshot?.key ?? null) : null,
    element_shot_key: bucket ? (shots.element?.key ?? null) : null,
    context: JSON.stringify(input.context),
    element: JSON.stringify(input.element),
    host: hostOf(ctx.request),
    user_id: ctx.session?.user.id ?? null,
    undo_hash: await sha256Hex(undoToken),
    created_at: ctx.now.toISOString(),
  });
  return { id, undoToken };
}

export async function listPins(
  env: FeedbackEnv,
  input: FeedbackPinsInput,
): Promise<FeedbackPinsResult> {
  const rows = await pinsOn(env.DB, pathnameOf(input.pathname));
  return {
    pins: rows.flatMap((row, i) => {
      const item = toItem(row);
      return item.element
        ? [
            {
              id: row.id,
              number: i + 1,
              text: row.text,
              status: row.status,
              element: item.element,
              createdAt: row.created_at,
            },
          ]
        : [];
    }),
  };
}

export async function adminListFeedback(
  env: FeedbackEnv,
  input: FeedbackListInput,
): Promise<FeedbackListResult> {
  const listed = await listFeedback(env.DB, input);
  return {
    items: listed.rows.map(toItem),
    cursor: listed.cursor,
    groups: listed.groups,
    hosts: listed.hosts,
    newCount: listed.newCount,
  };
}

/**
 * Emails "Fixed" to someone who asked for a reply, once per item. Previews
 * have no EMAIL binding, so they never send.
 */
async function sendFixedEmail(
  env: FeedbackEnv,
  row: FeedbackRow,
  ctx: FeedbackContext,
): Promise<boolean> {
  if (!env.EMAIL || row.kind === "review" || !row.user_id || row.replied_at)
    return false;
  const to = await replyAddress(env.DB, row.user_id);
  if (!to) return false;
  const email = renderFixedEmail(ctx.origin, row);
  // Marked first: a retry after a failed send never emails twice.
  await markReplied(env.DB, row.id, ctx.now);
  try {
    await env.EMAIL.send({
      to,
      from: ALERTS_FROM,
      subject: `${env.EMAIL_SUBJECT_PREFIX ?? ""}${email.subject}`,
      text: email.text,
      html: email.html,
      headers: email.headers,
    });
    return true;
  } catch (error) {
    // The code only: messages can carry the address.
    console.warn({
      email: "feedback fixed failed",
      code: String((error as { code?: unknown }).code ?? ""),
    });
    return false;
  }
}

export async function adminUpdateFeedback(
  env: FeedbackEnv,
  input: FeedbackUpdateInput,
  ctx: FeedbackContext,
): Promise<FeedbackUpdateResult> {
  const before = await getFeedback(env.DB, input.id);
  if (!before) return { status: "gone" };
  const row = await updateFeedback(
    env.DB,
    input.id,
    {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
    },
    ctx.now,
  );
  if (!row) return { status: "gone" };
  const emailed =
    before.status !== "fixed" && row.status === "fixed"
      ? await sendFixedEmail(env, row, ctx)
      : false;
  return { status: "updated", item: toItem(row), emailed };
}

export async function adminDeleteFeedback(
  env: FeedbackEnv,
  input: FeedbackDeleteInput,
  ctx: FeedbackContext,
): Promise<FeedbackDeleteResult> {
  const status = await setDeleted(env.DB, input.id, !input.restore, ctx.now);
  // Earlier deletes whose Undo has passed go for good now.
  await purgeDeleted(env.DB, env.USER_CONTENT, ctx.now);
  return { status };
}
