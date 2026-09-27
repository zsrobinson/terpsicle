// Feedback's client (docs/FEEDBACK.md), apart from ./api so no page loads
// its schemas up front: only the lazy feedback sheet and the admin's pins
// import it.
import type { z } from "zod";
import {
  FeedbackPinInputSchema,
  FeedbackPinResultSchema,
  FeedbackPinsInputSchema,
  FeedbackPinsResultSchema,
  FeedbackSendInputSchema,
  FeedbackSendResultSchema,
  FeedbackUndoInputSchema,
  FeedbackUndoResultSchema,
} from "~/core/schema/feedback";
import { type ApiOptions, call } from "./api";

export const feedbackApi = {
  /** Sends a bug or an idea; the result's token undoes it for 10 minutes. */
  send: (
    input: z.input<typeof FeedbackSendInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "feedback/send",
      FeedbackSendInputSchema,
      FeedbackSendResultSchema,
      input,
      options,
    ),
  /** Takes back what `send` or `pin` sent, with its token. */
  undo: (
    input: z.input<typeof FeedbackUndoInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "feedback/undo",
      FeedbackUndoInputSchema,
      FeedbackUndoResultSchema,
      input,
      options,
    ),
  /** Admin: a note pinned on an element. */
  pin: (input: z.input<typeof FeedbackPinInputSchema>, options?: ApiOptions) =>
    call(
      "feedback/pin",
      FeedbackPinInputSchema,
      FeedbackPinResultSchema,
      input,
      options,
    ),
  /** Admin: the notes pinned on a route. */
  pins: (
    input: z.input<typeof FeedbackPinsInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "feedback/pins",
      FeedbackPinsInputSchema,
      FeedbackPinsResultSchema,
      input,
      options,
    ),
};
