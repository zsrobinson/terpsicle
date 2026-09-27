// What a page offers to "Include what I was doing" beyond the activity log
// (docs/FEEDBACK.md): the scheduler registers the open plan (the person's
// own, never a shared link's) and a few settings. Getters, so nothing is
// copied until someone sends feedback; plain values, so no schema loads
// with the page (the lazy sheet shapes them with `buildFeedbackContext`).
import type { PropValue } from "~/core/feedback/props";
import type { Block, Plan } from "~/core/schema";

export interface FeedbackSources {
  plan?: () => { plan: Plan; blocks: readonly Block[] } | null;
  settings?: () => Record<string, PropValue>;
}

let sources: FeedbackSources = {};

/** Offers `next` until the returned function is called (on unmount). */
export function setFeedbackSources(next: FeedbackSources): () => void {
  sources = next;
  return () => {
    if (sources === next) sources = {};
  };
}

export function feedbackSources(): FeedbackSources {
  return sources;
}
