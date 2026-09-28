// Worker-test helper (imported only by *.test.ts): what a device's fake push
// service decrypted, read as a browser would.
import { expect } from "vitest";
import { pushMessage } from "~/core/push";
import { type PushPayload, PushPayloadSchema } from "~/core/schema";
import { PUSH_LINK_ORIGIN } from "./send";

/**
 * The payload a push carried, after checking the message around it is the
 * same notification as Declarative Web Push (V2 §6.7), with production's
 * links. Null when nothing could be decrypted.
 */
export function payloadOf(plain: Uint8Array | null): PushPayload | null {
  if (!plain) return null;
  const message: unknown = JSON.parse(new TextDecoder().decode(plain));
  const payload = PushPayloadSchema.parse(message);
  expect(message).toEqual(pushMessage(payload, PUSH_LINK_ORIGIN));
  return payload;
}
