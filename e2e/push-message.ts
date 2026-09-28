import { expect } from "@playwright/test";
import { pushMessage } from "../src/core/push";
import { type PushPayload, PushPayloadSchema } from "../src/core/schema";

/** Where a declarative push links: production, wherever it was sent from. */
const PUSH_LINK_ORIGIN = "https://terpsicle.com";

/**
 * The payload a decrypted push carried, after checking the message around
 * it says the same notification as Declarative Web Push (V2 §6.7).
 */
export function payloadOf(message: unknown): PushPayload {
  const payload = PushPayloadSchema.parse(message);
  expect(message).toEqual(pushMessage(payload, PUSH_LINK_ORIGIN));
  return payload;
}
