// The generator's public API. The worker and tests import this barrel; UI
// code imports the module it needs (~/core/generate/draft, …) so the search
// itself stays out of the page's eager bundle (scripts/check-bundle.ts).
export {
  candidateGroups,
  equivalenceKey,
  type QualityMap,
  type SectionGroup,
  type SectionQuality,
} from "./candidates";
export {
  chosenCourses,
  differencesFrom,
  freeWeekdays,
  hasChoices,
  type SectionDifference,
} from "./describe";
export {
  activeMustHaves,
  draftCourseCodes,
  relaxDraft,
  requestItems,
} from "./draft";
export * from "./generate";
export { mergeSameWeek, sectionTimesKey } from "./merge";
export { nearMisses } from "./near-miss";
export { sectionQuality } from "./quality";
export { changesFrom, type PlanChange, resultCourses } from "./result-plan";
export * from "./score";
export { type SolveProgress, solve } from "./solve";
