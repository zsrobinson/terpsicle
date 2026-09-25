import { type Job, notImplementedYet } from "./job";

/** The provost academic calendar, and the building join for new codes. */
export const runCalendarBuildingsJob: Job = async ({ now }) => {
  await notImplementedYet("calendar-buildings", now);
};
