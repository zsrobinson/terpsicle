import { type Job, notImplementedYet } from "./job";

/**
 * Testudo's term list → terms.json; per term: departments, courses and
 * sections → per-department chunks + manifest. Archives terms Testudo dropped.
 */
export const runCatalogJob: Job = async ({ now }) => {
  await notImplementedYet("catalog", now);
};
