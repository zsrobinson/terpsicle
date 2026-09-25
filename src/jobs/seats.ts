import { type Job, notImplementedYet } from "./job";

/**
 * Sections for every department of every active term → seats + changes, then
 * seat-alert emails. Runs every 5 minutes, so it has 30 s of CPU.
 */
export const runSeatsJob: Job = async ({ now }) => {
  await notImplementedYet("seats", now);
};
