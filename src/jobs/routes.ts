import { type Job, notImplementedYet } from "./job";

/**
 * Fills in missing building-pair routes, a bounded chunk per run. Progress
 * lives in R2 so the next run resumes where this one stopped.
 */
export const runRoutesJob: Job = async ({ now }) => {
  await notImplementedYet("routes", now);
};
