// What a push carries on the wire (V2 §6.7): our payload, and the same
// notification in Declarative Web Push's shape, so Safari on iOS 18.4+
// shows it even when our service worker doesn't run. `mutable: true` hands
// it to our service worker where it does run, which groups it per tag
// (src/server/service-worker.ts).
import {
  DECLARATIVE_WEB_PUSH,
  type PushMessage,
  type PushPayload,
} from "../schema";
import { utf8 } from "./bytes";

/** V2 §6.4: a push is at most 3 KB, well inside one record. */
export const PUSH_MESSAGE_MAX_BYTES = 3072;

const ELLIPSIS = "…";

function withBody(
  payload: PushPayload,
  body: string,
  origin: string,
): PushMessage {
  const { badge } = payload;
  return {
    // The payload's own members stay at the top level, as before: every
    // service worker already installed reads them (and ignores the rest).
    ...payload,
    body,
    web_push: DECLARATIVE_WEB_PUSH,
    notification: {
      title: payload.title,
      body,
      navigate: new URL(payload.url, origin).href,
      tag: payload.tag,
      ...(badge === undefined ? {} : { app_badge: String(badge) }),
    },
    mutable: true,
    ...(badge === undefined ? {} : { app_badge: badge }),
  };
}

const bytes = (message: object) => utf8(JSON.stringify(message)).length;

/**
 * The message for `payload`, with links on `origin` ("https://terpsicle.com").
 * The body is said twice, so a long one is cut (with "…") to keep the
 * message within {@link PUSH_MESSAGE_MAX_BYTES}. One that can't fit even
 * without its body goes as the plain payload, which always could.
 */
export function pushMessage(
  payload: PushPayload,
  origin: string,
): PushMessage | PushPayload {
  const whole = withBody(payload, payload.body, origin);
  if (bytes(whole) <= PUSH_MESSAGE_MAX_BYTES) return whole;
  if (bytes(withBody(payload, ELLIPSIS, origin)) > PUSH_MESSAGE_MAX_BYTES)
    return payload;
  // Code points, so a cut never splits an emoji. The most that fits, by
  // bisection: at most nine tries for a 400-character body.
  const chars = Array.from(payload.body);
  let fits = 0;
  let over = chars.length;
  while (over - fits > 1) {
    const mid = Math.floor((fits + over) / 2);
    const body = `${chars.slice(0, mid).join("").trimEnd()}${ELLIPSIS}`;
    if (bytes(withBody(payload, body, origin)) <= PUSH_MESSAGE_MAX_BYTES)
      fits = mid;
    else over = mid;
  }
  return withBody(
    payload,
    `${chars.slice(0, fits).join("").trimEnd()}${ELLIPSIS}`,
    origin,
  );
}
