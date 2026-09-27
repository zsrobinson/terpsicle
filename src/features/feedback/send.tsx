import { recentActivity } from "~/app/activity-log";
import { track } from "~/app/analytics";
import { feedbackSources } from "~/app/feedback-sources";
import { scrubUrl } from "~/core/analytics/scrub";
import { buildFeedbackContext, feedbackPlan } from "~/core/feedback/context";
import type {
  FeedbackContext,
  FeedbackProduct,
  FeedbackSendKind,
} from "~/core/schema/feedback";
import { ApiCallError } from "~/server/fns/api";
import { feedbackApi } from "~/server/fns/feedback-api";
import { dismissToast, noteToast, undoToast } from "~/ui/toast";
import { type FeedbackDraft, useDraft } from "./draft-store";
import { base64Of } from "./screenshot";

// Sending from the sheet: the payload, the words for what went wrong, and
// the "Sent" toast whose Undo takes it back (docs/FEEDBACK.md).

/** The build, from vite.config.ts; "dev" in tests. */
export const APP_VERSION =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

export function currentTheme(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** The page's path and search as feedback keeps it (no share link's plan). */
export function feedbackPagePath(): string {
  return scrubUrl(window.location.pathname + window.location.search) || "/";
}

/** "What I was doing", from the log and whatever the page offers. */
export function gatherContext(now = new Date()): FeedbackContext {
  const sources = feedbackSources();
  const own = sources.plan?.() ?? null;
  return buildFeedbackContext(
    {
      version: APP_VERSION,
      userAgent: navigator.userAgent,
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        dpr: window.devicePixelRatio || 1,
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      online: navigator.onLine,
      theme: currentTheme(),
      url: window.location.pathname + window.location.search,
      actions: recentActivity(),
      plan: own ? feedbackPlan(own.plan, own.blocks) : null,
      settings: sources.settings?.() ?? {},
    },
    now,
  );
}

export const TOO_BIG =
  "Your screenshot's too big to send. Crop it or send without it.";

/**
 * What to say when sending didn't work. The Worker refuses a screenshot it
 * can't take as "invalid-input", the only thing the sheet can get wrong.
 */
export function sendFailure(error: unknown, withShot: boolean): string {
  if (error instanceof ApiCallError) {
    if (error.reason === "rate-limited")
      return "You've sent a lot of feedback in the last hour. Try again later.";
    if (error.reason === "network")
      return "Couldn't send. Check your connection and try again.";
    if (error.reason === "invalid-input")
      return withShot
        ? TOO_BIG
        : "Couldn't send that. Shorten it a little and try again.";
  }
  return "Couldn't send just now. Try again in a moment.";
}

/**
 * Sends the draft. Resolves once it's sent (the sheet closes and the toast
 * offers Undo); throws with words for the sheet when it isn't.
 */
export async function sendDraft(
  draft: FeedbackDraft,
  product: FeedbackProduct,
  signedIn: boolean,
): Promise<void> {
  if (draft.mode === "pin") return;
  const kind: FeedbackSendKind = draft.mode;
  const shot =
    draft.includeShot && draft.shot.status === "ready" ? draft.shot.shot : null;
  const expected = kind === "bug" ? draft.expected.trim() : "";
  const reply = signedIn && draft.reply;
  const context = draft.includeContext ? gatherContext() : undefined;
  const result = await feedbackApi.send({
    kind,
    product,
    path: feedbackPagePath(),
    text: draft.text.trim(),
    ...(expected ? { expected } : {}),
    ...(shot
      ? { screenshot: { type: shot.type, data: await base64Of(shot.blob) } }
      : {}),
    ...(context ? { context } : {}),
    reply,
  });
  track("feedback_sent", {
    kind,
    product,
    hasScreenshot: shot !== null,
    withContext: context !== undefined,
    reply,
  });
  const words = {
    mode: draft.mode,
    text: draft.text,
    expected: draft.expected,
  };
  useDraft.getState().clear();
  const toastId = `feedback-sent-${result.id}`;
  const undo = async () => {
    dismissToast(toastId);
    try {
      const { status } = await feedbackApi.undo({
        id: result.id,
        undoToken: result.undoToken,
      });
      if (status !== "undone") {
        noteToast("Too late to undo: it's already with us.");
        return;
      }
      track("feedback_undone", {});
      useDraft.getState().restore(words);
      noteToast("Unsent. Your words are back in Send feedback.");
    } catch {
      noteToast("Couldn't undo. Check your connection and try again.");
    }
  };
  undoToast({
    id: toastId,
    message: "Sent. Thanks for telling us.",
    onUndo: () => void undo(),
  });
}
